import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkSafetyKeywords, evaluateAnswerSafety } from "@/lib/safety";
import { extractAnswerUnderstanding } from "@/lib/extraction";
import { SAFETY_HELPLINES } from "@/config/safety-helplines";

const AnalyzeRequestSchema = z.object({
  answerText: z.string().min(1),
  questionCategory: z.enum([
    "adherence",
    "effect",
    "side_effects",
    "stopping_reason",
  ]),
  simulateClassifierFailure: z
    .enum(["TIMEOUT", "INVALID_JSON"])
    .nullable()
    .optional(),
});

export type UrgentSafetyCategory =
  | "self_harm_or_suicide"
  | "severe_physical_reaction"
  | "both"
  | null;

function resolveSafetyCategory(
  answerText: string,
  classifierLabel: string | null
): UrgentSafetyCategory {
  const kwResult = checkSafetyKeywords(answerText);
  const kwCat = kwResult.matched ? kwResult.category : null;
  const llmCat =
    classifierLabel === "self_harm_or_suicide" ||
    classifierLabel === "severe_physical_reaction"
      ? classifierLabel
      : null;

  if (kwCat && llmCat && kwCat !== llmCat) {
    return "both";
  }
  return llmCat ?? kwCat ?? null;
}

/**
 * POST /api/interview/analyze
 *
 * 1. Runs the Safety Step FIRST (keyword check + Gemini Flash-Lite classifier).
 * 2. If urgent: stops immediately, saves nothing from the answer, and returns
 *    the Urgent Help payload (including safetyCategory).
 * 3. If classifier fails after retries (and no keyword matched): triggers the
 *    Fail-Safe pause, does NOT call extraction, and returns help info + retry option.
 * 4. If safe: sends original answer text unchanged to the Gemini Flash extraction
 *    layer and returns the validated structured output.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = AnalyzeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { answerText, questionCategory, simulateClassifierFailure } =
      parsed.data;

    // Step 1: Safety check always runs first
    const safetyResult = await evaluateAnswerSafety(answerText, {
      questionCategory,
      simulateClassifierFailure: simulateClassifierFailure ?? null,
    });

    if (safetyResult.status === "urgent") {
      const safetyCategory = resolveSafetyCategory(
        answerText,
        safetyResult.classifierLabel
      );
      return NextResponse.json({
        status: "urgent",
        safetyCategory,
        safetyResult,
        helplines: SAFETY_HELPLINES,
      });
    }

    if (safetyResult.status === "fail_safe") {
      return NextResponse.json({
        status: "fail_safe",
        safetyResult,
        helplines: SAFETY_HELPLINES,
      });
    }

    // Step 2: Only when safetyResult.status === "safe" do we proceed to extraction
    try {
      const extraction = await extractAnswerUnderstanding(
        answerText,
        questionCategory
      );

      return NextResponse.json({
        status: "safe",
        safetyResult,
        extraction,
      });
    } catch (extErr) {
      return NextResponse.json(
        {
          status: "extraction_error",
          error:
            extErr instanceof Error
              ? extErr.message
              : "Extraction technical failure",
        },
        { status: 502 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected server error",
      },
      { status: 500 }
    );
  }
}
