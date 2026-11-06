// Tool-result truncation (Day 9): a tool can return far more text than
// the context window should carry — a huge search hit, a long document.
// Before a result is fed back to the model (and shown in the trace), the
// runtime caps it at a fixed character budget and appends a marker that
// says how much was dropped, so the model knows it saw only a prefix
// instead of silently mistaking a cut text for the whole result.

export const DEFAULT_MAX_TOOL_RESULT_CHARS = 2000;

export interface TruncatedResult {
  text: string;
  truncated: boolean;
  /** Length of the original result, before any truncation. */
  originalLength: number;
}

/** Cap `result` at `maxChars` kept characters. Results at or under the
 *  limit pass through untouched; longer ones keep their first `maxChars`
 *  characters plus a one-line marker naming the original length and the
 *  number of omitted characters. A non-positive limit falls back to the
 *  default, so a misconfigured option can never blank out every result. */
export function truncateToolResult(
  result: string,
  maxChars: number = DEFAULT_MAX_TOOL_RESULT_CHARS,
): TruncatedResult {
  const limit = maxChars > 0 ? Math.floor(maxChars) : DEFAULT_MAX_TOOL_RESULT_CHARS;
  if (result.length <= limit) {
    return { text: result, truncated: false, originalLength: result.length };
  }
  const omitted = result.length - limit;
  const marker = `\n…[已截断：工具结果共 ${result.length} 字符，此处省略 ${omitted} 字符]`;
  return { text: result.slice(0, limit) + marker, truncated: true, originalLength: result.length };
}
