// Tool permissions (Day 13): the console can disable individual tools.
// A disabled tool is never executed — the runtime skips the call and
// feeds the reason back to the model as an error result, so the model
// can explain the situation or work around it instead of silently
// losing the call. The helpers here are pure so the normalization
// rules stay testable without a DOM or a running agent.

/** Normalize a disabled-tool list into a clean lookup set: names are
 *  trimmed, blanks dropped and duplicates removed, so a messy UI state
 *  can neither disable a tool by accident (via an empty string) nor
 *  keep stale copies around. `undefined` / `null` means nothing is
 *  disabled. */
export function normalizeDisabledTools(
  input?: Iterable<string> | null,
): Set<string> {
  const result = new Set<string>();
  if (!input) return result;
  for (const name of input) {
    const clean = typeof name === 'string' ? name.trim() : '';
    if (clean) result.add(clean);
  }
  return result;
}

/** Whether `name` is in the disabled set. */
export function isToolDisabled(
  disabled: ReadonlySet<string>,
  name: string,
): boolean {
  return disabled.has(name);
}

/** The result fed back to the model for a skipped call. It carries the
 *  usual `Error:` prefix so models (including the built-in mock) treat
 *  it like any other failed tool result, and it names both the tool
 *  and the reason: the user disabled it in the console. */
export function disabledToolResult(name: string): string {
  return `Error: tool "${name}" is disabled in the console (工具已被用户禁用)，本次调用已跳过、未执行`;
}
