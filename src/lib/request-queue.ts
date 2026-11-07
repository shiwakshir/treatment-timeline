import { APP_CONFIG } from "@/config/app-config";

/**
 * Typed technical failure error.
 * Explicitly distinguishes API rate-limit exhaustion, timeouts, network errors,
 * and schema validation failures from clinical safety results.
 */
export type TechnicalErrorCode =
  | "TIMEOUT"
  | "RATE_LIMIT_EXHAUSTED"
  | "MISSING_API_KEY"
  | "INVALID_SCHEMA"
  | "API_ERROR";

export class TechnicalApiError extends Error {
  public readonly code: TechnicalErrorCode;
  public readonly statusCode?: number;

  constructor(code: TechnicalErrorCode, message: string, statusCode?: number) {
    super(message);
    this.name = "TechnicalApiError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Single process-wide FIFO queue that enforces:
 * 1. Minimum gap between consecutive Gemini API calls (default 6 seconds).
 * 2. Request timeout per attempt (30 seconds).
 * 3. Automatic exponential backoff retries (up to 3 retries) on HTTP 429 errors.
 */
let queueChain: Promise<unknown> = Promise.resolve();
let lastCallTimestamp = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as Record<string, unknown>;
  if (anyErr.status === 429 || anyErr.statusCode === 429 || anyErr.code === 429) {
    return true;
  }
  const msg = String(anyErr.message ?? "").toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("quota")
  );
}

async function runWithTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new TechnicalApiError(
          "TIMEOUT",
          `Gemini API request timed out after ${timeoutMs}ms`
        )
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function executeWithGapAndRetry<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options?: { minGapMs?: number }
): Promise<T> {
  const minGapMs = options?.minGapMs ?? APP_CONFIG.api.minGapBetweenCallsMs;
  const maxRetries = APP_CONFIG.api.maxRetriesOn429;
  const timeoutMs = APP_CONFIG.api.requestTimeoutMs;

  let attempt = 0;

  while (true) {
    // Enforce minimum gap between the start/completion of consecutive Gemini calls
    const now = Date.now();
    const elapsed = now - lastCallTimestamp;
    if (lastCallTimestamp > 0 && elapsed < minGapMs) {
      await sleep(minGapMs - elapsed);
    }

    lastCallTimestamp = Date.now();

    try {
      return await runWithTimeout(operation, timeoutMs);
    } catch (error) {
      if (isRateLimitError(error)) {
        if (attempt < maxRetries) {
          attempt += 1;
          // Exponential backoff: 2s, 4s, 8s
          const backoffMs =
            APP_CONFIG.api.initialBackoffMs * Math.pow(2, attempt - 1);
          await sleep(backoffMs);
          continue;
        }
        throw new TechnicalApiError(
          "RATE_LIMIT_EXHAUSTED",
          `Rate limit (429) persisted after ${maxRetries} retries.`,
          429
        );
      }

      if (error instanceof TechnicalApiError) {
        throw error;
      }

      const message =
        error instanceof Error ? error.message : String(error ?? "Unknown error");
      throw new TechnicalApiError("API_ERROR", message);
    }
  }
}

/**
 * Enqueues a Gemini API request so all calls run sequentially with at least
 * `APP_CONFIG.api.minGapBetweenCallsMs` (6 seconds) between them.
 */
export function enqueueGeminiRequest<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options?: { minGapMs?: number }
): Promise<T> {
  const nextTask = queueChain.then(
    () => executeWithGapAndRetry(operation, options),
    () => executeWithGapAndRetry(operation, options)
  );
  // Keep the chain alive even if an individual request rejects
  queueChain = nextTask.then(
    () => undefined,
    () => undefined
  );
  return nextTask;
}
