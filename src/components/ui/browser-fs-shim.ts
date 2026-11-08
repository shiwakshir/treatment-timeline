/**
 * Prototype workaround shim for Node's `fs` module in the client bundle.
 *
 * Why this exists:
 * `src/lib/timeline.ts` and `src/lib/lexicon.ts` are shared between the server
 * and client UI pages (`/` and `/interview`), and `src/lib/lexicon.ts` loads
 * `data/lexicon.json` via `fs.readFileSync(path.join(process.cwd(), "data", "lexicon.json"), "utf-8")`.
 * Because `src/lib/*` is locked as the verified source of truth and must not be
 * modified by the UI port, `next.config.ts` aliases `fs` to this shim for client
 * builds only (`!isServer`).
 *
 * Strictness guarantee:
 * `readFileSync(filePath)` only serves `data/lexicon.json` (or `data\lexicon.json`)
 * and throws an Error for any other path.
 */
import lexiconData from "../../../data/lexicon.json";

const rawLexiconJson = JSON.stringify(lexiconData);

export function readFileSync(filePath: unknown): string {
  const pathStr = String(filePath ?? "");
  const normalized = pathStr.replace(/\\/g, "/");
  if (
    normalized.endsWith("data/lexicon.json") ||
    pathStr.endsWith("data\\lexicon.json")
  ) {
    return rawLexiconJson;
  }
  throw new Error("fs is not available in the browser: " + pathStr);
}

const browserFsShim = {
  readFileSync,
};

export default browserFsShim;
