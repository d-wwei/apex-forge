/**
 * Determine whether a failed task should be retried.
 * Returns false for successful exits (code 0) or when max attempts reached.
 */
export function shouldRetry(
  attempt: number,
  maxRetries: number,
  exitCode?: number,
): boolean {
  if (exitCode === 0) return false;
  return attempt < maxRetries;
}

/**
 * Calculate backoff delay in milliseconds with exponential growth and jitter.
 * Formula: baseMs * 2^(attempt-1) * (0.8 to 1.2 random jitter)
 */
export function backoffMs(attempt: number, baseMs: number): number {
  const exponential = baseMs * 2 ** (attempt - 1);
  const jitter = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
  return Math.round(exponential * jitter);
}
