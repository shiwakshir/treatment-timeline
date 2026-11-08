import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  sortMedicationsByDate,
  TimelineMedicationRecord,
} from "@/lib/timeline";

function parseFieldJson(rawJson: string) {
  try {
    return JSON.parse(rawJson);
  } catch {
    return { state: "not_mentioned", value: null, statedOptions: [] };
  }
}

export async function GET() {
  try {
    const profiles = await prisma.patientProfile.findMany({
      include: {
        medications: {
          where: {
            // Nothing goes on the timeline until the user confirms it
            confirmedAt: { not: null },
          },
          include: {
            expressions: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const formatted = profiles.map((p) => {
      const meds: TimelineMedicationRecord[] = p.medications.map((m) => ({
        id: m.id,
        genericName: m.genericName,
        startDate: m.startDate,
        stopDate: m.stopDate,
        dose: parseFieldJson(m.doseJson),
        durationTaken: parseFieldJson(m.durationTakenJson),
        onsetAfterStarting: parseFieldJson(m.onsetAfterStartingJson),
        doseTimingText: m.doseTimingText,
        symptomTimingText: m.symptomTimingText,
        adherenceRaw: m.adherenceRaw,
        adherence: parseFieldJson(m.adherenceJson),
        effectRaw: m.effectRaw,
        effect: parseFieldJson(m.effectJson),
        sideEffectsRaw: m.sideEffectsRaw,
        sideEffects: parseFieldJson(m.sideEffectsJson),
        stoppingReasonRaw: m.stoppingReasonRaw,
        stoppingReason: parseFieldJson(m.stoppingReasonJson),
        stoppedBy: parseFieldJson(m.stoppedByJson),
        confirmedAt: m.confirmedAt,
        expressions: m.expressions.map((e) => ({
          id: e.id,
          questionCategory: e.questionCategory,
          originalPhrase: e.originalPhrase,
          candidateMeanings: JSON.parse(e.candidateMeaningsJson || "[]"),
          selectedMeaning: e.selectedMeaning,
          confidence: e.confidence,
          matchedLexiconTerm: e.matchedLexiconTerm,
        })),
      }));

      return {
        id: p.id,
        displayName: p.displayName,
        preferredLanguage: p.preferredLanguage,
        storySummaryEn: p.storySummaryEn,
        storySummaryHi: p.storySummaryHi,
        medications: sortMedicationsByDate(meds),
      };
    });

    return NextResponse.json({ patients: formatted });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load patients",
      },
      { status: 500 }
    );
  }
}
