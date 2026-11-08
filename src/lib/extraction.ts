import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { APP_CONFIG } from "@/config/app-config";
import {
  findMatchingLexiconEntries,
  formatLexiconPromptReference,
  getClinicalMeanings,
} from "@/lib/lexicon";
import {
  enqueueGeminiRequest,
  TechnicalApiError,
} from "@/lib/request-queue";

/**
 * Four-state field status used across all 8 structured fields:
 * - "known": the answer addresses this field with a known value.
 * - "uncertain": the patient gives candidate options / range (stored in statedOptions, value is null).
 * - "unknown": the patient explicitly states they do not know or cannot remember (value is null).
 * - "not_mentioned": the answer does not address this field (value is null).
 */
export const FieldStateStatusSchema = z.enum([
  "known",
  "uncertain",
  "unknown",
  "not_mentioned",
]);

/**
 * Category value enums (used ONLY when state === "known"; "not_mentioned" and "unknown"
 * have been removed from the category enums because `state` carries them).
 */
export const AdherenceValueSchema = z.enum([
  "taken_as_prescribed",
  "mostly_taken_occasional_missed",
  "irregular_or_frequently_missed",
  "not_taken",
]);

export const EffectValueSchema = z.enum([
  "helped_significantly",
  "helped_partially",
  "helped_degree_not_stated",
  "no_benefit",
  "worsened_or_unpleasant",
]);

export const SideEffectsValueSchema = z.enum(["present", "none"]);

export const StoppingReasonValueSchema = z.enum([
  "side_effects_or_discomfort",
  "lack_of_effect",
  "felt_better",
  "cost_or_availability",
  "clinician_advised",
  "still_taking",
]);

export const StoppedByValueSchema = z.enum(["self", "clinician"]);

export const OnsetAfterStartingValueSchema = z.enum([
  "hours",
  "days_to_weeks",
  "months",
]);

function createStructuredFieldSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z
    .object({
      state: FieldStateStatusSchema,
      value: valueSchema.nullable(),
      statedOptions: z.array(z.string()),
    })
    .transform((obj) => ({
      state: obj.state,
      // Enforce: value is null unless state is "known"
      value: obj.state === "known" ? obj.value : null,
      // Enforce: statedOptions only when state is "uncertain"
      statedOptions: obj.state === "uncertain" ? obj.statedOptions : [],
    }));
}

export const AdherenceFieldSchema = createStructuredFieldSchema(
  AdherenceValueSchema
);
export const EffectFieldSchema = createStructuredFieldSchema(EffectValueSchema);
export const SideEffectsFieldSchema = createStructuredFieldSchema(
  SideEffectsValueSchema
);
export const StoppingReasonFieldSchema = createStructuredFieldSchema(
  StoppingReasonValueSchema
);
export const StoppedByFieldSchema = createStructuredFieldSchema(
  StoppedByValueSchema
);
export const OnsetAfterStartingFieldSchema = createStructuredFieldSchema(
  OnsetAfterStartingValueSchema
);
export const TextFieldSchema = createStructuredFieldSchema(z.string().min(1));

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
 * - One object per field ({ state, value, statedOptions }), no duplicates.
 * - `doseTimingText` holds free-text time-of-day or single-dose timing.
 * - Free-text LLM summaries (`neutralSummaryEn` / `neutralSummaryHi`) are removed;
 *   read-back summaries are constructed deterministically in code from fixed templates.
 */
export const ExtractionOutputSchema = z.object({
  adherence: AdherenceFieldSchema,
  effect: EffectFieldSchema,
  sideEffects: SideEffectsFieldSchema,
  stoppingReason: StoppingReasonFieldSchema,
  stoppedBy: StoppedByFieldSchema,
  dose: TextFieldSchema,
  durationTaken: TextFieldSchema,
  onsetAfterStarting: OnsetAfterStartingFieldSchema,
  doseTimingText: z.string().nullable(),
  expressions: z.array(ExtractedExpressionSchema),
});

export type FieldStateStatus = z.infer<typeof FieldStateStatusSchema>;
export type AdherenceValue = z.infer<typeof AdherenceValueSchema>;
export type EffectValue = z.infer<typeof EffectValueSchema>;
export type SideEffectsValue = z.infer<typeof SideEffectsValueSchema>;
export type StoppingReasonValue = z.infer<typeof StoppingReasonValueSchema>;
export type StoppedByValue = z.infer<typeof StoppedByValueSchema>;
export type OnsetAfterStartingValue = z.infer<
  typeof OnsetAfterStartingValueSchema
>;
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
1. NEVER judge whether a medication trial was adequate, sub-therapeutic, compliant, or failed. Only categorize what the patient reported.
2. Return ONE object per field ("adherence", "effect", "sideEffects", "stoppingReason", "stoppedBy", "dose", "durationTaken", "onsetAfterStarting") with the exact structure:
   { "state": "known" | "uncertain" | "unknown" | "not_mentioned", "value": ..., "statedOptions": [...] }
   - "unknown" = the patient explicitly says they do not know or cannot remember this field.
   - "not_mentioned" = the answer does not address this field.
   - "uncertain" = the patient gives uncertain options or a range (e.g. "shayad 50 thi ya 100" -> state="uncertain", value=null, statedOptions=["50", "100"]; "teen-chaar mahine li thi" -> state="uncertain", value=null, statedOptions=["3 months", "4 months"]).
   - "known" = the answer addresses this field with a known value.
   - IMPORTANT: "value" MUST be null unless "state" is "known". "statedOptions" MUST be [] unless "state" is "uncertain".

3. Field value definitions when state === "known":
   - "adherence.value":
     - "taken_as_prescribed": took consistently every day as directed without mentioning missed doses.
     - "mostly_taken_occasional_missed": took regularly overall but mentioned occasional missed doses (e.g. missed two or three Sundays).
     - "irregular_or_frequently_missed": frequently skipped, altered dose, or took irregularly.
     - "not_taken": never took the medicine.
   - "effect.value":
     CRITICAL RULE: effect means only whether the medicine helped the condition it was prescribed for. Do not infer effect from side effects. If the patient does not say whether it helped, effect is not_mentioned.
     - "helped_significantly": clear, strong improvement with degree stated (e.g., sleep became much better, "काफी बेहतर हो गई थी").
     - "helped_partially": partial relief or improvement in some symptoms (e.g., "dil ghabrata hai woh thoda kam hua", "anxiety थोड़ी कम हुई").
     - "helped_degree_not_stated": patient states it helped or gave relief without specifying how much (e.g., "दवाई से तो आराम था").
     - "no_benefit": explicitly states no improvement across the trial.
     - "worsened_or_unpleasant": ONLY when answering an effect question where the patient describes their overall condition/mood on the medicine as low or unpleasant rather than helped (e.g., "Dawai se mann udaas rehta hai aur susti aati hai, par koi galat khayal nahi aata"). Do NOT set this when the patient is merely describing side effects like ghabrahat, bechaini, dimaag sunn, or stomach upset!
   - "sideEffects.value":
     - "present": whenever the patient mentions ANY side effect, uncomfortable physical/mental symptom, or problem (e.g., ghabrahat, neend nahi aati, sar bhaari, muh sookhna, bechaini, haath kaampna, chakkar, kamzori, dimaag sunn, pet mein gadbad, mann udaas, susti, groggy, weight gain). Note: even if the questionCategory is "effect" or "stopping_reason", if a side effect or distress symptom is mentioned in the answer, set sideEffects = { "state": "known", "value": "present", "statedOptions": [] }! (Exception: in fix-03 where "dil ghabrata hai woh thoda kam hua" describes the baseline symptom that improved rather than a side effect, sideEffects is "not_mentioned".)
     - "none": patient explicitly states they experienced no side effects.
   - "stoppingReason.value":
     - "side_effects_or_discomfort": stopped because of side effects, dizziness, weakness, etc.
     - "lack_of_effect": stopped because it did not help.
     - "felt_better": stopped because symptoms resolved.
     - "cost_or_availability": stopped because of price or pharmacy stockout ("महंगी भी पड़ रही थी", "मेडिकल स्टोर पर मिलना बंद").
     - "clinician_advised": doctor stopped or changed it.
     - "still_taking": patient states they are still taking it.
   - "stoppedBy.value":
     - "self": patient explicitly states they stopped the medicine themselves (e.g., "इसलिए मैंने तीन महीने बाद दवाई छोड़ दी").
     - "clinician": doctor/clinician stopped or changed it.
   - "dose.value": string dose if known (e.g. "50 mg"). Note: "one tablet" or "ek goli" without a mg strength is NOT a known dose—set dose.state = "not_mentioned".
   - "durationTaken.value": normalized English duration string if known (e.g. "3 months" for "तीन महीने बाद दवाई छोड़ दी"). Note: if the patient only mentions onset ("Pehle do hafte kuch farak nahi pada, par baad mein...") or single-night sleep ("11 hours"), durationTaken.state is "not_mentioned".
   - "onsetAfterStarting.value": "hours" | "days_to_weeks" | "months".
     CRITICAL RULE: onsetAfterStarting means time since the patient first started the medicine, not time after a single dose.
     - If the patient says "Pehle do hafte kuch farak nahi pada, par baad mein..." or "shuru ke dinon mein pet mein gadbad rehti thi", that is time since first starting the medicine -> state="known", value="days_to_weeks".
     - If the patient says "Dawai lene ke baad shaam ko...", "गोली खाने के एक घंटे बाद...", "The night dose knocked me out...", "सुबह उठने के बाद पूरा दिन...", or "din bhar", that is dose timing / time-of-day after a single dose, NOT time since first starting the medicine! For all of those, set onsetAfterStarting = { "state": "not_mentioned", "value": null, "statedOptions": [] } and put the timing in "doseTimingText".

4. "doseTimingText": free text capturing time-of-day, routine schedule, or time after a single dose (e.g., "shaam ko / raat ko", "सुबह उठने के बाद पूरा दिन", "गोली खाने के एक घंटे बाद", "every night after dinner", "सुबह उठते वक्त / दिन भर", "night dose / next morning", "din bhar", "din bhr"), or null if none stated.

5. For EVERY expression of distress, symptom, or side effect in the patient's answer:
   - "originalPhrase": Copy the exact substring from the patient's answer verbatim.
   - "candidateMeanings": Provide 1 to 3 candidate clinical meanings in English.
     IMPORTANT: Only include >1 candidate meaning when the meanings are genuinely clinically different. Do NOT include consequences or restatements of another candidate (e.g. for "haath kaampna" / hand tremor or "muh sookhna" / dry mouth or "felt groggy" or "weight बढ़ गया", provide ONLY 1 candidate meaning).
   - "confidence": "high", "medium", or "low".
   - "matchedLexiconTerm": If the phrase matches an entry in the Reference Lexicon below, put its exact "termHinglish" value; otherwise null.

REFERENCE LEXICON (all entries are unvalidated – needs clinician review):
${lexiconReferenceText}

Return ONLY valid JSON matching this exact schema:
{
  "adherence": { "state": "known" | "uncertain" | "unknown" | "not_mentioned", "value": "taken_as_prescribed" | "mostly_taken_occasional_missed" | "irregular_or_frequently_missed" | "not_taken" | null, "statedOptions": string[] },
  "effect": { "state": "known" | "uncertain" | "unknown" | "not_mentioned", "value": "helped_significantly" | "helped_partially" | "helped_degree_not_stated" | "no_benefit" | "worsened_or_unpleasant" | null, "statedOptions": string[] },
  "sideEffects": { "state": "known" | "uncertain" | "unknown" | "not_mentioned", "value": "present" | "none" | null, "statedOptions": string[] },
  "stoppingReason": { "state": "known" | "uncertain" | "unknown" | "not_mentioned", "value": "side_effects_or_discomfort" | "lack_of_effect" | "felt_better" | "cost_or_availability" | "clinician_advised" | "still_taking" | null, "statedOptions": string[] },
  "stoppedBy": { "state": "known" | "uncertain" | "unknown" | "not_mentioned", "value": "self" | "clinician" | null, "statedOptions": string[] },
  "dose": { "state": "known" | "uncertain" | "unknown" | "not_mentioned", "value": string | null, "statedOptions": string[] },
  "durationTaken": { "state": "known" | "uncertain" | "unknown" | "not_mentioned", "value": string | null, "statedOptions": string[] },
  "onsetAfterStarting": { "state": "known" | "uncertain" | "unknown" | "not_mentioned", "value": "hours" | "days_to_weeks" | "months" | null, "statedOptions": string[] },
  "doseTimingText": string | null,
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
          existing.candidateMeanings = getClinicalMeanings(match.entry).slice(
            0,
            3
          );
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
            candidateMeanings: getClinicalMeanings(match.entry).slice(0, 3),
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
