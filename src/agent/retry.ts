// Tool-failure retry (Day 11): a tool call can fail for a transient
// reason — a flaky lookup, a momentary hiccup — where simply trying
// the exact same call once more succeeds. The runtime therefore
// retries a failed call a small number of times (once by default)
// before feeding anything back to the model, and marks each retry in
// the trace so the recovery is visible instead of silent. Only the
// final outcome becomes a tool result: intermediate failures never
// reach the model, so it never sees duplicate answers to one call.

export const DEFAULT_MAX_TOOL_RETRIES = 1;

/** Sanitize a configured retry count. `undefined` uses the default;
 *  an explicit 0 disables retrying; negative or non-finite values
 *  fall back to the default, so a misconfigured option can neither
 *  disable retries by accident nor loop forever. Fractions floor. */
export function resolveMaxToolRetries(value?: number): number {
  if (value === undefined) return DEFAULT_MAX_TOOL_RETRIES;
  if (!Number.isFinite(value) || value < 0) return DEFAULT_MAX_TOOL_RETRIES;
  return Math.floor(value);
}
