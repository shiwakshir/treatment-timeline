import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  AdherenceFieldSchema,
  EffectFieldSchema,
  OnsetAfterStartingFieldSchema,
  SideEffectsFieldSchema,
  StoppedByFieldSchema,
  StoppingReasonFieldSchema,
  TextFieldSchema,
} from "@/lib/extraction";

const ConfirmedExpressionInputSchema = z.object({
  questionCategory: z.string(),
  originalPhrase: z.string(),
  candidateMeanings: z.array(z.string()),
  selectedMeaning: z.string(),
  confidence: z.string(),
  matchedLexiconTerm: z.string().nullable(),
});

const ConfirmMedicationPayloadSchema = z.object({
  patientId: z.string().min(1),
  genericName: z.string().min(1),
  startDate: z.string().min(1),
  stopDate: z.string().min(1),
  dose: TextFieldSchema,
  durationTaken: TextFieldSchema,
  onsetAfterStarting: OnsetAfterStartingFieldSchema,
  doseTimingText: z.string().nullable(),
  adherenceRaw: z.string(),
  adherence: AdherenceFieldSchema,
  effectRaw: z.string(),
  effect: EffectFieldSchema,
  sideEffectsRaw: z.string(),
  sideEffects: SideEffectsFieldSchema,
  stoppingReasonRaw: z.string(),
  stoppingReason: StoppingReasonFieldSchema,
  stoppedBy: StoppedByFieldSchema,
  expressions: z.array(ConfirmedExpressionInputSchema),
});

/**
 * POST /api/medications/confirm
 *
 * Saves a medication period ONLY after the user has reviewed and confirmed
 * the read-back summary.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = ConfirmMedicationPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid confirmation payload",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const d = parsed.data;

    const created = await prisma.medicationPeriod.create({
      data: {
        patientId: d.patientId,
        genericName: d.genericName,
        startDate: d.startDate,
        stopDate: d.stopDate,
        doseJson: JSON.stringify(d.dose),
        durationTakenJson: JSON.stringify(d.durationTaken),
        onsetAfterStartingJson: JSON.stringify(d.onsetAfterStarting),
        doseTimingText: d.doseTimingText,
        adherenceRaw: d.adherenceRaw,
        adherenceJson: JSON.stringify(d.adherence),
        effectRaw: d.effectRaw,
        effectJson: JSON.stringify(d.effect),
        sideEffectsRaw: d.sideEffectsRaw,
        sideEffectsJson: JSON.stringify(d.sideEffects),
        stoppingReasonRaw: d.stoppingReasonRaw,
        stoppingReasonJson: JSON.stringify(d.stoppingReason),
        stoppedByJson: JSON.stringify(d.stoppedBy),
        confirmedAt: new Date(),
        expressions: {
          create: d.expressions.map((e) => ({
            questionCategory: e.questionCategory,
            originalPhrase: e.originalPhrase,
            candidateMeaningsJson: JSON.stringify(e.candidateMeanings),
            selectedMeaning: e.selectedMeaning,
            confidence: e.confidence,
            matchedLexiconTerm: e.matchedLexiconTerm,
          })),
        },
      },
    });

    return NextResponse.json({ ok: true, medicationPeriodId: created.id });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save confirmed medication",
      },
      { status: 500 }
    );
  }
}
