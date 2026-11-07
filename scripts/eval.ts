import fs from "fs";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";

// Load .env.local before importing app modules
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();

import { APP_CONFIG } from "../src/config/app-config";
import {
  checkSafetyKeywords,
  evaluateAnswerSafety,
  SafetyDecisionStatus,
  SafetyEvaluationResult,
} from "../src/lib/safety";
import {
  AdherenceCategory,
  DurationTaken,
  EffectCategory,
  extractAnswerUnderstanding,
  ExtractionOutput,
  FieldStates,
  InterviewQuestionCategory,
  OnsetAfterStartingCategory,
  StoppedByCategory,
  StoppingReasonCategory,
} from "../src/lib/extraction";

interface ExpectedExpressionFixture {
  originalPhrase: string;
  matchedLexiconTerm: string | null;
  requiresDisambiguation: boolean;
  expectedMeanings: string[];
}

interface EvalFixture {
  id: string;
  language: "hi" | "hinglish" | "en";
  questionCategory: InterviewQuestionCategory;
  answerText: string;
  simulateClassifierFailure: "TIMEOUT" | "INVALID_JSON" | null;
  tags?: string[];
  expected: {
    safetyStatus: SafetyDecisionStatus;
    adherence: AdherenceCategory | null;
    effect: EffectCategory | null;
    onsetAfterStarting: OnsetAfterStartingCategory | null;
    durationTaken: DurationTaken | null;
    scheduleText: string | null;
    stoppingReason: StoppingReasonCategory | null;
    stoppedBy: StoppedByCategory | null;
    fieldStates: FieldStates | null;
    expectedExpressions: ExpectedExpressionFixture[];
  };
}

interface CachedFixtureEvaluation {
  hash: string;
  timestamp: string;
  safetyResult: SafetyEvaluationResult;
  extractionResult: ExtractionOutput | null;
}

type EvalCacheMap = Record<string, CachedFixtureEvaluation>;
type ConfusionMatrix = Record<string, Record<string, number>>;

const FIXTURES_PATH = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "eval-fixtures.json"
);
const CACHE_PATH = path.join(process.cwd(), "tests", ".eval-cache.json");

function computeFixtureHash(fixture: EvalFixture): string {
  const payload = JSON.stringify({
    answerText: fixture.answerText,
    questionCategory: fixture.questionCategory,
    simulateClassifierFailure: fixture.simulateClassifierFailure,
    models: APP_CONFIG.models,
    schemaVersion: "v3-onset-duration-fieldstates-stoppedby",
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function loadEvalCache(): EvalCacheMap {
  if (!fs.existsSync(CACHE_PATH)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8")) as EvalCacheMap;
  } catch {
    return {};
  }
}

function saveEvalCache(cache: EvalCacheMap): void {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, JSON.stringify ? 2 : 2), "utf-8");
}

function recordConfusion(
  matrix: ConfusionMatrix,
  expected: string,
  actual: string
): void {
  if (!matrix[expected]) {
    matrix[expected] = {};
  }
  matrix[expected][actual] = (matrix[expected][actual] ?? 0) + 1;
}

function printConfusionMatrix(title: string, matrix: ConfusionMatrix): void {
  const labels = Array.from(
    new Set([
      ...Object.keys(matrix),
      ...Object.values(matrix).flatMap((row) => Object.keys(row)),
    ])
  );
  if (labels.length === 0) return;

  console.log(`\n  Confusion Table: ${title} (Rows = Expected, Cols = Predicted)`);
  const colWidth = Math.max(14, ...labels.map((l) => l.length + 2));
  const pad = (s: string) => s.padEnd(colWidth, " ");

  const header = `    ${pad("Expected \\ Pred")} | ${labels.map(pad).join(" | ")}`;
  console.log(header);
  console.log(`    ${"-".repeat(header.length - 4)}`);

  for (const exp of labels) {
    const rowCells = labels.map((pred) =>
      pad(String(matrix[exp]?.[pred] ?? 0))
    );
    console.log(`    ${pad(exp)} | ${rowCells.join(" | ")}`);
  }
}

interface DualFieldCounter {
  allTotal: number;
  allCorrect: number;
  statedTotal: number;
  statedCorrect: number;
  confusion: ConfusionMatrix;
}

function createCounter(): DualFieldCounter {
  return {
    allTotal: 0,
    allCorrect: 0,
    statedTotal: 0,
    statedCorrect: 0,
    confusion: {},
  };
}

function scoreCategoricalField(
  counter: DualFieldCounter,
  expected: string,
  actual: string,
  notMentionedSentinel = "not_mentioned"
): void {
  counter.allTotal += 1;
  if (expected === actual) {
    counter.allCorrect += 1;
  }
  if (expected !== notMentionedSentinel) {
    counter.statedTotal += 1;
    if (expected === actual) {
      counter.statedCorrect += 1;
    }
  }
  recordConfusion(counter.confusion, expected, actual);
}

function normalizeOptionsArray(arr: string[]): string[] {
  return arr.map((s) => s.trim().toLowerCase()).sort();
}

function optionsMatch(expected: string[], actual: string[]): boolean {
  if (expected.length !== actual.length) return false;
  const normExp = normalizeOptionsArray(expected);
  const normAct = normalizeOptionsArray(actual);
  return normExp.every((val, idx) => normAct[idx]?.includes(val) || val.includes(normAct[idx] ?? ""));
}

async function main() {
  const args = process.argv.slice(2);
  const noCache = args.includes("--no-cache");

  const fixtures = JSON.parse(
    fs.readFileSync(FIXTURES_PATH, "utf-8")
  ) as EvalFixture[];
  const cache = noCache ? {} : loadEvalCache();

  console.log("==============================================================");
  console.log("  treatment-timeline Evaluation Harness (Phase 1)");
  console.log("==============================================================");
  console.log(`Fixtures loaded : ${fixtures.length}`);
  console.log(
    `Safety model    : ${APP_CONFIG.models.safetyClassifier} (temp=${APP_CONFIG.models.safetyTemperature})`
  );
  console.log(
    `Extraction model: ${APP_CONFIG.models.extraction} (temp=${APP_CONFIG.models.extractionTemperature})`
  );
  console.log(`Queue min gap   : ${APP_CONFIG.api.minGapBetweenCallsMs}ms`);
  console.log(
    `Cache mode      : ${
      noCache ? "DISABLED (--no-cache)" : "ENABLED (tests/.eval-cache.json)"
    }`
  );
  console.log("--------------------------------------------------------------\n");

  const safetyMisses: string[] = [];
  const unexpectedFalseAlarms: string[] = [];
  const knownFalseAlarmsReport: string[] = [];
  const failSafeErrors: string[] = [];
  const classifierOnlyKeywordErrors: string[] = [];

  const safetyConfusion: ConfusionMatrix = {};
  let safetyStatusCorrect = 0;

  const adherenceCounter = createCounter();
  const effectCounter = createCounter();
  const onsetCounter = createCounter();
  const stoppingReasonCounter = createCounter();
  const stoppedByCounter = createCounter();
  const fieldStateCounter = createCounter();
  const durationTakenCounter = createCounter();

  let statedOptionsTotal = 0;
  let statedOptionsCorrect = 0;

  let expectedExpressionsTotal = 0;
  let originalPhraseMatched = 0;
  let lexiconMatched = 0;
  let disambiguationMatched = 0;

  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    const tags = fixture.tags ?? [];
    const isKnownFalseAlarm = tags.includes("known_false_alarm");
    const isClassifierOnly = tags.includes("classifier_only");

    // Requirement 1: Assert that every "classifier_only" fixture has zero keyword matches
    if (isClassifierOnly) {
      const kwCheck = checkSafetyKeywords(fixture.answerText);
      if (kwCheck.matched) {
        classifierOnlyKeywordErrors.push(
          `${fixture.id}: Tagged "classifier_only" but matched keyword "${kwCheck.matchedPhrase}"`
        );
      }
    }

    const hash = computeFixtureHash(fixture);
    const cached = !noCache ? cache[fixture.id] : undefined;

    let safetyResult: SafetyEvaluationResult;
    let extractionResult: ExtractionOutput | null = null;
    let usedCache = false;

    if (cached && cached.hash === hash) {
      safetyResult = cached.safetyResult;
      extractionResult = cached.extractionResult;
      usedCache = true;
    } else {
      safetyResult = await evaluateAnswerSafety(fixture.answerText, {
        simulateClassifierFailure: fixture.simulateClassifierFailure,
        questionCategory: fixture.questionCategory,
        skipDbLog: true,
      });

      if (safetyResult.status === "safe") {
        extractionResult = await extractAnswerUnderstanding(
          fixture.answerText,
          fixture.questionCategory
        );
      }

      cache[fixture.id] = {
        hash,
        timestamp: new Date().toISOString(),
        safetyResult,
        extractionResult,
      };
      saveEvalCache(cache);
    }

    const sourceTag = usedCache ? "[CACHE]" : "[API]  ";
    const statusMatch = safetyResult.status === fixture.expected.safetyStatus;
    if (statusMatch) {
      safetyStatusCorrect += 1;
    }
    recordConfusion(
      safetyConfusion,
      fixture.expected.safetyStatus,
      safetyResult.status
    );

    if (isKnownFalseAlarm) {
      knownFalseAlarmsReport.push(
        `${fixture.id}: status="${safetyResult.status}", whichCheckFired="${safetyResult.whichCheckFired}", matchedKeyword="${safetyResult.matchedKeyword}", classifierLabel="${safetyResult.classifierLabel}"`
      );
    }

    if (
      fixture.expected.safetyStatus === "urgent" &&
      safetyResult.status !== "urgent"
    ) {
      safetyMisses.push(
        `${fixture.id}: Expected URGENT but got "${safetyResult.status}" (whichCheckFired=${safetyResult.whichCheckFired}, text: "${fixture.answerText}")`
      );
    }

    if (
      fixture.expected.safetyStatus === "safe" &&
      safetyResult.status === "urgent"
    ) {
      unexpectedFalseAlarms.push(
        `${fixture.id}: Expected SAFE but triggered URGENT via whichCheckFired="${safetyResult.whichCheckFired}" (matchedKeyword=${safetyResult.matchedKeyword}, classifierLabel=${safetyResult.classifierLabel})`
      );
    }

    if (
      fixture.expected.safetyStatus === "fail_safe" &&
      (safetyResult.status !== "fail_safe" || extractionResult !== null)
    ) {
      failSafeErrors.push(
        `${fixture.id}: Expected FAIL_SAFE with blocked extraction, but got status="${safetyResult.status}" (whichCheckFired=${safetyResult.whichCheckFired})`
      );
    }

    // Score structured fields & expressions for non-urgent (safe) fixtures
    if (fixture.expected.safetyStatus === "safe" && extractionResult) {
      if (fixture.expected.adherence) {
        scoreCategoricalField(
          adherenceCounter,
          fixture.expected.adherence,
          extractionResult.adherence
        );
      }
      if (fixture.expected.effect) {
        scoreCategoricalField(
          effectCounter,
          fixture.expected.effect,
          extractionResult.effect
        );
      }
      if (fixture.expected.onsetAfterStarting) {
        scoreCategoricalField(
          onsetCounter,
          fixture.expected.onsetAfterStarting,
          extractionResult.onsetAfterStarting
        );
      }
      if (fixture.expected.stoppingReason) {
        scoreCategoricalField(
          stoppingReasonCounter,
          fixture.expected.stoppingReason,
          extractionResult.stoppingReason
        );
      }
      if (fixture.expected.stoppedBy) {
        scoreCategoricalField(
          stoppedByCounter,
          fixture.expected.stoppedBy,
          extractionResult.stoppedBy
        );
      }

      if (fixture.expected.durationTaken) {
        const expDurLabel =
          fixture.expected.durationTaken.value === null &&
          fixture.expected.durationTaken.state === "known"
            ? "not_mentioned"
            : `${fixture.expected.durationTaken.state}:${fixture.expected.durationTaken.value ?? "null"}`;

        const actDurLabel =
          extractionResult.durationTaken.value === null &&
          extractionResult.durationTaken.state === "known"
            ? "not_mentioned"
            : `${extractionResult.durationTaken.state}:${extractionResult.durationTaken.value ?? "null"}`;

        scoreCategoricalField(durationTakenCounter, expDurLabel, actDurLabel);
      }

      if (fixture.expected.fieldStates) {
        const keys: (keyof FieldStates)[] = [
          "dose",
          "durationTaken",
          "adherence",
          "effect",
          "sideEffects",
          "stoppingReason",
        ];
        for (const k of keys) {
          const expEntry = fixture.expected.fieldStates[k];
          const actEntry = extractionResult.fieldStates[k];
          scoreCategoricalField(
            fieldStateCounter,
            expEntry.state,
            actEntry.state,
            "known"
          );

          if (expEntry.state === "uncertain") {
            statedOptionsTotal += 1;
            if (
              actEntry.state === "uncertain" &&
              optionsMatch(expEntry.statedOptions, actEntry.statedOptions)
            ) {
              statedOptionsCorrect += 1;
            }
          }
        }
      }

      for (const expExpr of fixture.expected.expectedExpressions) {
        expectedExpressionsTotal += 1;

        const matchedExpr = extractionResult.expressions.find(
          (actual) =>
            actual.originalPhrase
              .toLowerCase()
              .includes(expExpr.originalPhrase.toLowerCase()) ||
            expExpr.originalPhrase
              .toLowerCase()
              .includes(actual.originalPhrase.toLowerCase()) ||
            (expExpr.matchedLexiconTerm !== null &&
              actual.matchedLexiconTerm === expExpr.matchedLexiconTerm)
        );

        if (matchedExpr) {
          if (
            matchedExpr.originalPhrase
              .toLowerCase()
              .includes(expExpr.originalPhrase.toLowerCase()) ||
            expExpr.originalPhrase
              .toLowerCase()
              .includes(matchedExpr.originalPhrase.toLowerCase())
          ) {
            originalPhraseMatched += 1;
          }

          if (matchedExpr.matchedLexiconTerm === expExpr.matchedLexiconTerm) {
            lexiconMatched += 1;
          }

          const hasMultipleMeanings = matchedExpr.candidateMeanings.length > 1;
          if (hasMultipleMeanings === expExpr.requiresDisambiguation) {
            disambiguationMatched += 1;
          }
        }
      }
    }

    console.log(
      `${sourceTag} (${String(i + 1).padStart(2, "0")}/${fixtures.length}) ${
        fixture.id
      }\n         safety=${safetyResult.status} (expected=${
        fixture.expected.safetyStatus
      }) | checkFired=${safetyResult.whichCheckFired}${
        safetyResult.matchedKeyword
          ? ` [kw="${safetyResult.matchedKeyword}"]`
          : ""
      }${
        safetyResult.classifierLabel
          ? ` [cls="${safetyResult.classifierLabel}"]`
          : ""
      } -> ${statusMatch ? "PASS" : "FAIL"}`
    );
  }

  const pct = (num: number, den: number) =>
    den === 0 ? "N/A (0/0)" : `${((num / den) * 100).toFixed(1)}% (${num}/${den})`;

  const formatDual = (c: DualFieldCounter, nonDefaultLabel = "Stated (!= not_mentioned)") =>
    `(a) All: ${pct(c.allCorrect, c.allTotal)} | (b) ${nonDefaultLabel}: ${pct(
      c.statedCorrect,
      c.statedTotal
    )}`;

  console.log("\n==============================================================");
  console.log("  Accuracy Report per Field — (a) All vs (b) Stated Only");
  console.log("==============================================================");
  console.log(
    `1. Safety & Fail-Safe Status : ${pct(safetyStatusCorrect, fixtures.length)}`
  );
  console.log(`2. Adherence                 : ${formatDual(adherenceCounter)}`);
  console.log(`3. Effect                    : ${formatDual(effectCounter)}`);
  console.log(`4. Onset After Starting      : ${formatDual(onsetCounter)}`);
  console.log(`5. Duration Taken            : ${formatDual(durationTakenCounter)}`);
  console.log(`6. Reason for Stopping       : ${formatDual(stoppingReasonCounter)}`);
  console.log(`7. Stopped By (Self/Clin.)   : ${formatDual(stoppedByCounter)}`);
  console.log(
    `8. 3-State Certainty (6x)    : ${formatDual(
      fieldStateCounter,
      "Uncertain/Unknown (!= known)"
    )}`
  );
  console.log(
    `9. Uncertain statedOptions   : ${pct(
      statedOptionsCorrect,
      statedOptionsTotal
    )}`
  );
  console.log(
    `10. Original Phrase Extract. : ${pct(
      originalPhraseMatched,
      expectedExpressionsTotal
    )}`
  );
  console.log(
    `11. Lexicon Term Alignment   : ${pct(
      lexiconMatched,
      expectedExpressionsTotal
    )}`
  );
  console.log(
    `12. Multi-Meaning Disambig.  : ${pct(
      disambiguationMatched,
      expectedExpressionsTotal
    )}`
  );

  console.log("\n==============================================================");
  console.log("  Confusion Tables per Categorical Field");
  console.log("==============================================================");
  printConfusionMatrix("safetyStatus", safetyConfusion);
  printConfusionMatrix("adherence", adherenceCounter.confusion);
  printConfusionMatrix("effect", effectCounter.confusion);
  printConfusionMatrix("onsetAfterStarting", onsetCounter.confusion);
  printConfusionMatrix("stoppingReason", stoppingReasonCounter.confusion);
  printConfusionMatrix("stoppedBy", stoppedByCounter.confusion);
  printConfusionMatrix("fieldStates (known | uncertain | unknown)", fieldStateCounter.confusion);

  console.log("\n--------------------------------------------------------------");
  console.log(
    `Classifier-Only Keyword Isolation Check (${classifierOnlyKeywordErrors.length} errors):`
  );
  if (classifierOnlyKeywordErrors.length === 0) {
    console.log("  PASS: All 'classifier_only' fixtures had 0 keyword matches.");
  } else {
    for (const err of classifierOnlyKeywordErrors) {
      console.log(`  - [ERROR] ${err}`);
    }
  }

  console.log(`\nSafety Misses (${safetyMisses.length}):`);
  if (safetyMisses.length === 0) {
    console.log("  None (0 safety misses)");
  } else {
    for (const miss of safetyMisses) {
      console.log(`  - [MISS] ${miss}`);
    }
  }

  console.log(`\nUnexpected False Alarms (${unexpectedFalseAlarms.length}):`);
  if (unexpectedFalseAlarms.length === 0) {
    console.log("  None (0 unexpected false alarms)");
  } else {
    for (const alarm of unexpectedFalseAlarms) {
      console.log(`  - [FALSE ALARM] ${alarm}`);
    }
  }

  console.log(
    `\nKnown False Alarms by Design (${knownFalseAlarmsReport.length}):`
  );
  if (knownFalseAlarmsReport.length === 0) {
    console.log("  None");
  } else {
    for (const kfa of knownFalseAlarmsReport) {
      console.log(`  - [KNOWN_FALSE_ALARM] ${kfa}`);
    }
  }

  console.log(
    `\nFail-Safe Simulation Checks (${failSafeErrors.length} errors):`
  );
  if (failSafeErrors.length === 0) {
    console.log("  All simulated classifier failures behaved as expected.");
  } else {
    for (const err of failSafeErrors) {
      console.log(`  - [FAIL-SAFE ERROR] ${err}`);
    }
  }
  console.log("==============================================================\n");

  if (
    classifierOnlyKeywordErrors.length > 0 ||
    safetyMisses.length > 0 ||
    unexpectedFalseAlarms.length > 0 ||
    failSafeErrors.length > 0
  ) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Evaluation script failed:", err);
  process.exit(1);
});
