import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { APP_CONFIG } from "@/config/app-config";
import {
  enqueueGeminiRequest,
  TechnicalApiError,
} from "@/lib/request-queue";

/**
 * Safety keyword entry covering English, Hinglish (Roman script), and Hindi (Devanagari).
 */
export interface SafetyKeywordRule {
  phrase: string;
  language: "en" | "hinglish" | "hi";
  category: "self_harm_or_suicide" | "severe_physical_reaction";
}

/**
 * Curated safety keyword and phrase list across English, Hinglish, and Hindi (Devanagari).
 * Covers:
 * 1. Thoughts or actions of self-harm, suicide, or intentional overdose.
 * 2. Severe physical reactions requiring urgent medical care (breathing difficulty,
 *    throat swelling/closing, severe chest pain, seizure/collapse, severe rash).
 */
export const SAFETY_KEYWORDS: SafetyKeywordRule[] = [
  // --- ENGLISH: Self-harm, suicide, overdose ---
  { phrase: "suicide", language: "en", category: "self_harm_or_suicide" },
  { phrase: "suicidal", language: "en", category: "self_harm_or_suicide" },
  { phrase: "kill myself", language: "en", category: "self_harm_or_suicide" },
  { phrase: "end my life", language: "en", category: "self_harm_or_suicide" },
  { phrase: "ending my life", language: "en", category: "self_harm_or_suicide" },
  { phrase: "want to die", language: "en", category: "self_harm_or_suicide" },
  { phrase: "better off dead", language: "en", category: "self_harm_or_suicide" },
  { phrase: "self-harm", language: "en", category: "self_harm_or_suicide" },
  { phrase: "self harm", language: "en", category: "self_harm_or_suicide" },
  { phrase: "hurt myself", language: "en", category: "self_harm_or_suicide" },
  { phrase: "hurting myself", language: "en", category: "self_harm_or_suicide" },
  { phrase: "cut myself", language: "en", category: "self_harm_or_suicide" },
  { phrase: "overdose", language: "en", category: "self_harm_or_suicide" },
  { phrase: "take all the pills", language: "en", category: "self_harm_or_suicide" },
  { phrase: "swallow all the tablets", language: "en", category: "self_harm_or_suicide" },

  // --- ENGLISH: Severe physical reactions ---
  { phrase: "can't breathe", language: "en", category: "severe_physical_reaction" },
  { phrase: "cannot breathe", language: "en", category: "severe_physical_reaction" },
  { phrase: "difficulty breathing", language: "en", category: "severe_physical_reaction" },
  { phrase: "throat is closing", language: "en", category: "severe_physical_reaction" },
  { phrase: "throat closing up", language: "en", category: "severe_physical_reaction" },
  { phrase: "swollen tongue", language: "en", category: "severe_physical_reaction" },
  { phrase: "lips swelling", language: "en", category: "severe_physical_reaction" },
  { phrase: "severe chest pain", language: "en", category: "severe_physical_reaction" },
  { phrase: "crushing chest pain", language: "en", category: "severe_physical_reaction" },
  { phrase: "had a seizure", language: "en", category: "severe_physical_reaction" },
  { phrase: "collapsed and fainted", language: "en", category: "severe_physical_reaction" },
  { phrase: "skin blistering", language: "en", category: "severe_physical_reaction" },

  // --- HINGLISH (Roman Hindi): Self-harm, suicide, overdose ---
  { phrase: "jeene ka mann nahi", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "jeene ka man nahi", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "jine ka mann nahi", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "mar jaana chahta", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "mar jaana chahti", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "mar jaane ka mann", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "marne ka mann", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "marne ke khayal", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "khud ko nuksan", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "khud ko nuksaan", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "apne aap ko nuksan", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "khudkushi", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "aatmahatya", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "zindagi khatam kar", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "apni jaan de", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "apni jaan lena", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "saari goliyaan ek saath", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "sari goliyan ek sath", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "nas kaat", language: "hinglish", category: "self_harm_or_suicide" },

  // --- HINGLISH (Roman Hindi): Severe physical reactions ---
  { phrase: "saans nahi aa rahi", language: "hinglish", category: "severe_physical_reaction" },
  { phrase: "sans nahi aa rahi", language: "hinglish", category: "severe_physical_reaction" },
  { phrase: "saans ruk rahi", language: "hinglish", category: "severe_physical_reaction" },
  { phrase: "gala band ho raha", language: "hinglish", category: "severe_physical_reaction" },
  { phrase: "gale mein sujan", language: "hinglish", category: "severe_physical_reaction" },
  { phrase: "seene mein tez dard", language: "hinglish", category: "severe_physical_reaction" },
  { phrase: "behosh ho gaya", language: "hinglish", category: "severe_physical_reaction" },
  { phrase: "behosh ho gayi", language: "hinglish", category: "severe_physical_reaction" },
  { phrase: "daura pada", language: "hinglish", category: "severe_physical_reaction" },

  // --- HINDI (Devanagari): Self-harm, suicide, overdose ---
  { phrase: "आत्महत्या", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "खुदकुशी", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "जीने का मन नहीं", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "मरने का मन", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "मर जाने का मन", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "मरने के ख्याल", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "मरने के विचार", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "खुद को नुकसान", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "अपने आप को नुकसान", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "अपनी जान दे", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "ज़िंदगी खत्म कर", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "जिंदगी खत्म कर", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "सारी गोलियां एक साथ", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "सारी गोलियाँ एक साथ", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "नस काट", language: "hi", category: "self_harm_or_suicide" },

  // --- HINDI (Devanagari): Severe physical reactions ---
  { phrase: "सांस नहीं आ रही", language: "hi", category: "severe_physical_reaction" },
  { phrase: "साँस नहीं आ रही", language: "hi", category: "severe_physical_reaction" },
  { phrase: "सांस रुक रही", language: "hi", category: "severe_physical_reaction" },
  { phrase: "गला बंद हो रहा", language: "hi", category: "severe_physical_reaction" },
  { phrase: "गले में सूजन", language: "hi", category: "severe_physical_reaction" },
  { phrase: "सीने में तेज़ दर्द", language: "hi", category: "severe_physical_reaction" },
  { phrase: "सीने में तेज दर्द", language: "hi", category: "severe_physical_reaction" },
  { phrase: "बेहोश हो गया", language: "hi", category: "severe_physical_reaction" },
  { phrase: "बेहोश हो गई", language: "hi", category: "severe_physical_reaction" },
  { phrase: "दौरा पड़ा", language: "hi", category: "severe_physical_reaction" },
];

/**
 * Zod schema for the Gemini Flash-Lite safety classifier output.
 */
export const SafetyClassifierSchema = z.object({
  isUrgent: z.boolean(),
  label: z.enum([
    "safe",
    "self_harm_or_suicide",
    "severe_physical_reaction",
  ]),
  reason: z.string(),
});

export type SafetyClassifierOutput = z.infer<typeof SafetyClassifierSchema>;

export interface KeywordCheckResult {
  matched: boolean;
  matchedPhrase: string | null;
  category: "self_harm_or_suicide" | "severe_physical_reaction" | null;
}

export type SafetyDecisionStatus = "safe" | "urgent" | "fail_safe";

export interface SafetyEvaluationResult {
  status: SafetyDecisionStatus;
  whichCheckFired: "none" | "keyword" | "classifier" | "both" | "classifier_failure";
  matchedKeyword: string | null;
  classifierLabel: string | null;
  failureReason: string | null;
}

function normalizeForSafetyMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"()[\]{}\-_/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deterministic keyword check across English, Hinglish, and Hindi (Devanagari).
 * Always executes synchronously, even if the Gemini classifier is unavailable.
 */
export function checkSafetyKeywords(answerText: string): KeywordCheckResult {
  const normalized = normalizeForSafetyMatch(answerText);

  for (const rule of SAFETY_KEYWORDS) {
    const normPhrase = normalizeForSafetyMatch(rule.phrase);
    if (normPhrase && normalized.includes(normPhrase)) {
      return {
        matched: true,
        matchedPhrase: rule.phrase,
        category: rule.category,
      };
    }
  }

  return {
    matched: false,
    matchedPhrase: null,
    category: null,
  };
}

export interface ClassifierSimulationOptions {
  /**
   * Used only by the evaluation harness to simulate classifier failure modes
   * and verify that the fail-safe triggers as required.
   */
  simulateClassifierFailure?: "TIMEOUT" | "INVALID_JSON" | null;
  minGapMs?: number;
}

/**
 * Runs the Gemini Flash-Lite safety classifier through the centralized request queue.
 * Throws TechnicalApiError if the API times out, exhausts 429 retries, or returns
 * output that fails Zod validation.
 */
export async function runSafetyClassifier(
  answerText: string,
  options?: ClassifierSimulationOptions
): Promise<SafetyClassifierOutput> {
  return enqueueGeminiRequest(
    async () => {
      if (options?.simulateClassifierFailure === "TIMEOUT") {
        throw new TechnicalApiError(
          "TIMEOUT",
          "Simulated classifier timeout after all retries"
        );
      }

      if (options?.simulateClassifierFailure === "INVALID_JSON") {
        // Parse malformed JSON through Zod to trigger INVALID_SCHEMA failure
        const brokenPayload = { unexpectedField: "not_valid_schema" };
        const parsed = SafetyClassifierSchema.safeParse(brokenPayload);
        if (!parsed.success) {
          throw new TechnicalApiError(
            "INVALID_SCHEMA",
            `Classifier returned invalid schema: ${parsed.error.message}`
          );
        }
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "your_free_google_ai_studio_api_key_here") {
        throw new TechnicalApiError(
          "MISSING_API_KEY",
          "GEMINI_API_KEY is missing or not configured in .env.local"
        );
      }

      const ai = new GoogleGenAI({ apiKey });

      const prompt = `You are a clinical safety screening classifier for a mental health medication history tool.
Analyze the patient's statement (written in Hindi, English, or Hinglish).

Determine whether the statement indicates an URGENT crisis:
1. "self_harm_or_suicide": Any active or passive thoughts of suicide, wanting to die, ending one's life, self-harm, cutting, or taking an overdose / all pills at once.
2. "severe_physical_reaction": Any medical emergency or life-threatening physical reaction such as inability to breathe, throat closing/swelling, anaphylaxis, crushing chest pain, seizure, or fainting/collapsing.
3. "safe": Routine medication side effects (such as tiredness, mild headache/heavy head, dry mouth, insomnia, mild restlessness/ghabrahat without self-harm, stomach upset, missed doses) OR explicit negations where the patient clearly states they have NO thoughts of self-harm and NO dangerous symptoms, OR figurative everyday idioms about sleep/fatigue (e.g., "slept like a log", "bahut gehri neend aayi").

Err on the side of safety when genuine self-harm or severe physical emergency is expressed.

Return ONLY valid JSON matching this exact structure:
{
  "isUrgent": boolean,
  "label": "safe" | "self_harm_or_suicide" | "severe_physical_reaction",
  "reason": "short explanation"
}

Patient statement:
"""
${answerText}
"""`;

      const response = await ai.models.generateContent({
        model: APP_CONFIG.models.safetyClassifier,
        contents: prompt,
        config: {
          temperature: APP_CONFIG.models.safetyTemperature,
          responseMimeType: "application/json",
        },
      });

      const rawText = response.text?.trim() ?? "";
      let jsonObj: unknown;
      try {
        jsonObj = JSON.parse(rawText);
      } catch {
        throw new TechnicalApiError(
          "INVALID_SCHEMA",
          `Classifier output was not valid JSON: ${rawText.slice(0, 120)}`
        );
      }

      const validated = SafetyClassifierSchema.safeParse(jsonObj);
      if (!validated.success) {
        throw new TechnicalApiError(
          "INVALID_SCHEMA",
          `Classifier JSON failed Zod validation: ${validated.error.message}`
        );
      }

      return validated.data;
    },
    { minGapMs: options?.minGapMs }
  );
}

/**
 * Evaluates a user answer using BOTH the keyword list and the Gemini safety classifier.
 *
 * Rules:
 * - Keyword check always runs first.
 * - If either keyword check OR classifier fires -> status = "urgent".
 * - If classifier fails after all retries (timeout, error, or invalid schema):
 *   - If keyword check fired -> status = "urgent" (keyword caught it).
 *   - If keyword check did not fire -> status = "fail_safe" (pause interview, do not extract, show help + retry).
 */
export async function evaluateAnswerSafety(
  answerText: string,
  options?: ClassifierSimulationOptions & {
    questionCategory?: string;
    skipDbLog?: boolean;
  }
): Promise<SafetyEvaluationResult> {
  // Step 1: Always run the synchronous keyword check
  const keywordResult = checkSafetyKeywords(answerText);

  // Step 2: Run the LLM classifier via the rate-limited queue
  try {
    const llmResult = await runSafetyClassifier(answerText, options);
    const llmUrgent =
      llmResult.isUrgent || llmResult.label !== "safe";

    if (keywordResult.matched && llmUrgent) {
      const result: SafetyEvaluationResult = {
        status: "urgent",
        whichCheckFired: "both",
        matchedKeyword: keywordResult.matchedPhrase,
        classifierLabel: llmResult.label,
        failureReason: null,
      };
      if (!options?.skipDbLog) {
        await recordSafetyLog(result, answerText, options?.questionCategory);
      }
      return result;
    }

    if (keywordResult.matched) {
      const result: SafetyEvaluationResult = {
        status: "urgent",
        whichCheckFired: "keyword",
        matchedKeyword: keywordResult.matchedPhrase,
        classifierLabel: llmResult.label,
        failureReason: null,
      };
      if (!options?.skipDbLog) {
        await recordSafetyLog(result, answerText, options?.questionCategory);
      }
      return result;
    }

    if (llmUrgent) {
      const result: SafetyEvaluationResult = {
        status: "urgent",
        whichCheckFired: "classifier",
        matchedKeyword: null,
        classifierLabel: llmResult.label,
        failureReason: null,
      };
      if (!options?.skipDbLog) {
        await recordSafetyLog(result, answerText, options?.questionCategory);
      }
      return result;
    }

    return {
      status: "safe",
      whichCheckFired: "none",
      matchedKeyword: null,
      classifierLabel: "safe",
      failureReason: null,
    };
  } catch (error) {
    const failureCode =
      error instanceof TechnicalApiError ? error.code : "API_ERROR";
    const failureMessage =
      error instanceof Error ? error.message : String(error);

    // Even when the classifier fails, if the keyword check matched, treat as URGENT
    if (keywordResult.matched) {
      const result: SafetyEvaluationResult = {
        status: "urgent",
        whichCheckFired: "keyword",
        matchedKeyword: keywordResult.matchedPhrase,
        classifierLabel: `ERROR:${failureCode}`,
        failureReason: failureMessage,
      };
      if (!options?.skipDbLog) {
        await recordSafetyLog(result, answerText, options?.questionCategory);
      }
      return result;
    }

    // Fail-safe: classifier failed and keyword check did not match -> pause interview, do NOT extract
    const failSafeResult: SafetyEvaluationResult = {
      status: "fail_safe",
      whichCheckFired: "classifier_failure",
      matchedKeyword: null,
      classifierLabel: `ERROR:${failureCode}`,
      failureReason: failureMessage,
    };
    if (!options?.skipDbLog) {
      await recordSafetyLog(
        failSafeResult,
        answerText,
        options?.questionCategory
      );
    }
    return failSafeResult;
  }
}

/**
 * Logs every safety trigger and every fail-safe event to SQLite.
 * Stores metadata only by default; stores raw answerText ONLY when DEV_LOG_TEXT=true in .env.local.
 */
async function recordSafetyLog(
  result: SafetyEvaluationResult,
  answerText: string,
  questionCategory?: string
): Promise<void> {
  try {
    const { prisma } = await import("@/lib/db");
    const shouldIncludeText = APP_CONFIG.logging.shouldLogAnswerText();

    await prisma.safetyTriggerLog.create({
      data: {
        eventType:
          result.status === "urgent" ? "URGENT_TRIGGER" : "FAIL_SAFE",
        questionCategory: questionCategory ?? null,
        whichCheckFired: result.whichCheckFired,
        matchedKeyword: result.matchedKeyword,
        classifierLabel: result.classifierLabel,
        failureReason: result.failureReason,
        answerText: shouldIncludeText ? answerText : null,
      },
    });
  } catch {
    // Do not block the urgent help screen if the local database is not yet initialized
  }
}
