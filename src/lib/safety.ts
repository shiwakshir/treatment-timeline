import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { APP_CONFIG } from "@/config/app-config";
import {
  enqueueGeminiRequest,
  TechnicalApiError,
} from "@/lib/request-queue";

/**
 * Whole-token Hinglish spelling variant map used ONLY by normalise() for safety
 * keyword matching.
 *
 * Notes on exclusions:
 * - "nai" is intentionally excluded because "nai" (नई) means "new" (e.g. "nai dawai").
 * - "saas" is intentionally excluded because "saas" (सास) means "mother-in-law".
 */
const HINGLISH_TOKEN_MAP: Record<string, string> = {
  // Negation variants -> "nahi" ("nai" excluded)
  nahi: "nahi",
  nahin: "nahi",
  nhi: "nahi",
  nahee: "nahi",
  nhin: "nahi",

  // Mind / desire variants -> "man"
  mann: "man",
  man: "man",
  mn: "man",
  mannn: "man",

  // Breath variants -> "sans" ("saas" excluded)
  saans: "sans",
  sans: "sans",
  saansein: "sans",

  // Living variants -> "jine"
  jeene: "jine",
  jine: "jine",
  jeena: "jine",
  jina: "jine",

  // Harm variants -> "nuksan"
  nuksan: "nuksan",
  nuksaan: "nuksan",
  nuqsan: "nuksan",
  nuqsaan: "nuksan",

  // First-person subjunctive / auxiliaries
  doon: "dun",
  dun: "dun",
  du: "dun",
  uthun: "uthun",
  uthoon: "uthun",
  uthu: "uthun",

  // Thoughts -> "khayal"
  khayal: "khayal",
  khayaal: "khayal",
  khyal: "khayal",

  // Pills -> "goliyan"
  goliyaan: "goliyan",
  goliyan: "goliyan",
  goliya: "goliyan",
  golia: "goliyan",
};

/**
 * Normalises input text strictly for safety keyword matching.
 * (Extraction always receives the patient's original text unchanged.)
 *
 * Steps:
 * 1. Lowercases text.
 * 2. Normalises Devanagari:
 *    - Decomposes NFD and removes nukta (\u093C) so क़/क, ख़/ख, ग़/ग, ज़/ज, ड़/ड, ढ़/ढ, फ़/फ are equal.
 *    - Maps chandrabindu (ँ, \u0901) to anusvara (ं, \u0902) so साँस/सांस, गोलियाँ/गोलियां, उठूँ/उठूं, दूँ/दूं are equal.
 * 3. Strips punctuation (retaining Latin a-z, digits 0-9, and Devanagari \u0900-\u097F).
 * 4. Splits into whole whitespace-delimited tokens. For each Latin token:
 *    - Applies HINGLISH_TOKEN_MAP to the whole token only (never substrings).
 *    - Collapses repeated letters (e.g. aa->a, ee->e, oo->o, nn->n), except preserving "saas" distinct from "sans".
 *    - Re-applies HINGLISH_TOKEN_MAP to the collapsed whole token.
 */
export function normalise(text: string): string {
  const deNukta = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\u093C/g, "")
    .normalize("NFC")
    .replace(/\u0901/g, "\u0902");

  const stripped = deNukta
    .replace(/[^a-z0-9\u0900-\u097F\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!stripped) return "";

  const tokens = stripped.split(" ").map((token) => {
    if (/^[a-z0-9]+$/.test(token)) {
      if (Object.prototype.hasOwnProperty.call(HINGLISH_TOKEN_MAP, token)) {
        return HINGLISH_TOKEN_MAP[token];
      }
      const collapsed = token.replace(/([a-z])\1+/g, "$1");
      if (Object.prototype.hasOwnProperty.call(HINGLISH_TOKEN_MAP, collapsed)) {
        return HINGLISH_TOKEN_MAP[collapsed];
      }
      return collapsed;
    }
    return token;
  });

  return tokens.join(" ");
}

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
 * Duplicate entries covered by normalise() have been removed.
 */
export const SAFETY_KEYWORDS: SafetyKeywordRule[] = [
  // --- ENGLISH: Self-harm, suicide, overdose ---
  { phrase: "suicide", language: "en", category: "self_harm_or_suicide" },
  { phrase: "suicidal", language: "en", category: "self_harm_or_suicide" },
  { phrase: "kill myself", language: "en", category: "self_harm_or_suicide" },
  { phrase: "end my life", language: "en", category: "self_harm_or_suicide" },
  { phrase: "ending my life", language: "en", category: "self_harm_or_suicide" },
  { phrase: "end it all", language: "en", category: "self_harm_or_suicide" },
  { phrase: "no point carrying on", language: "en", category: "self_harm_or_suicide" },
  { phrase: "no point living", language: "en", category: "self_harm_or_suicide" },
  { phrase: "don't want to wake up", language: "en", category: "self_harm_or_suicide" },
  { phrase: "everyone would be better off without me", language: "en", category: "self_harm_or_suicide" },
  { phrase: "want to die", language: "en", category: "self_harm_or_suicide" },
  { phrase: "better off dead", language: "en", category: "self_harm_or_suicide" },
  { phrase: "self-harm", language: "en", category: "self_harm_or_suicide" },
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
  { phrase: "jeene ka koi fayda nahi", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "bhagwan mujhe utha le", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "upar wala utha le", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "subah na uthun", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "sab khatam kar doon", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "mere bina sab behtar", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "mar jaana chahta", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "mar jaana chahti", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "mar jaane ka mann", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "marne ka mann", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "marne ke khayal", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "khud ko nuksan", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "apne aap ko nuksan", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "khudkushi", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "aatmahatya", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "zindagi khatam kar", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "apni jaan de", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "apni jaan lena", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "saari goliyaan ek saath", language: "hinglish", category: "self_harm_or_suicide" },
  { phrase: "nas kaat", language: "hinglish", category: "self_harm_or_suicide" },

  // --- HINGLISH (Roman Hindi): Severe physical reactions ---
  { phrase: "saans nahi aa rahi", language: "hinglish", category: "severe_physical_reaction" },
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
  { phrase: "भगवान मुझे उठा ले", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "सुबह न उठूँ", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "सब खत्म कर दूँ", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "मेरे बिना सब बेहतर", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "मरने का मन", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "मर जाने का मन", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "मरने के ख्याल", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "मरने के विचार", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "खुद को नुकसान", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "अपने आप को नुकसान", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "अपनी जान दे", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "ज़िंदगी खत्म कर", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "सारी गोलियाँ एक साथ", language: "hi", category: "self_harm_or_suicide" },
  { phrase: "नस काट", language: "hi", category: "self_harm_or_suicide" },

  // --- HINDI (Devanagari): Severe physical reactions ---
  { phrase: "साँस नहीं आ रही", language: "hi", category: "severe_physical_reaction" },
  { phrase: "साँस रुक रही", language: "hi", category: "severe_physical_reaction" },
  { phrase: "गला बंद हो रहा", language: "hi", category: "severe_physical_reaction" },
  { phrase: "गले में सूजन", language: "hi", category: "severe_physical_reaction" },
  { phrase: "सीने में तेज़ दर्द", language: "hi", category: "severe_physical_reaction" },
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
  whichCheckFired:
    | "none"
    | "keyword"
    | "classifier"
    | "both"
    | "classifier_failure";
  matchedKeyword: string | null;
  classifierLabel: string | null;
  failureReason: string | null;
}

/**
 * Checks whether `ruleTokens` appear as an exact contiguous sequence of whole tokens
 * inside `inputTokens`. Guarantees token-boundary matching so "end it all"
 * never matches "spend it all".
 */
function containsContiguousTokenSequence(
  inputTokens: string[],
  ruleTokens: string[]
): boolean {
  if (ruleTokens.length === 0 || inputTokens.length < ruleTokens.length) {
    return false;
  }

  const limit = inputTokens.length - ruleTokens.length;
  for (let i = 0; i <= limit; i++) {
    let allMatch = true;
    for (let j = 0; j < ruleTokens.length; j++) {
      if (inputTokens[i + j] !== ruleTokens[j]) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) {
      return true;
    }
  }
  return false;
}

/**
 * Deterministic keyword check across English, Hinglish, and Hindi (Devanagari).
 * Runs `normalise()` on both the input text and each keyword rule and matches
 * strictly on whole-token boundaries.
 */
export function checkSafetyKeywords(answerText: string): KeywordCheckResult {
  const normalizedInput = normalise(answerText);
  if (!normalizedInput) {
    return { matched: false, matchedPhrase: null, category: null };
  }

  const inputTokens = normalizedInput.split(" ");

  for (const rule of SAFETY_KEYWORDS) {
    const normalizedRule = normalise(rule.phrase);
    if (!normalizedRule) continue;

    const ruleTokens = normalizedRule.split(" ");
    if (containsContiguousTokenSequence(inputTokens, ruleTokens)) {
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
  simulateClassifierFailure?: "TIMEOUT" | "INVALID_JSON" | null;
  minGapMs?: number;
}

export function buildSafetyClassifierPrompt(answerText: string): string {
  return `You are a clinical safety screening classifier for a mental health medication history tool.
Analyze the patient's statement (written in Hindi, English, or Hinglish).

Determine whether the statement indicates an URGENT crisis:
1. "self_harm_or_suicide": Any active OR passive thoughts of suicide, wanting to die, wishing not to exist ("agar main na rahun toh kisi ko farak nahi padega"), feeling unable to go on and wanting everything to stop ("ab aur sahne ki taakat nahi bachi, bas sab ruk jaaye", "want everything to stop for good"), wanting not to wake up, ending one's life, self-harm, cutting, or taking an overdose / all pills at once.
2. "severe_physical_reaction": Any medical emergency or life-threatening physical reaction such as inability to breathe, throat closing/swelling, anaphylaxis, crushing chest pain, seizure, or fainting/collapsing.
3. "safe": Routine medication side effects (tiredness, sleepiness/falling asleep at work, headache/heavy head, dry mouth, insomnia, mild restlessness/ghabrahat without self-harm, weight gain, stomach upset, missed doses, cost issues) OR explicit negations where the patient clearly states they have NO thoughts of self-harm or dying ("marne ke khayal kabhi nahi aaye", "koi galat khayal nahi aata") OR figurative everyday idioms about deep sleep ("slept like a log").

Err on the side of safety when genuine passive or active suicidal ideation or severe physical emergency is expressed.

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
}

/**
 * Runs the Gemini Flash-Lite safety classifier through the centralized request queue.
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

      const prompt = buildSafetyClassifierPrompt(answerText);

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
 */
export async function evaluateAnswerSafety(
  answerText: string,
  options?: ClassifierSimulationOptions & {
    questionCategory?: string;
    skipDbLog?: boolean;
  }
): Promise<SafetyEvaluationResult> {
  // Step 1: Always run the synchronous keyword check (using normalise() on whole tokens)
  const keywordResult = checkSafetyKeywords(answerText);

  // Step 2: Run the LLM classifier via the rate-limited queue
  try {
    const llmResult = await runSafetyClassifier(answerText, options);
    const llmUrgent = llmResult.isUrgent || llmResult.label !== "safe";

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
