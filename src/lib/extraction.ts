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
  neutralSummaryEn: z.string().min(1),
  neutralSummaryHi: z.string().min(1),
  expressions: z.array(ExtractedExpressionSchema),
});

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
 *
 * Key rules enforced:
 * - Never judges whether a medication trial was adequate or failed.
 * - Preserves the exact originalPhrase as written by the patient.
 * - Uses data/lexicon.json as reference for Hindi/Hinglish expressions and ensures
 *   multi-meaning lexicon matches surface up to 3 candidate meanings for user selection.
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
The patient is answering a question about "${questionCategory}" in Hindi (Devanagari), English, or Hinglish.

CRITICAL RULES:
1. NEVER judge whether a medication trial was adequate, sub-therapeutic, compliant, or failed. Only describe what the patient reported in neutral, descriptive language.
2. If the patient says they do not know, cannot remember, or aren't sure (e.g., "unknown", "pata nahi", "yaad nahi hai", "याद नहीं है", "don't remember"), set "isUnknown": true and set "neutralSummaryEn": "Unknown (patient does not remember)" and "neutralSummaryHi": "अज्ञात (मरीज़ को याद नहीं है)". Never guess or invent details.
3. For EVERY expression of distress, symptom, or side effect in the patient's answer:
   - "originalPhrase": Copy the exact substring from the patient's answer verbatim (do not translate or alter spelling).
   - "candidateMeanings": Provide 1 to 3 clear candidate clinical meanings in English. If the phrase can mean more than one thing (especially Hindi/Hinglish idioms or lexicon terms below), provide 2 or 3 distinct candidate meanings so the patient can choose which one fits.
   - "confidence": "high", "medium", or "low".
   - "matchedLexiconTerm": If the phrase corresponds to an entry in the Reference Lexicon below, put its "termHinglish" value (e.g., "ghabrahat", "neend nahi aati", "dil ghabrata hai", "sar bhaari rehta hai"); otherwise null.

REFERENCE LEXICON (all entries are unvalidated – needs clinician review):
${lexiconReferenceText}

Return ONLY valid JSON matching this exact schema:
{
  "isUnknown": boolean,
  "neutralSummaryEn": "concise plain neutral summary in English without clinical judgment",
  "neutralSummaryHi": "concise plain neutral summary in Hindi (Devanagari) without clinical judgment",
  "expressions": [
    {
      "originalPhrase": "exact phrase from patient input",
      "candidateMeanings": ["meaning 1", "meaning 2 (if ambiguous)", "meaning 3 (optional)"],
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

      // Post-processing alignment with local lexicon:
      // If a known lexicon term appeared in the user's text, ensure its candidate meanings
      // are preserved (up to 3) so the user is always given the choice when >1 meaning exists.
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
          if (
            existing.candidateMeanings.length < 2 &&
            match.entry.candidateMeanings.length > 1
          ) {
            existing.candidateMeanings = match.entry.candidateMeanings.slice(
              0,
              3
            );
          }
        } else {
          // Find the exact substring in answerText preserving original casing
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
