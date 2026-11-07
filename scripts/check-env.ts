import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { APP_CONFIG } from "../src/config/app-config";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();

const key = process.env.GEMINI_API_KEY?.trim() ?? "";
const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
const devLogText = process.env.DEV_LOG_TEXT?.trim() ?? "false";

if (!key || key === "your_free_google_ai_studio_api_key_here") {
  console.error("[FAIL] GEMINI_API_KEY is missing or still set to placeholder in .env.local");
  process.exit(1);
}

async function main() {
  console.log("==============================================================");
  console.log("  Environment & Model Smoke Check (.env.local)");
  console.log("==============================================================");
  console.log(`  GEMINI_API_KEY : SET (length=${key.length}, prefix=${key.slice(0, 4)}***)`);
  console.log(`  DATABASE_URL   : ${dbUrl || "not set"}`);
  console.log(`  DEV_LOG_TEXT   : ${devLogText}`);

  const ai = new GoogleGenAI({ apiKey: key });

  for (const modelId of [
    APP_CONFIG.models.safetyClassifier,
    APP_CONFIG.models.extraction,
  ]) {
    try {
      const res = await ai.models.generateContent({
        model: modelId,
        contents: 'Return JSON: {"ok": true}',
        config: { temperature: 0, responseMimeType: "application/json" },
      });
      console.log(`  [PASS] Model "${modelId}" responded: ${res.text?.trim()}`);
    } catch (err) {
      console.error(
        `  [FAIL] Model "${modelId}" error:`,
        err instanceof Error ? err.message : String(err)
      );
      process.exitCode = 1;
    }
  }
  console.log("==============================================================");
}

main();
