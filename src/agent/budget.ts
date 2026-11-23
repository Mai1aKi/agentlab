// Budget alert (Day 23): a single run gets a small budget —
// so many model steps, so many milliseconds — and when the run
// goes over either limit the trace says so, instead of the user
// having to eyeball the run stats and guess. Pure functions over
// the run stats, so the console, the export and the tests all
// agree on when a run is over budget and by how much.

import type { BudgetCheck, RunBudget, RunStats } from './types';

/** Default per-run budget: at most 6 model steps and 3 seconds.
 *  Deliberately below the runtime's hard maxSteps cutoff, so the
 *  alert is an early warning, not the stop itself. */
export const DEFAULT_BUDGET_MAX_STEPS = 6;
export const DEFAULT_BUDGET_MAX_DURATION_MS = 3000;

/** Sanitize one budget limit: a positive finite number is floored;
 *  anything else (missing, non-number, non-finite, <= 0) falls back
 *  to the given default, so a misconfigured budget can never
 *  silently disable the alert or fire on every run. */
function sanitizeLimit(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

/** Sanitize a (possibly partial) budget into a complete one. */
export function sanitizeBudget(
  budget: Partial<RunBudget> | undefined | null,
): RunBudget {
  return {
    maxSteps: sanitizeLimit(budget?.maxSteps, DEFAULT_BUDGET_MAX_STEPS),
    maxDurationMs: sanitizeLimit(
      budget?.maxDurationMs,
      DEFAULT_BUDGET_MAX_DURATION_MS,
    ),
  };
}

function sanitizeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

/** Check run stats against a budget. A run is over budget only
 *  when it strictly exceeds a limit (exactly at the limit is
 *  still within budget). Stats are sanitized the same way the
 *  budget is, so bad numbers can never fake an alert. */
export function evaluateBudget(
  stats: RunStats,
  budget?: Partial<RunBudget> | null,
): BudgetCheck {
  const limits = sanitizeBudget(budget);
  const steps = sanitizeCount(stats?.steps);
  const durationMs = sanitizeCount(stats?.durationMs);
  const overSteps = steps > limits.maxSteps;
  const overDuration = durationMs > limits.maxDurationMs;
  return {
    maxSteps: limits.maxSteps,
    maxDurationMs: limits.maxDurationMs,
    steps,
    durationMs,
    overSteps,
    overDuration,
    exceeded: overSteps || overDuration,
  };
}

/** One-line rendering of a budget check, used by the trace panel
 *  and the conversation export. */
export function formatBudgetAlert(check: BudgetCheck): string {
  if (!check.exceeded) {
    return (
      `预算提醒：未超预算（步数 ${check.steps}/${check.maxSteps}` +
      ` · 耗时 ${check.durationMs}/${check.maxDurationMs} ms）`
    );
  }
  const reasons: string[] = [];
  if (check.overSteps) {
    reasons.push(`步数 ${check.steps} 超过预算 ${check.maxSteps}`);
  }
  if (check.overDuration) {
    reasons.push(`耗时 ${check.durationMs} ms 超过预算 ${check.maxDurationMs} ms`);
  }
  return `预算提醒：${reasons.join('；')}`;
}
