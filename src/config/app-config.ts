/**
 * Central application configuration for treatment-timeline (Phase 1).
 *
 * Confirm these model IDs are free in my Google AI Studio dashboard.
 * Only stable free-tier Gemini API models are configured below (no preview models).
 */

export const APP_CONFIG = {
  models: {
    // Confirm these model IDs are free in my Google AI Studio dashboard.
    safetyClassifier: "gemini-3.5-flash-lite",
    safetyTemperature: 0,

    // Free stable Flash model with low temperature (<= 0.2) for clinical extraction
    extraction: "gemini-3.5-flash",
    extractionTemperature: 0.1,
  },
  api: {
    // Request timeout: 30 seconds
    requestTimeoutMs: 30_000,
    // Minimum gap between API calls: 6 seconds (configurable via GEMINI_MIN_GAP_MS)
    minGapBetweenCallsMs: Number(process.env.GEMINI_MIN_GAP_MS ?? 6_000),
    // Maximum retries on a 429 rate-limit error: 3, with exponential backoff
    maxRetriesOn429: 3,
    initialBackoffMs: 2_000,
  },
  logging: {
    // Store the raw answer text in SafetyTriggerLog ONLY when DEV_LOG_TEXT=true in .env.local
    shouldLogAnswerText: () => process.env.DEV_LOG_TEXT === "true",
  },
} as const;
