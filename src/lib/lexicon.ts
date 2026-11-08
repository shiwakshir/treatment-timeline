import fs from "fs";
import path from "path";

export interface LexiconCandidateMeaning {
  meaning: string;
  meaningEn: string;
  meaningHi: string;
  status: "unvalidated";
}

export interface LexiconEntry {
  id: string;
  termHinglish: string;
  termHindi: string;
  variants: string[];
  candidateMeanings: LexiconCandidateMeaning[];
  status: string;
}

export interface LexiconFile {
  version: string;
  description: string;
  entries: LexiconEntry[];
}

let cachedLexicon: LexiconFile | null = null;

/**
 * Loads data/lexicon.json from disk.
 */
export function loadLexicon(): LexiconFile {
  if (cachedLexicon) {
    return cachedLexicon;
  }

  const lexiconPath = path.join(process.cwd(), "data", "lexicon.json");
  const raw = fs.readFileSync(lexiconPath, "utf-8");
  const parsed = JSON.parse(raw) as LexiconFile;

  cachedLexicon = parsed;
  return parsed;
}

/**
 * Returns the clinical meaning strings for a lexicon entry (used in clinician view and extraction).
 */
export function getClinicalMeanings(entry: LexiconEntry): string[] {
  return entry.candidateMeanings.map((c) => c.meaning);
}

/**
 * Resolves a clinical or raw meaning string to a plain-language patient-facing meaning:
 * - For `lang === "hi"`: returns `meaningHi` from `data/lexicon.json` (plain-language Hindi, no clinical terms).
 * - For `lang === "en"`: returns `meaningEn` from `data/lexicon.json` (plain-language English, keeping clinical terms for the clinician view only).
 */
export function resolvePatientMeaning(
  meaningStr: string,
  lang: "en" | "hi",
  matchedLexiconTerm?: string | null
): string {
  const lexicon = loadLexicon();
  const norm = meaningStr.trim().toLowerCase();

  const searchEntries = matchedLexiconTerm
    ? [
        ...lexicon.entries.filter(
          (e) =>
            e.termHinglish.toLowerCase() === matchedLexiconTerm.toLowerCase() ||
            e.termHindi === matchedLexiconTerm
        ),
        ...lexicon.entries,
      ]
    : lexicon.entries;

  for (const entry of searchEntries) {
    for (const cand of entry.candidateMeanings) {
      if (
        cand.meaning.toLowerCase() === norm ||
        cand.meaningEn.toLowerCase() === norm ||
        cand.meaningHi === meaningStr.trim()
      ) {
        return lang === "hi" ? cand.meaningHi : cand.meaningEn;
      }
    }
  }

  // Fallback for non-lexicon phrases (e.g. "Weight gain", "felt groggy")
  if (lang === "hi") {
    if (norm === "weight gain") {
      return "दवाई शुरू करने के बाद वज़न बढ़ जाना";
    }
    if (norm.includes("groggy") || norm.includes("drowsiness")) {
      return "दवाई की वजह से दिन में नींद या सुस्ती रहना";
    }
  }

  // Strip parenthetical clinical terms in patient-facing English fallback
  return meaningStr.replace(/\s*\([^)]*\)/g, "").trim();
}

function cleanCaseAndPunctuation(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"()[\]{}\-_/\\।]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Finds all lexicon entries whose Hindi, Hinglish, or variant forms appear
 * in the patient's answer text.
 * Note: Does NOT use safety `normalise()`, keeping `normalise()` strictly
 * for safety keyword matching and passing original text unchanged to extraction.
 */
export function findMatchingLexiconEntries(answerText: string): {
  entry: LexiconEntry;
  matchedSubstring: string;
}[] {
  const lexicon = loadLexicon();
  const paddedCleanAnswer = ` ${cleanCaseAndPunctuation(answerText)} `;
  const matches: { entry: LexiconEntry; matchedSubstring: string }[] = [];

  for (const entry of lexicon.entries) {
    const candidates = [
      entry.termHinglish,
      entry.termHindi,
      ...entry.variants,
    ];

    const sortedCandidates = [...candidates].sort((a, b) => b.length - a.length);

    for (const candidate of sortedCandidates) {
      const cleanCand = cleanCaseAndPunctuation(candidate);
      if (cleanCand && paddedCleanAnswer.includes(` ${cleanCand} `)) {
        matches.push({
          entry,
          matchedSubstring: candidate,
        });
        break;
      }
    }
  }

  return matches;
}

/**
 * Formats the lexicon entries as reference instructions for the Gemini extraction prompt.
 */
export function formatLexiconPromptReference(): string {
  const lexicon = loadLexicon();
  return lexicon.entries
    .map(
      (e) =>
        `- "${e.termHinglish}" / "${e.termHindi}" (variants: ${e.variants.join(", ")}) -> Candidate meanings: ${JSON.stringify(
          getClinicalMeanings(e)
        )} [status: ${e.status}]`
    )
    .join("\n");
}
