// Tool-call timing (Day 20): every tool result is annotated with
// how long that call took, so a slow tool stands out in the trace
// panel instead of hiding inside the whole run's duration. The
// sanitizer and formatter are pure functions, so the numbers the
// console shows are exactly what tests can assert, and a
// misbehaving clock can never produce nonsense timings.

/** Coerce an unknown duration into a safe millisecond count:
 *  non-numbers, non-finite and negative values become 0, positive
 *  fractions are floored. A bad clock therefore yields 0 ms rather
 *  than a negative or fractional annotation. */
export function sanitizeToolDuration(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

/** The elapsed time between two clock readings, sanitized. An end
 *  reading before the start (a clock that went backwards) is 0. */
export function measureToolDuration(startedAt: unknown, endedAt: unknown): number {
  if (typeof startedAt !== 'number' || typeof endedAt !== 'number') return 0;
  return sanitizeToolDuration(endedAt - startedAt);
}

/** One-line rendering of a tool call's duration, used by the trace
 *  panel and the conversation export. Missing durations (traces
 *  recorded before Day 20) render as 0 ms so old traces still get
 *  a consistent annotation when replayed through new helpers. */
export function formatToolDuration(durationMs: unknown): string {
  return `耗时 ${sanitizeToolDuration(durationMs)} ms`;
}
