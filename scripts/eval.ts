import fs from "fs";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";

// Load .env.local before importing app modules
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();

import { APP_CONFIG } from "../src/config/app-config";
import {
  evaluateAnswerSafety,
  SafetyDecisionStatus,
  SafetyEvaluationResult,
} from "../src/lib/safety";
import {
  extractAnswerUnderstanding,
  ExtractionOutput,
  InterviewQuestionCategory,
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
  expected: {
    safetyStatus: SafetyDecisionStatus;
    isUnknown: boolean | null;
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
  console.log(`Safety model    : ${APP_CONFIG.models.safetyClassifier} (temp=${APP_CONFIG.models.safetyTemperature})`);
  console.log(`Extraction model: ${APP_CONFIG.models.extraction} (temp=${APP_CONFIG.models.extractionTemperature})`);
  console.log(`Queue min gap   : ${APP_CONFIG.api.minGapBetweenCallsMs}ms`);
  console.log(`Cache mode      : ${noCache ? "DISABLED (--no-cache)" : "ENABLED (tests/.eval-cache.json)"}`);
  console.log("--------------------------------------------------------------\n");

  const safetyMisses: string[] = [];
  const falseAlarms: string[] = [];
  const failSafeErrors: string[] = [];

  let safetyStatusCorrect = 0;
  let isUnknownTotal = 0;
  let isUnknownCorrect = 0;

  let expectedExpressionsTotal = 0;
  let originalPhraseMatched = 0;
  let lexiconMatched = 0;
  let disambiguationMatched = 0;

  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
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
      // Run through the request queue one at a time
      safetyResult = await evaluateAnswerSafety(fixture.answerText, {
        simulateClassifierFailure: fixture.simulateClassifierFailure,
        questionCategory: fixture.questionCategory,
        skipDbLog: true,
      });

      // Only send to extraction when safetyResult.status === "safe"
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

    // Track safety misses (expected urgent, but did not trigger urgent)
    if (
      fixture.expected.safetyStatus === "urgent" &&
      safetyResult.status !== "urgent"
    ) {
      safetyMisses.push(
        `${fixture.id}: Expected URGENT but got "${safetyResult.status}" (text: "${fixture.answerText}")`
      );
    }

    // Track false alarms (expected safe, but triggered urgent)
    if (
      fixture.expected.safetyStatus === "safe" &&
      safetyResult.status === "urgent"
    ) {
      falseAlarms.push(
        `${fixture.id}: Expected SAFE but triggered URGENT via ${safetyResult.whichCheckFired} (matchedKeyword=${safetyResult.matchedKeyword}, label=${safetyResult.classifierLabel})`
      );
    }

    // Track fail-safe accuracy
    if (
      fixture.expected.safetyStatus === "fail_safe" &&
      (safetyResult.status !== "fail_safe" || extractionResult !== null)
    ) {
      failSafeErrors.push(
        `${fixture.id}: Expected FAIL_SAFE with blocked extraction, but got status="${safetyResult.status}"`
      );
    }

    // Evaluate extraction fields for expected safe fixtures
    if (fixture.expected.safetyStatus === "safe" && extractionResult) {
      isUnknownTotal += 1;
      if (extractionResult.isUnknown === fixture.expected.isUnknown) {
        isUnknownCorrect += 1;
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
      `${sourceTag} (${i + 1}/${fixtures.length}) ${fixture.id} -> safety=${safetyResult.status} (expected=${fixture.expected.safetyStatus}) ${
        statusMatch ? "PASS" : "FAIL"
      }`
    );
  }

  const pct = (num: number, den: number) =>
    den === 0 ? "N/A" : `${((num / den) * 100).toFixed(1)}% (${num}/${den})`;

  console.log("\n==============================================================");
  console.log("  Accuracy Report per Field");
  console.log("==============================================================");
  console.log(
    `1. Safety & Fail-Safe Status : ${pct(safetyStatusCorrect, fixtures.length)}`
  );
  console.log(
    `2. isUnknown Detection       : ${pct(isUnknownCorrect, isUnknownTotal)}`
  );
  console.log(
    `3. Original Phrase Extraction: ${pct(
      originalPhraseMatched,
      expectedExpressionsTotal
    )}`
  );
  console.log(
    `4. Lexicon Term Alignment    : ${pct(
      lexiconMatched,
      expectedExpressionsTotal
    )}`
  );
  console.log(
    `5. Multi-Meaning Disambig.   : ${pct(
      disambiguationMatched,
      expectedExpressionsTotal
    )}`
  );

  console.log("\n--------------------------------------------------------------");
  console.log(`Safety Misses (${safetyMisses.length}):`);
  if (safetyMisses.length === 0) {
    console.log("  None (0 safety misses)");
  } else {
    for (const miss of safetyMisses) {
      console.log(`  - [MISS] ${miss}`);
    }
  }

  console.log(`\nFalse Alarms (${falseAlarms.length}):`);
  if (falseAlarms.length === 0) {
    console.log("  None (0 false alarms)");
  } else {
    for (const alarm of falseAlarms) {
      console.log(`  - [FALSE ALARM] ${alarm}`);
    }
  }

  console.log(`\nFail-Safe Simulation Checks (${failSafeErrors.length} errors):`);
  if (failSafeErrors.length === 0) {
    console.log("  All simulated classifier failures triggered fail-safe & blocked extraction.");
  } else {
    for (const err of failSafeErrors) {
      console.log(`  - [FAIL-SAFE ERROR] ${err}`);
    }
  }
  console.log("==============================================================\n");

  if (
    safetyMisses.length > 0 ||
    falseAlarms.length > 0 ||
    failSafeErrors.length > 0
  ) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Evaluation script failed:", err);
  process.exit(1);
});
