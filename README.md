# Treatment Timeline (`treatment-timeline`)

> **PROTOTYPE ONLY — DO NOT USE WITH REAL PATIENT DATA**
> This prototype is for demos and research conversations only. It must never be used with real patient data.

A local-only, multilingual (Hindi Devanagari, English, and Hinglish) patient-held mental health treatment history prototype. The patient describes past medications in their own words, and the tool structures this into a clinician-readable timeline while preserving the patient's exact words alongside confirmed categories.

---

## Quick Start (Local Only)

### 1. Prerequisites
- **Node.js 20+**
- **A Free Google AI Studio Gemini API Key**:
  1. Go to [Google AI Studio](https://aistudio.google.com/apikey).
  2. Create a free API key in a project on the **Free Tier** (do not enable billing if you wish to strictly enforce zero cost).
  3. Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY`:
     ```bash
     cp .env.example .env.local
     ```

### 2. Install & Initialize Local SQLite Database
```bash
npm install
npx prisma generate
npm run db:push
npm run db:seed
```

### 3. Verify Environment & Run Local App
```bash
npm run check:env
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

---

## Core Architecture & Safety Rules

1. **Free-Tier Only (`src/config/app-config.ts`)**:
   - Uses `gemini-3.5-flash-lite` (`temperature: 0`) for the safety classifier and `gemini-3.5-flash` (`temperature: 0.1`) for structured extraction.
   - All Gemini calls pass through a single **Request Queue (`src/lib/request-queue.ts`)** enforcing a **6-second minimum gap** between calls, a **30-second timeout**, and up to **3 exponential backoff retries** on HTTP `429`.
2. **Safety Step First (`src/lib/safety.ts`)**:
   - Every patient answer is checked **before** extraction or saving:
     1. Whole-token normalised keyword matcher (`normalise()` + `checkSafetyKeywords()`) across English, Hinglish, and Hindi Devanagari.
     2. Gemini Flash-Lite classifier (`URGENT` vs `CONTINUE`).
   - **Urgent Help Screen**: If either check triggers, the interview stops immediately, nothing from that answer is saved, a trigger log is recorded, and UK (`999`, `NHS 111 option 2`, `Samaritans 116 123`) and India (`112`, `Tele-MANAS 14416`) helplines are displayed.
   - **Fail-Safe Pause**: If the classifier fails technically (timeout, 429 exhaustion, or invalid JSON) and no keyword matched, the answer is **never** sent to extraction. The interview pauses, displays helpline numbers, logs a fail-safe event, and lets the user retry.
3. **Structured Extraction (`src/lib/extraction.ts`)**:
   - Uses a unified `{ state, value, statedOptions }` object per clinical field (`adherence`, `effect`, `sideEffects`, `stoppingReason`, `stoppedBy`, `dose`, `durationTaken`, `onsetAfterStarting`), plus `doseTimingText`.
   - `state` distinguishes `"known"`, `"uncertain"`, `"unknown"` (patient stated they don't remember), and `"not_mentioned"` (answer did not address the field).
   - Never generates free-text clinical summaries via LLM.
4. **Deterministic Read-Back Gate (`src/lib/timeline.ts`)**:
   - Builds bilingual (English + Hindi) read-back summaries from fixed code templates (`buildReadBackSummary`).
   - Requires explicit patient confirmation before saving to SQLite.

---

## Scripts

- `npm run dev` — Run Next.js local server
- `npm run check:env` — Verify `.env.local` and Gemini API key connectivity
- `npm run test:normalise` — Run unit tests for `normalise()` and whole-token safety keyword matching
- `npm run preview:readback` — Print English and Hindi read-back summaries for fixtures `fix-03`, `fix-07`, `fix-11`, and `fix-26`
- `npm run eval` — Run 26-fixture multilingual evaluation harness (uses `.eval-cache.json` by default)
- `npm run eval -- --no-cache` — Force fresh API calls for all fixtures
- `npm run eval -- --repeat 3` — Run the 14 safety fixtures 3 times to verify classifier consistency
- `npm run db:push` — Push Prisma SQLite schema to `prisma/dev.db`
- `npm run db:seed` — Seed 3 synthetic patient stories (Aarav, Meera, Rohan)

---

## Phase Plan

- **Phase 1 (Current)**: Core safety gate, request queue, lexicon disambiguation, unified structured extraction, deterministic bilingual read-back confirmation gate, 26-fixture evaluation harness, and plain functional UI.
- **Phase 2**: Visual design refinement (via Lovable UI import) preserving all Phase 1 safety and extraction modules untouched.
- **Phase 3**: Multi-turn follow-up question refinement for missing fields (`not_mentioned`).
- **Phase 4**: Clinician print/export layout and longitudinal comparison enhancements.
- **Phase 5**: User research usability sessions with synthetic scenarios.
