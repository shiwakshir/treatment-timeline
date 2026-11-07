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
  AdherenceValue,
  EffectValue,
  extractAnswerUnderstanding,
  ExtractionOutput,
  FieldStateStatus,
  InterviewQuestionCategory,
  OnsetAfterStartingValue,
  SideEffectsValue,
  StoppedByValue,
  StoppingReasonValue,
} from "../src/lib/extraction";

interface StructuredFieldFixture<T = string> {
  state: FieldStateStatus;
  value: T | null;
  statedOptions: string[];
}

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
    adherence: StructuredFieldFixture<AdherenceValue> | null;
    effect: StructuredFieldFixture<EffectValue> | null;
    sideEffects: StructuredFieldFixture<SideEffectsValue> | null;
    stoppingReason: StructuredFieldFixture<StoppingReasonValue> | null;
    stoppedBy: StructuredFieldFixture<StoppedByValue> | null;
    dose: StructuredFieldFixture<string> | null;
    durationTaken: StructuredFieldFixture<string> | null;
    onsetAfterStarting: StructuredFieldFixture<OnsetAfterStartingValue> | null;
    doseTimingText: string | null;
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
    schemaVersion: "v4-unified-field-objects-no-freetext-readback",
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
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
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

  console.log(
    `\n  Confusion Table: ${title} (Rows = Expected, Cols = Predicted)`
  );
  const colWidth = Math.max(16, ...labels.map((l) => l.length + 2));
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

function normalizeOptionsArray(arr: string[]): string[] {
  return arr.map((s) => s.trim().toLowerCase()).sort();
}

function optionsMatch(expected: string[], actual: string[]): boolean {
  if (expected.length !== actual.length) return false;
  const normExp = normalizeOptionsArray(expected);
  const normAct = normalizeOptionsArray(actual);
  return normExp.every(
    (val, idx) =>
      normAct[idx]?.includes(val) || val.includes(normAct[idx] ?? "")
  );
}

function formatFieldLabel(f: StructuredFieldFixture<unknown>): string {
  if (f.state === "known") {
    return `known:${String(f.value ?? "")}`;
  }
  if (f.state === "uncertain") {
    return `uncertain:[${f.statedOptions.join(",")}]`;
  }
  return f.state; // "unknown" | "not_mentioned"
}

function isFieldEqual(
  expected: StructuredFieldFixture<unknown>,
  actual: StructuredFieldFixture<unknown>
): boolean {
  if (expected.state !== actual.state) return false;
  if (expected.state === "known") {
    return (
      String(expected.value ?? "").toLowerCase() ===
      String(actual.value ?? "").toLowerCase()
    );
  }
  if (expected.state === "uncertain") {
    return optionsMatch(expected.statedOptions, actual.statedOptions);
  }
  return actual.value === null && actual.statedOptions.length === 0;
}

function scoreUnifiedField(
  counter: DualFieldCounter,
  expected: StructuredFieldFixture<unknown>,
  actual: StructuredFieldFixture<unknown>
): void {
  const matched = isFieldEqual(expected, actual);
  counter.allTotal += 1;
  if (matched) {
    counter.allCorrect += 1;
  }

  if (expected.state !== "not_mentioned") {
    counter.statedTotal += 1;
    if (matched) {
      counter.statedCorrect += 1;
    }
  }

  const expLabel = formatFieldLabel(expected);
  const actLabel = matched ? expLabel : formatFieldLabel(actual);
  recordConfusion(counter.confusion, expLabel, actLabel);
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
  const sideEffectsCounter = createCounter();
  const stoppingReasonCounter = createCounter();
  const stoppedByCounter = createCounter();
  const doseCounter = createCounter();
  const durationTakenCounter = createCounter();
  const onsetCounter = createCounter();

  let expectedExpressionsTotal = 0;
  let originalPhraseMatched = 0;
  let lexiconMatched = 0;
  let disambiguationMatched = 0;

  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    const tags = fixture.tags ?? [];
    const isKnownFalseAlarm = tags.includes("known_false_alarm");
    const isClassifierOnly = tags.includes("classifier_only");

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

      if (safetyResult.classifierLabel !== "ERROR:MISSING_API_KEY") {
        cache[fixture.id] = {
          hash,
          timestamp: new Date().toISOString(),
          safetyResult,
          extractionResult,
        };
        saveEvalCache(cache);
      }
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
        `${fixture.id}: Expected URGENT but got "${safetyResult.status}" (whichCheckFired=${safetyResult.whichCheckFired}, failure=${safetyResult.failureReason ?? "none"})`
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

    if (fixture.expected.safetyStatus === "safe" && extractionResult) {
      if (fixture.expected.adherence) {
        scoreUnifiedField(
          adherenceCounter,
          fixture.expected.adherence,
          extractionResult.adherence
        );
      }
      if (fixture.expected.effect) {
        scoreUnifiedField(
          effectCounter,
          fixture.expected.effect,
          extractionResult.effect
        );
      }
      if (fixture.expected.sideEffects) {
        scoreUnifiedField(
          sideEffectsCounter,
          fixture.expected.sideEffects,
          extractionResult.sideEffects
        );
      }
      if (fixture.expected.stoppingReason) {
        scoreUnifiedField(
          stoppingReasonCounter,
          fixture.expected.stoppingReason,
          extractionResult.stoppingReason
        );
      }
      if (fixture.expected.stoppedBy) {
        scoreUnifiedField(
          stoppedByCounter,
          fixture.expected.stoppedBy,
          extractionResult.stoppedBy
        );
      }
      if (fixture.expected.dose) {
        scoreUnifiedField(
          doseCounter,
          fixture.expected.dose,
          extractionResult.dose
        );
      }
      if (fixture.expected.durationTaken) {
        scoreUnifiedField(
          durationTakenCounter,
          fixture.expected.durationTaken,
          extractionResult.durationTaken
        );
      }
      if (fixture.expected.onsetAfterStarting) {
        scoreUnifiedField(
          onsetCounter,
          fixture.expected.onsetAfterStarting,
          extractionResult.onsetAfterStarting
        );
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
    den === 0
      ? "N/A (0/0)"
      : `${((num / den) * 100).toFixed(1)}% (${num}/${den})`;

  const formatDual = (c: DualFieldCounter) =>
    `(a) All: ${pct(c.allCorrect, c.allTotal)} | (b) Stated (!= not_mentioned): ${pct(
      c.statedCorrect,
      c.statedTotal
    )}`;

  console.log("\n==============================================================");
  console.log("  Accuracy Report per Field — (a) All vs (b) Stated Only");
  console.log("==============================================================");
  console.log(
    `1. Safety & Fail-Safe Status : ${pct(safetyStatusCorrect, fixtures.length)}`
  );
  console.log(`2. adherence                 : ${formatDual(adherenceCounter)}`);
  console.log(`3. effect                    : ${formatDual(effectCounter)}`);
  console.log(`4. sideEffects               : ${formatDual(sideEffectsCounter)}`);
  console.log(`5. stoppingReason            : ${formatDual(stoppingReasonCounter)}`);
  console.log(`6. stoppedBy                 : ${formatDual(stoppedByCounter)}`);
  console.log(`7. dose                      : ${formatDual(doseCounter)}`);
  console.log(`8. durationTaken             : ${formatDual(durationTakenCounter)}`);
  console.log(`9. onsetAfterStarting        : ${formatDual(onsetCounter)}`);
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
  printConfusionMatrix("sideEffects", sideEffectsCounter.confusion);
  printConfusionMatrix("stoppingReason", stoppingReasonCounter.confusion);
  printConfusionMatrix("stoppedBy", stoppedByCounter.confusion);
  printConfusionMatrix("dose", doseCounter.confusion);
  printConfusionMatrix("durationTaken", durationTakenCounter.confusion);
  printConfusionMatrix("onsetAfterStarting", onsetCounter.confusion);

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
