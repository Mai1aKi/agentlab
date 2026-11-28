// Day 28 · Dual-run comparison: running the same task twice used
// to mean scrolling back and comparing from memory. This module
// keeps finished run snapshots (task + final answer + cost) and
// picks the latest same-task pair, rendering the two answers and
// costs side by side with signed deltas. Pure functions; stats
// sanitizing reuses Day 17 so bad numbers can never poison a pair.

import { sanitizeRunStats } from './costComparison';
import type { RunStats } from './types';

export interface RunSnapshot {
  task: string;
  finalText: string;
  stats: RunStats;
}

export interface RunComparison {
  task: string;
  first: RunSnapshot;
  second: RunSnapshot;
  answersEqual: boolean;
  stepsDelta: number;
  toolCallsDelta: number;
  toolErrorsDelta: number;
  durationDeltaMs: number;
}

export const MAX_RUN_SNAPSHOTS = 20;

/** Task text for display/matching: trimmed, whitespace collapsed;
 *  non-strings and blanks become an empty string (never matchable). */
export function normalizeRunTask(task: unknown): string {
  return typeof task === 'string' ? task.replace(/\s+/g, ' ').trim() : '';
}

function normalizeAnswer(text: unknown): string {
  return typeof text === 'string' ? text.trim() : '';
}

/** Append one finished run, returning a new array capped at the
 *  most recent MAX_RUN_SNAPSHOTS. Blank tasks are ignored. */
export function recordRunSnapshot(
  snapshots: readonly RunSnapshot[],
  task: unknown,
  finalText: unknown,
  stats: RunStats,
): RunSnapshot[] {
  const cleanTask = normalizeRunTask(task);
  if (!cleanTask) return [...snapshots];
  const entry: RunSnapshot = {
    task: cleanTask,
    finalText: normalizeAnswer(finalText),
    stats: sanitizeRunStats(stats),
  };
  const next = [...snapshots, entry];
  return next.length > MAX_RUN_SNAPSHOTS
    ? next.slice(next.length - MAX_RUN_SNAPSHOTS)
    : next;
}

/** The latest pair of runs for the same task: scan from the end for
 *  the newest snapshot that has an earlier run with the same
 *  (normalized) task. Returns [earlier, later] or null. */
export function findLatestSameTaskPair(
  snapshots: readonly RunSnapshot[],
): [RunSnapshot, RunSnapshot] | null {
  for (let later = snapshots.length - 1; later > 0; later -= 1) {
    const task = normalizeRunTask(snapshots[later].task);
    if (!task) continue;
    for (let earlier = later - 1; earlier >= 0; earlier -= 1) {
      if (normalizeRunTask(snapshots[earlier].task) === task) {
        return [snapshots[earlier], snapshots[later]];
      }
    }
  }
  return null;
}

/** Compare two snapshots: signed deltas are second − first, and
 *  answers are compared after trimming. */
export function compareRunSnapshots(
  first: RunSnapshot,
  second: RunSnapshot,
): RunComparison {
  const a = sanitizeRunStats(first.stats);
  const b = sanitizeRunStats(second.stats);
  return {
    task: normalizeRunTask(second.task) || normalizeRunTask(first.task),
    first: { ...first, stats: a },
    second: { ...second, stats: b },
    answersEqual: normalizeAnswer(first.finalText) === normalizeAnswer(second.finalText),
    stepsDelta: b.steps - a.steps,
    toolCallsDelta: b.toolCalls - a.toolCalls,
    toolErrorsDelta: b.toolErrors - a.toolErrors,
    durationDeltaMs: b.durationMs - a.durationMs,
  };
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function signedMs(n: number): string {
  return n > 0 ? `+${n} ms` : `${n} ms`;
}

function costLine(label: string, s: RunStats): string {
  return `${label} — 步数 ${s.steps} · 工具调用 ${s.toolCalls} 次（失败 ${s.toolErrors} 次）· 耗时 ${s.durationMs} ms`;
}

/** Side-by-side rendering as plain lines: task, both answers, both
 *  cost lines, then the delta/verdict line. Null renders an
 *  explicit placeholder. */
export function formatRunComparison(c: RunComparison | null): string {
  if (!c) return '暂无双运行对比：把同一个任务运行两次后，这里会并排回看。';
  return [
    `双运行对比 · 任务：${c.task}`,
    `第一次回答：${c.first.finalText || '（空）'}`,
    `第二次回答：${c.second.finalText || '（空）'}`,
    costLine('第一次成本', c.first.stats),
    costLine('第二次成本', c.second.stats),
    `差异 — 回答${c.answersEqual ? '相同' : '不同'} · 步数 ${signed(c.stepsDelta)} · ` +
      `工具调用 ${signed(c.toolCallsDelta)} · 失败 ${signed(c.toolErrorsDelta)} · ` +
      `耗时 ${signedMs(c.durationDeltaMs)}`,
  ].join('\n');
}
