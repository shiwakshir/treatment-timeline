import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { APP_CONFIG } from "@/config/app-config";
import {
  findMatchingLexiconEntries,
  formatLexiconPromptReference,
} from "@/lib/lexicon";
import {
  enqueueGeminiRequest,
  TechnicalApiError,
} from "@/lib/request-queue";

/**
 * Structured category enums for scoring and timeline summarization.
 * Note: None of these categories judge whether a medication trial was clinically
 * "adequate" or "failed"—they strictly categorize what the patient reported.
 */
export const AdherenceCategorySchema = z.enum([
  "taken_as_prescribed",
  "mostly_taken_occasional_missed",
  "irregular_or_frequently_missed",
  "not_taken",
  "not_mentioned",
  "unknown",
]);

export const EffectCategorySchema = z.enum([
  "helped_significantly",
  "helped_partially",
  "no_benefit",
  "worsened_or_unpleasant",
  "not_mentioned",
  "unknown",
]);

export const OnsetOrTimingCategorySchema = z.enum([
  "immediate_or_hours",
  "days_to_weeks",
  "months_or_duration_stated",
  "not_mentioned",
  "unknown",
]);

export const StoppingReasonCategorySchema = z.enum([
  "side_effects_or_discomfort",
  "lack_of_effect",
  "felt_better",
  "cost_or_availability",
  "clinician_advised",
  "still_taking",
  "not_mentioned",
  "unknown",
]);

export const FieldUnknownsSchema = z.object({
  dose: z.boolean(),
  durationOrDates: z.boolean(),
  adherence: z.boolean(),
  effect: z.boolean(),
  sideEffects: z.boolean(),
  stoppingReason: z.boolean(),
});

/**
 * Strict Zod schema for every expression of distress or side effect
 * returned by the Gemini understanding layer.
 */
export const ExtractedExpressionSchema = z.object({
  originalPhrase: z.string().min(1),
  candidateMeanings: z.array(z.string().min(1)).min(1).max(3),
  confidence: z.enum(["high", "medium", "low"]),
  matchedLexiconTerm: z.string().nullable(),
});

/**
 * Strict Zod schema for the complete extraction output on a single interview answer.
 */
export const ExtractionOutputSchema = z.object({
  isUnknown: z.boolean(),
  adherence: AdherenceCategorySchema,
  effect: EffectCategorySchema,
  onsetOrTimingCategory: OnsetOrTimingCategorySchema,
  onsetOrTimingText: z.string().nullable(),
  stoppingReason: StoppingReasonCategorySchema,
  fieldUnknowns: FieldUnknownsSchema,
  neutralSummaryEn: z.string().min(1),
  neutralSummaryHi: z.string().min(1),
  expressions: z.array(ExtractedExpressionSchema),
});

export type AdherenceCategory = z.infer<typeof AdherenceCategorySchema>;
export type EffectCategory = z.infer<typeof EffectCategorySchema>;
export type OnsetOrTimingCategory = z.infer<typeof OnsetOrTimingCategorySchema>;
export type StoppingReasonCategory = z.infer<typeof StoppingReasonCategorySchema>;
export type FieldUnknowns = z.infer<typeof FieldUnknownsSchema>;
export type ExtractedExpressionItem = z.infer<typeof ExtractedExpressionSchema>;
export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;

export type InterviewQuestionCategory =
  | "adherence"
  | "effect"
  | "side_effects"
  | "stopping_reason";

/**
 * Sends a safe patient answer to the Gemini Flash extraction model via the
 * rate-limited request queue and validates the response against ExtractionOutputSchema.
 */
export async function extractAnswerUnderstanding(
  answerText: string,
  questionCategory: InterviewQuestionCategory,
  options?: { minGapMs?: number }
): Promise<ExtractionOutput> {
  const lexiconMatches = findMatchingLexiconEntries(answerText);
  const lexiconReferenceText = formatLexiconPromptReference();

  return enqueueGeminiRequest(
    async () => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "your_free_google_ai_studio_api_key_here") {
        throw new TechnicalApiError(
          "MISSING_API_KEY",
          "GEMINI_API_KEY is missing or not configured in .env.local"
        );
      }

      const ai = new GoogleGenAI({ apiKey });

      const prompt = `You are a neutral clinical language understanding assistant for a patient-held mental health medication timeline.
The patient is answering a question primarily about "${questionCategory}" in Hindi (Devanagari), English, or Hinglish (including informal spellings like "dwai", "bht", "bhr", "sust").

CRITICAL RULES:
1. NEVER judge whether a medication trial was adequate, sub-therapeutic, compliant, or failed. Only categorize and describe what the patient reported.
2. Populate structured fields based ONLY on what is stated in this answer:
   - "adherence":
     - "taken_as_prescribed": took consistently every day as directed without mentioning missed doses.
     - "mostly_taken_occasional_missed": took regularly overall but mentioned occasional missed doses (e.g. missed 2-3 Sundays).
     - "irregular_or_frequently_missed": frequently skipped, altered dose, or took irregularly.
     - "not_taken": never took the medicine.
     - "unknown": patient explicitly states they do not remember how they took it.
     - "not_mentioned": adherence is not discussed in this answer.
   - "effect":
     - "helped_significantly": clear, strong improvement (e.g., sleep became much better, "काफी आराम था" / "काफी बेहतर हो गई थी").
     - "helped_partially": partial relief or improvement in one symptom (e.g., "dil ghabrata hai woh thoda kam hua", "anxiety थोड़ी कम हुई").
     - "no_benefit": explicitly states no improvement.
     - "worsened_or_unpleasant": explicitly states overall condition worsened.
     - "unknown": patient explicitly states they do not remember if it helped ("yaad nahi hai ki is dawai se koi fayda hua tha ya nahi").
     - "not_mentioned": therapeutic benefit is not discussed in this answer.
   - "onsetOrTimingCategory":
     - "immediate_or_hours": timing within minutes/hours of dose, time of day, or daily pattern stated (e.g., "shaam ko", "raat ko", "subah uthne ke baad", "पूरा दिन", "din bhar", "गोली खाने के एक घंटे बाद", "roz subah").
     - "days_to_weeks": onset or change over days or weeks stated (e.g., "pehle do hafte... baad mein", "shuru ke dinon mein").
     - "months_or_duration_stated": duration in months stated (e.g., "तीन महीने बाद", "teen-chaar mahine li thi").
     - "unknown": patient explicitly states they do not remember timing/duration.
     - "not_mentioned": no timing, onset, or duration is stated in this answer.
   - "onsetOrTimingText": short verbatim or plain phrase of the timing if stated, or null if not_mentioned/unknown.
   - "stoppingReason":
     - "side_effects_or_discomfort": stopped because of side effects, dizziness, weakness, etc.
     - "lack_of_effect": stopped because it did not help.
     - "felt_better": stopped because symptoms resolved.
     - "cost_or_availability": stopped because of cost or pharmacy stockout ("महंगी भी पड़ रही थी", "मेडिकल स्टोर पर मिलना बंद").
     - "clinician_advised": doctor stopped or changed it.
     - "still_taking": patient states they are still taking it.
     - "unknown": patient explicitly says they do not remember why they stopped.
     - "not_mentioned": stopping reason is not stated in this answer.
   - "fieldUnknowns": set each boolean ("dose", "durationOrDates", "adherence", "effect", "sideEffects", "stoppingReason") to true ONLY when the patient explicitly says they do not remember / are unsure about that specific field in this answer (for example, "Dose yaad nahi, shayad 50 thi ya 100" -> dose: true; "yaad nahi hai ki is dawai se koi fayda hua tha ya nahi" -> effect: true). Otherwise false.
   - "isUnknown": true if the primary question being answered ("${questionCategory}") or a core fact in the answer is explicitly unknown/not remembered.
3. For EVERY expression of distress, symptom, or side effect in the patient's answer:
   - "originalPhrase": Copy the exact substring from the patient's answer verbatim.
   - "candidateMeanings": Provide 1 to 3 candidate clinical meanings in English.
     IMPORTANT: Only include >1 candidate meaning when the meanings are genuinely clinically different (e.g. "ghabrahat", "bechaini", "sar bhaari rehta hai", "susti"). Do NOT include consequences or restatements of another candidate (e.g. for "haath kaampna" / hand tremor or "muh sookhna" / dry mouth or "felt groggy" or "weight बढ़ गया", provide ONLY 1 candidate meaning).
   - "confidence": "high", "medium", or "low".
   - "matchedLexiconTerm": If the phrase matches an entry in the Reference Lexicon below, put its exact "termHinglish" value; otherwise null.

REFERENCE LEXICON (all entries are unvalidated – needs clinician review):
${lexiconReferenceText}

Return ONLY valid JSON matching this exact schema:
{
  "isUnknown": boolean,
  "adherence": "taken_as_prescribed" | "mostly_taken_occasional_missed" | "irregular_or_frequently_missed" | "not_taken" | "not_mentioned" | "unknown",
  "effect": "helped_significantly" | "helped_partially" | "no_benefit" | "worsened_or_unpleasant" | "not_mentioned" | "unknown",
  "onsetOrTimingCategory": "immediate_or_hours" | "days_to_weeks" | "months_or_duration_stated" | "not_mentioned" | "unknown",
  "onsetOrTimingText": string | null,
  "stoppingReason": "side_effects_or_discomfort" | "lack_of_effect" | "felt_better" | "cost_or_availability" | "clinician_advised" | "still_taking" | "not_mentioned" | "unknown",
  "fieldUnknowns": {
    "dose": boolean,
    "durationOrDates": boolean,
    "adherence": boolean,
    "effect": boolean,
    "sideEffects": boolean,
    "stoppingReason": boolean
  },
  "neutralSummaryEn": "concise plain neutral summary in English without clinical judgment",
  "neutralSummaryHi": "concise plain neutral summary in Hindi (Devanagari) without clinical judgment",
  "expressions": [
    {
      "originalPhrase": "exact phrase from patient input",
      "candidateMeanings": ["meaning 1"],
      "confidence": "high" | "medium" | "low",
      "matchedLexiconTerm": "string or null"
    }
  ]
}

Patient's raw answer:
"""
${answerText}
"""`;

      const response = await ai.models.generateContent({
        model: APP_CONFIG.models.extraction,
        contents: prompt,
        config: {
          temperature: APP_CONFIG.models.extractionTemperature,
          responseMimeType: "application/json",
        },
      });

      const rawText = response.text?.trim() ?? "";
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawText);
      } catch {
        throw new TechnicalApiError(
          "INVALID_SCHEMA",
          `Extraction model returned invalid JSON: ${rawText.slice(0, 120)}`
        );
      }

      const validated = ExtractionOutputSchema.safeParse(parsedJson);
      if (!validated.success) {
        throw new TechnicalApiError(
          "INVALID_SCHEMA",
          `Extraction JSON failed Zod schema validation: ${validated.error.message}`
        );
      }

      // Align matched lexicon entries so their curated clinically-distinct candidateMeanings
      // (1 for unambiguous terms like haath kaampna / muh sookhna, 2-3 for ambiguous terms) are enforced.
      const output = validated.data;
      for (const match of lexiconMatches) {
        const existing = output.expressions.find(
          (expr) =>
            expr.matchedLexiconTerm === match.entry.termHinglish ||
            expr.originalPhrase
              .toLowerCase()
              .includes(match.matchedSubstring.toLowerCase()) ||
            match.matchedSubstring
              .toLowerCase()
              .includes(expr.originalPhrase.toLowerCase())
        );

        if (existing) {
          existing.matchedLexiconTerm = match.entry.termHinglish;
          existing.candidateMeanings = match.entry.candidateMeanings.slice(0, 3);
        } else {
          const idx = answerText
            .toLowerCase()
            .indexOf(match.matchedSubstring.toLowerCase());
          const exactSubstring =
            idx >= 0
              ? answerText.slice(idx, idx + match.matchedSubstring.length)
              : match.matchedSubstring;

          output.expressions.push({
            originalPhrase: exactSubstring,
            candidateMeanings: match.entry.candidateMeanings.slice(0, 3),
            confidence: "medium",
            matchedLexiconTerm: match.entry.termHinglish,
          });
        }
      }

      return output;
    },
    { minGapMs: options?.minGapMs }
  );
}
