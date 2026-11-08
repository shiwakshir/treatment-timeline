import fs from "fs";
import path from "path";
import {
  buildReadBackSummary,
  TimelineMedicationRecord,
} from "../src/lib/timeline";

const FIXTURES_PATH = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "eval-fixtures.json"
);

const TARGET_IDS = [
  "fix-03-hinglish-effect-dil-ghabrata",
  "fix-07-hindi-stopping-reason-chakkar-thakaan",
  "fix-11-safe-edge-case-hindi-stopped-for-cost",
  "fix-26-hinglish-partial-memory",
];

function main() {
  const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, "utf-8")) as any[];

  console.log("==============================================================");
  console.log("  Read-Back Summary Preview (fix-03, fix-07, fix-11, fix-26)");
  console.log("==============================================================\n");

  for (const id of TARGET_IDS) {
    const fix = fixtures.find((f) => f.id === id);
    if (!fix) continue;

    const exp = fix.expected;
    const record: TimelineMedicationRecord = {
      id: fix.id,
      genericName: "sertraline (example)",
      startDate: "2025-01",
      stopDate: "2025-04",
      dose: exp.dose,
      durationTaken: exp.durationTaken,
      onsetAfterStarting: exp.onsetAfterStarting,
      doseTimingText: exp.doseTimingText,
      adherenceRaw: fix.questionCategory === "adherence" ? fix.answerText : "",
      adherence: exp.adherence,
      effectRaw: fix.questionCategory === "effect" ? fix.answerText : "",
      effect: exp.effect,
      sideEffectsRaw:
        fix.questionCategory === "side_effects" ? fix.answerText : "",
      sideEffects: exp.sideEffects,
      stoppingReasonRaw:
        fix.questionCategory === "stopping_reason" ? fix.answerText : "",
      stoppingReason: exp.stoppingReason,
      stoppedBy: exp.stoppedBy,
      confirmedAt: null,
      expressions: (exp.expectedExpressions ?? []).map(
        (e: any, idx: number) => ({
          id: `${fix.id}-expr-${idx}`,
          questionCategory: fix.questionCategory,
          originalPhrase: e.originalPhrase,
          candidateMeanings: e.expectedMeanings,
          selectedMeaning: e.expectedMeanings[0] ?? e.originalPhrase,
          confidence: "high",
          matchedLexiconTerm: e.matchedLexiconTerm,
        })
      ),
    };

    console.log(`--------------------------------------------------------------`);
    console.log(`Fixture : ${fix.id}`);
    console.log(`Patient : "${fix.answerText}"`);
    console.log(`--------------------------------------------------------------`);

    console.log("\n[ENGLISH READ-BACK]:");
    for (const line of buildReadBackSummary(record, "en")) {
      console.log(`  • ${line}`);
    }

    console.log("\n[HINDI (DEVANAGARI) READ-BACK]:");
    for (const line of buildReadBackSummary(record, "hi")) {
      console.log(`  • ${line}`);
    }
    console.log("\n");
  }
}

main();
