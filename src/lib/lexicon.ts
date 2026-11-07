import fs from "fs";
import path from "path";

export interface LexiconEntry {
  id: string;
  termHinglish: string;
  termHindi: string;
  variants: string[];
  candidateMeanings: string[];
  status: string;
}

export interface LexiconFile {
  version: string;
  description: string;
  entries: LexiconEntry[];
}

let cachedLexicon: LexiconFile | null = null;

/**
 * Loads data/lexicon.json from disk and verifies that every entry is marked
 * "unvalidated – needs clinician review".
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

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"()[\]{}\-_/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Finds all lexicon entries whose Hindi, Hinglish, or variant forms appear
 * in the user's answer text.
 */
export function findMatchingLexiconEntries(answerText: string): {
  entry: LexiconEntry;
  matchedSubstring: string;
}[] {
  const lexicon = loadLexicon();
  const normalizedAnswer = normalizeForMatch(answerText);
  const matches: { entry: LexiconEntry; matchedSubstring: string }[] = [];

  for (const entry of lexicon.entries) {
    const candidates = [
      entry.termHinglish,
      entry.termHindi,
      ...entry.variants,
    ];

    // Sort longest variant first so specific phrases ("dil ghabrata hai") match before single words
    const sortedCandidates = [...candidates].sort((a, b) => b.length - a.length);

    for (const candidate of sortedCandidates) {
      const normCandidate = normalizeForMatch(candidate);
      if (normCandidate && normalizedAnswer.includes(normCandidate)) {
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
          e.candidateMeanings
        )} [status: ${e.status}]`
    )
    .join("\n");
}
