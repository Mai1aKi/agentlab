// Plan review (Day 21): when a run ends, summarize how much of
// its plan actually got done — not just the checklist mid-flight,
// but a closing tally the user can read at a glance: how many
// steps finished, what share that is, and which steps are still
// pending (by title, so an unfinished plan says what was left).
// Pure functions over the plan, so the console, the export and
// the tests all agree on the same numbers.

import type { PlanItem } from './planner';
import type { PlanReview } from './types';

/** Summarize a plan's completion. A missing or empty plan is a
 *  zero review (never NaN): total 0, percent 0, not complete. The
 *  input plan is never mutated; pending titles keep plan order. */
export function summarizePlanReview(
  plan: readonly PlanItem[] | undefined | null,
): PlanReview {
  if (!plan || plan.length === 0) {
    return {
      total: 0,
      done: 0,
      pending: 0,
      percent: 0,
      complete: false,
      pendingTitles: [],
    };
  }
  const done = plan.filter((item) => item.status === 'done').length;
  const pendingTitles = plan
    .filter((item) => item.status !== 'done')
    .map((item) => item.title);
  const pending = pendingTitles.length;
  const percent = Math.round((done / plan.length) * 100);
  return {
    total: plan.length,
    done,
    pending,
    percent,
    complete: pending === 0,
    pendingTitles,
  };
}

/** One-line rendering of a plan review, used by the trace panel
 *  and the conversation export. */
export function formatPlanReview(review: PlanReview): string {
  if (review.total === 0) return '计划回看：本次运行没有计划';
  if (review.complete) {
    return `计划回看：${review.done}/${review.total} 步已完成（${review.percent}%），全部完成`;
  }
  const left =
    review.pendingTitles.length > 0
      ? `，剩余 ${review.pending} 步未完成：${review.pendingTitles.join('、')}`
      : `，剩余 ${review.pending} 步未完成`;
  return `计划回看：${review.done}/${review.total} 步已完成（${review.percent}%）${left}`;
}
