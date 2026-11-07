// Run-cost statistics (Day 10): every run already leaves a full trace,
// so its cost can be derived from that trace plus a wall-clock duration
// — how many model steps it took, how many tool calls it made (and how
// many of those failed), and how long it ran. Pure functions over the
// trace, so the numbers the console panel shows are exactly what tests
// can assert, with no timing flakiness in the derivation itself.

import type { RunStats, TraceEvent } from './types';

/** Derive run stats from a trace and a measured duration. `steps` is
 *  the highest model step seen (0 when the model never spoke);
 *  `toolCalls` / `toolErrors` count toolResult events. A negative or
 *  non-finite duration is clamped to 0 and fractions are floored, so a
 *  misbehaving clock can never produce nonsense stats. */
export function computeRunStats(
  trace: readonly TraceEvent[],
  durationMs: number,
): RunStats {
  let steps = 0;
  let toolCalls = 0;
  let toolErrors = 0;
  for (const event of trace) {
    if (event.type === 'modelReply') {
      if (event.step > steps) steps = event.step;
    } else if (event.type === 'toolResult') {
      toolCalls += 1;
      if (event.isError) toolErrors += 1;
    }
  }
  const safeDuration =
    Number.isFinite(durationMs) && durationMs > 0 ? Math.floor(durationMs) : 0;
  return { steps, toolCalls, toolErrors, durationMs: safeDuration };
}

/** One-line rendering of run stats, used by the trace panel. */
export function formatRunStats(stats: RunStats): string {
  return (
    `步数 ${stats.steps} · 工具调用 ${stats.toolCalls} 次` +
    `（失败 ${stats.toolErrors} 次）· 耗时 ${stats.durationMs} ms`
  );
}
