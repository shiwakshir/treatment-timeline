import fs from "fs";
import path from "path";

const FORBIDDEN_PATTERNS = [
  "@google/genai",
  "generativelanguage",
  "GEMINI_API_KEY",
  "SAFETY_KEYWORDS",
  "buildSafetyClassifierPrompt",
];

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) {
    return results;
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function main() {
  const staticDir = path.join(process.cwd(), ".next", "static");
  if (!fs.existsSync(staticDir)) {
    console.error(
      "ERROR: .next/static does not exist. Run `npm run build` first."
    );
    process.exit(1);
  }

  const files = collectFiles(staticDir);
  const violations: { file: string; pattern: string }[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (content.includes(pattern)) {
        violations.push({
          file: path.relative(process.cwd(), file),
          pattern,
        });
      }
    }
  }

  console.log("==============================================================");
  console.log("  Client Bundle Security & Isolation Check (.next/static)");
  console.log("==============================================================");
  console.log(`Files scanned      : ${files.length}`);
  console.log(`Forbidden patterns : ${FORBIDDEN_PATTERNS.join(", ")}`);

  if (violations.length > 0) {
    console.error("--------------------------------------------------------------");
    console.error(`FAIL: Found ${violations.length} forbidden match(es):`);
    for (const v of violations) {
      console.error(`  - ${v.file}: contains "${v.pattern}"`);
    }
    console.error("==============================================================");
    process.exit(1);
  }

  console.log("--------------------------------------------------------------");
  console.log("  PASS: 0 forbidden server/safety/API strings found in .next/static.");
  console.log("==============================================================");
}

main();
