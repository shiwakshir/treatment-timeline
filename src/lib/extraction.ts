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
 * None of these categories judge whether a medication trial was clinically
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
  "helped_degree_not_stated",
  "no_benefit",
  "worsened_or_unpleasant",
  "not_mentioned",
  "unknown",
]);

export const OnsetAfterStartingSchema = z.enum([
  "hours",
  "days_to_weeks",
  "months",
  "not_mentioned",
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

export const StoppedByCategorySchema = z.enum([
  "self",
  "clinician",
  "not_mentioned",
]);

export const CertaintyStateSchema = z.enum(["known", "uncertain", "unknown"]);

export const FieldStateEntrySchema = z.object({
  state: CertaintyStateSchema,
  statedOptions: z.array(z.string()),
});

export const DurationTakenSchema = z.object({
  state: CertaintyStateSchema,
  value: z.string().nullable(),
  statedOptions: z.array(z.string()),
});

export const FieldStatesSchema = z.object({
  dose: FieldStateEntrySchema,
  durationTaken: DurationTakenSchema,
  adherence: FieldStateEntrySchema,
  effect: FieldStateEntrySchema,
  sideEffects: FieldStateEntrySchema,
  stoppingReason: FieldStateEntrySchema,
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
  adherence: AdherenceCategorySchema,
  effect: EffectCategorySchema,
  onsetAfterStarting: OnsetAfterStartingSchema,
  durationTaken: DurationTakenSchema,
  scheduleText: z.string().nullable(),
  stoppingReason: StoppingReasonCategorySchema,
  stoppedBy: StoppedByCategorySchema,
  fieldStates: FieldStatesSchema,
  neutralSummaryEn: z.string().min(1),
  neutralSummaryHi: z.string().min(1),
  expressions: z.array(ExtractedExpressionSchema),
});

export type AdherenceCategory = z.infer<typeof AdherenceCategorySchema>;
export type EffectCategory = z.infer<typeof EffectCategorySchema>;
export type OnsetAfterStartingCategory = z.infer<typeof OnsetAfterStartingSchema>;
export type StoppingReasonCategory = z.infer<typeof StoppingReasonCategorySchema>;
export type StoppedByCategory = z.infer<typeof StoppedByCategorySchema>;
export type CertaintyState = z.infer<typeof CertaintyStateSchema>;
export type FieldStateEntry = z.infer<typeof FieldStateEntrySchema>;
export type DurationTaken = z.infer<typeof DurationTakenSchema>;
export type FieldStates = z.infer<typeof FieldStatesSchema>;
export type ExtractedExpressionItem = z.infer<typeof ExtractedExpressionSchema>;
export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;

export type InterviewQuestionCategory =
  | "adherence"
  | "effect"
  | "side_effects"
  | "stopping_reason";

/**
 * Sends a safe patient answer (original text unchanged) to the Gemini Flash
 * extraction model via the rate-limited request queue and validates the
 * response against ExtractionOutputSchema.
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
     - "mostly_taken_occasional_missed": took regularly overall but mentioned occasional missed doses (e.g. missed two or three Sundays).
     - "irregular_or_frequently_missed": frequently skipped, altered dose, or took irregularly.
     - "not_taken": never took the medicine.
     - "unknown": patient explicitly states they do not remember how they took it.
     - "not_mentioned": adherence is not discussed in this answer.
   - "effect":
     - "helped_significantly": clear, strong improvement with degree stated (e.g., sleep became much better, "काफी बेहतर हो गई थी").
     - "helped_partially": partial relief or improvement in some symptoms (e.g., "dil ghabrata hai woh thoda kam hua", "anxiety थोड़ी कम हुई").
     - "helped_degree_not_stated": patient states it helped or gave relief without specifying how much (e.g., "दवाई से तो आराम था").
     - "no_benefit": explicitly states no improvement.
     - "worsened_or_unpleasant": patient reports feeling low, sluggish, or unpleasant on the medicine without therapeutic relief (e.g., "Dawai se mann udaas rehta hai aur susti aati hai").
     - "unknown": patient explicitly states they do not remember if it helped ("yaad nahi hai ki is dawai se koi fayda hua tha ya nahi").
     - "not_mentioned": therapeutic benefit is not discussed in this answer.
   - "onsetAfterStarting" (ONLY how long after starting the medicine or taking the dose an effect or side effect began — do NOT confuse daily routine, time-of-day like "every night after dinner", or "din bhar" with onset!):
     - "hours": effect or side effect began within minutes or hours of taking the dose (e.g., "गोली खाने के एक घंटे बाद", "Dawai lene ke baad shaam ko", "The night dose knocked me out").
     - "days_to_weeks": effect or side effect began after days or weeks of starting the medication (e.g., "Pehle do hafte kuch farak nahi pada, par baad mein...", "shuru ke dinon mein").
     - "months": effect or side effect began after months.
     - "not_mentioned": how long after starting the medicine an effect/side effect began is NOT stated (for example, if the patient only mentions time of day/routine like "every night after dinner", "din bhar susti rehti thi", "सुबह उठने के बाद पूरा दिन", or total treatment duration).
   - "durationTaken": how long the patient took the medicine overall:
     - "state": "known" | "uncertain" | "unknown"
     - "value": normalized duration string if stated (e.g. "3 months" for "तीन महीने बाद दवाई छोड़ दी", "3-4 months" for "teen-chaar mahine li thi"), or null if duration was not mentioned.
     - "statedOptions": when "state" is "uncertain", list the discrete options in English (e.g., ["3 months", "4 months"] for "teen-chaar mahine li thi"); otherwise [].
   - "scheduleText": free text capturing any time-of-day or dosing schedule mentioned (e.g., "every night after dinner", "din bhar", "सुबह उठने के बाद पूरा दिन"), or null if none mentioned.
   - "stoppingReason":
     - "side_effects_or_discomfort": stopped because of side effects, dizziness, weakness, etc.
     - "lack_of_effect": stopped because it did not help.
     - "felt_better": stopped because symptoms resolved.
     - "cost_or_availability": stopped because of price or pharmacy stockout ("महंगी भी पड़ रही थी", "मेडिकल स्टोर पर मिलना बंद").
     - "clinician_advised": doctor stopped or changed it.
     - "still_taking": patient states they are still taking it.
     - "unknown": patient explicitly says they do not remember why they stopped.
     - "not_mentioned": stopping reason is not stated in this answer.
   - "stoppedBy":
     - "self": patient explicitly states they stopped the medicine themselves (e.g., "इसलिए मैंने तीन महीने बाद दवाई छोड़ दी").
     - "clinician": doctor/clinician stopped or changed it.
     - "not_mentioned": who initiated stopping is not explicitly stated.
   - "fieldStates": three-state certainty object for "dose", "durationTaken", "adherence", "effect", "sideEffects", and "stoppingReason":
     - Default to { "state": "known", "statedOptions": [] } unless the patient explicitly expresses uncertainty or lack of memory for that field in this answer.
     - Set "state": "uncertain" with "statedOptions" when the patient hedges between candidate values (e.g., "Dose yaad nahi, shayad 50 thi ya 100" -> dose: { "state": "uncertain", "statedOptions": ["50", "100"] }; "teen-chaar mahine li thi" -> durationTaken: { "state": "uncertain", "value": "3-4 months", "statedOptions": ["3 months", "4 months"] }).
     - Set "state": "unknown" with "statedOptions": [] ONLY when the patient explicitly says they cannot remember / do not know that field and provides no candidate options (e.g., "mujhe bilkul yaad nahi hai ki is dawai se koi fayda hua tha ya nahi" -> effect: { "state": "unknown", "statedOptions": [] }).
3. For EVERY expression of distress, symptom, or side effect in the patient's answer:
   - "originalPhrase": Copy the exact substring from the patient's answer verbatim.
   - "candidateMeanings": Provide 1 to 3 candidate clinical meanings in English.
     IMPORTANT: Only include >1 candidate meaning when the meanings are genuinely clinically different. Do NOT include consequences or restatements of another candidate (e.g. for "haath kaampna" / hand tremor or "muh sookhna" / dry mouth or "felt groggy" or "weight बढ़ गया", provide ONLY 1 candidate meaning).
   - "confidence": "high", "medium", or "low".
   - "matchedLexiconTerm": If the phrase matches an entry in the Reference Lexicon below, put its exact "termHinglish" value; otherwise null.

REFERENCE LEXICON (all entries are unvalidated – needs clinician review):
${lexiconReferenceText}

Return ONLY valid JSON matching this exact schema:
{
  "adherence": "taken_as_prescribed" | "mostly_taken_occasional_missed" | "irregular_or_frequently_missed" | "not_taken" | "not_mentioned" | "unknown",
  "effect": "helped_significantly" | "helped_partially" | "helped_degree_not_stated" | "no_benefit" | "worsened_or_unpleasant" | "not_mentioned" | "unknown",
  "onsetAfterStarting": "hours" | "days_to_weeks" | "months" | "not_mentioned",
  "durationTaken": {
    "state": "known" | "uncertain" | "unknown",
    "value": string | null,
    "statedOptions": string[]
  },
  "scheduleText": string | null,
  "stoppingReason": "side_effects_or_discomfort" | "lack_of_effect" | "felt_better" | "cost_or_availability" | "clinician_advised" | "still_taking" | "not_mentioned" | "unknown",
  "stoppedBy": "self" | "clinician" | "not_mentioned",
  "fieldStates": {
    "dose": { "state": "known" | "uncertain" | "unknown", "statedOptions": string[] },
    "durationTaken": { "state": "known" | "uncertain" | "unknown", "value": string | null, "statedOptions": string[] },
    "adherence": { "state": "known" | "uncertain" | "unknown", "statedOptions": string[] },
    "effect": { "state": "known" | "uncertain" | "unknown", "statedOptions": string[] },
    "sideEffects": { "state": "known" | "uncertain" | "unknown", "statedOptions": string[] },
    "stoppingReason": { "state": "known" | "uncertain" | "unknown", "statedOptions": string[] }
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

Patient's raw answer (unchanged):
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
