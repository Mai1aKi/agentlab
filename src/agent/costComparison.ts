// Cost comparison (Day 17): Day 10 gave every single run its own
// cost line, but comparing runs meant remembering the previous
// numbers. This module keeps a small in-memory history of run
// costs and summarizes it as one little table — pure functions
// over RunStats, so the console table and the tests agree on the
// numbers. Sanitizing lives here too: a bad label or a nonsense
// stat can never break the table or poison the totals.

import type { RunStats } from './types';

/** One row of the comparison table: what the run was called and
 *  what it cost. */
export interface RunCostEntry {
  label: string;
  stats: RunStats;
}

/** Totals + averages over a whole cost history. Averages are 0
 *  for an empty history (never NaN). */
export interface RunCostSummary {
  runs: number;
  totalSteps: number;
  totalToolCalls: number;
  totalToolErrors: number;
  totalDurationMs: number;
  averageSteps: number;
  averageDurationMs: number;
}

/** The table only keeps the most recent runs — comparing the last
 *  few runs is the point; an unbounded history would bury it. */
export const MAX_COST_ENTRIES = 10;

function sanitizeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Clamp a RunStats into safe non-negative integers. */
export function sanitizeRunStats(stats: RunStats): RunStats {
  return {
    steps: sanitizeCount(stats.steps),
    toolCalls: sanitizeCount(stats.toolCalls),
    toolErrors: sanitizeCount(stats.toolErrors),
    durationMs: sanitizeCount(stats.durationMs),
  };
}

/** A display label for a run: trimmed, single-line, capped at 40
 *  characters; an empty label falls back to its 1-based position
 *  (`运行 N`), so every row stays identifiable. */
export function normalizeCostLabel(label: unknown, index: number): string {
  const fallback = `运行 ${index + 1}`;
  if (typeof label !== 'string') return fallback;
  const cleaned = label.replace(/\s+/g, ' ').trim();
  if (!cleaned) return fallback;
  return cleaned.length > 40 ? `${cleaned.slice(0, 40)}…` : cleaned;
}

function normalizeLimit(limit: unknown): number {
  return typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
    ? Math.floor(limit)
    : MAX_COST_ENTRIES;
}

/** Append one run to the history, returning a new array (the input
 *  is left untouched) that keeps only the most recent `limit`
 *  entries. The label and stats are sanitized on the way in. */
export function recordRunCost(
  entries: readonly RunCostEntry[],
  label: unknown,
  stats: RunStats,
  limit: unknown = MAX_COST_ENTRIES,
): RunCostEntry[] {
  const entry: RunCostEntry = {
    label: normalizeCostLabel(label, entries.length),
    stats: sanitizeRunStats(stats),
  };
  const next = [...entries, entry];
  const cap = normalizeLimit(limit);
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/** Totals and averages over a cost history. */
export function summarizeRunCosts(
  entries: readonly RunCostEntry[],
): RunCostSummary {
  let totalSteps = 0;
  let totalToolCalls = 0;
  let totalToolErrors = 0;
  let totalDurationMs = 0;
  for (const entry of entries) {
    const stats = sanitizeRunStats(entry.stats);
    totalSteps += stats.steps;
    totalToolCalls += stats.toolCalls;
    totalToolErrors += stats.toolErrors;
    totalDurationMs += stats.durationMs;
  }
  const runs = entries.length;
  return {
    runs,
    totalSteps,
    totalToolCalls,
    totalToolErrors,
    totalDurationMs,
    averageSteps: runs > 0 ? totalSteps / runs : 0,
    averageDurationMs: runs > 0 ? Math.floor(totalDurationMs / runs) : 0,
  };
}

/** The comparison as plain-text lines: one row per run plus a
 *  totals row — the same numbers the console table shows. An
 *  empty history renders one explicit placeholder line. */
export function formatCostComparison(
  entries: readonly RunCostEntry[],
): string {
  if (entries.length === 0) return '暂无运行成本记录，先运行一次任务。';
  const summary = summarizeRunCosts(entries);
  const lines = entries.map((entry, i) => {
    const stats = sanitizeRunStats(entry.stats);
    return (
      `${i + 1}. ${normalizeCostLabel(entry.label, i)} — 步数 ${stats.steps} · ` +
      `工具调用 ${stats.toolCalls} 次（失败 ${stats.toolErrors} 次）· 耗时 ${stats.durationMs} ms`
    );
  });
  lines.push(
    `合计（${summary.runs} 次运行）— 步数 ${summary.totalSteps} · ` +
      `工具调用 ${summary.totalToolCalls} 次（失败 ${summary.totalToolErrors} 次）· ` +
      `耗时 ${summary.totalDurationMs} ms · 平均步数 ${summary.averageSteps.toFixed(1)} · ` +
      `平均耗时 ${summary.averageDurationMs} ms`,
  );
  return lines.join('\n');
}
