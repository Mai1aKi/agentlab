import { describe, expect, it } from 'vitest';
import {
  MAX_COST_ENTRIES,
  formatCostComparison,
  normalizeCostLabel,
  recordRunCost,
  sanitizeRunStats,
  summarizeRunCosts,
  type RunCostEntry,
} from '../src/agent/costComparison';
import type { RunStats } from '../src/agent/types';

const stats = (over: Partial<RunStats> = {}): RunStats => ({
  steps: 2,
  toolCalls: 1,
  toolErrors: 0,
  durationMs: 100,
  ...over,
});

describe('cost comparison (Day 17)', () => {
  it('sanitizes stats and labels', () => {
    expect(
      sanitizeRunStats({ steps: 2.9, toolCalls: -1, toolErrors: Number.NaN, durationMs: 50.5 }),
    ).toEqual({ steps: 2, toolCalls: 0, toolErrors: 0, durationMs: 50 });
    expect(normalizeCostLabel('  计算   1 + 1  ', 0)).toBe('计算 1 + 1');
    expect(normalizeCostLabel('   ', 2)).toBe('运行 3');
    expect(normalizeCostLabel(undefined, 0)).toBe('运行 1');
    expect(normalizeCostLabel('x'.repeat(50), 0)).toHaveLength(41);
  });

  it('records runs immutably and sanitizes on the way in', () => {
    const empty: RunCostEntry[] = [];
    const one = recordRunCost(empty, ' 第一次 ', stats({ durationMs: 99.9 }));
    expect(empty).toEqual([]);
    expect(one).toEqual([{ label: '第一次', stats: stats({ durationMs: 99 }) }]);
    const two = recordRunCost(one, '', stats());
    expect(two.map((e) => e.label)).toEqual(['第一次', '运行 2']);
  });

  it('keeps only the most recent entries up to the limit', () => {
    let entries: RunCostEntry[] = [];
    for (let i = 1; i <= MAX_COST_ENTRIES + 2; i += 1) {
      entries = recordRunCost(entries, `run ${i}`, stats());
    }
    expect(entries).toHaveLength(MAX_COST_ENTRIES);
    expect(entries[0].label).toBe('run 3');
    expect(entries[entries.length - 1].label).toBe(`run ${MAX_COST_ENTRIES + 2}`);
    const capped = recordRunCost(entries, 'extra', stats(), 3);
    expect(capped.map((e) => e.label)).toEqual([
      `run ${MAX_COST_ENTRIES + 1}`,
      `run ${MAX_COST_ENTRIES + 2}`,
      'extra',
    ]);
    // A bad limit falls back to the default cap instead of emptying the table.
    expect(recordRunCost(entries, 'extra', stats(), 0)).toHaveLength(MAX_COST_ENTRIES);
  });

  it('summarizes totals and averages, with zeros for an empty history', () => {
    const entries: RunCostEntry[] = [
      { label: 'a', stats: stats({ steps: 2, toolCalls: 1, toolErrors: 0, durationMs: 100 }) },
      { label: 'b', stats: stats({ steps: 4, toolCalls: 3, toolErrors: 1, durationMs: 251 }) },
    ];
    expect(summarizeRunCosts(entries)).toEqual({
      runs: 2,
      totalSteps: 6,
      totalToolCalls: 4,
      totalToolErrors: 1,
      totalDurationMs: 351,
      averageSteps: 3,
      averageDurationMs: 175,
    });
    expect(summarizeRunCosts([])).toEqual({
      runs: 0,
      totalSteps: 0,
      totalToolCalls: 0,
      totalToolErrors: 0,
      totalDurationMs: 0,
      averageSteps: 0,
      averageDurationMs: 0,
    });
  });

  it('formats one row per run plus a totals row', () => {
    const entries: RunCostEntry[] = [
      { label: '计算 1 + 1', stats: stats({ steps: 2, toolCalls: 1, durationMs: 250 }) },
      { label: '现在几点', stats: stats({ steps: 3, toolCalls: 2, toolErrors: 1, durationMs: 350 }) },
    ];
    const text = formatCostComparison(entries);
    const lines = text.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('1. 计算 1 + 1');
    expect(lines[0]).toContain('耗时 250 ms');
    expect(lines[1]).toContain('失败 1 次');
    expect(lines[2]).toContain('合计（2 次运行）');
    expect(lines[2]).toContain('步数 5');
    expect(lines[2]).toContain('平均步数 2.5');
    expect(lines[2]).toContain('平均耗时 300 ms');
  });

  it('formats an empty history as an explicit placeholder', () => {
    expect(formatCostComparison([])).toBe('暂无运行成本记录，先运行一次任务。');
  });
});
