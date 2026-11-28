import { describe, expect, it } from 'vitest';
import {
  MAX_RUN_SNAPSHOTS,
  compareRunSnapshots,
  findLatestSameTaskPair,
  formatRunComparison,
  normalizeRunTask,
  recordRunSnapshot,
  type RunSnapshot,
} from '../src/agent/runComparison';
import type { RunStats } from '../src/agent/types';

const stats = (over: Partial<RunStats> = {}): RunStats => ({
  steps: 2,
  toolCalls: 1,
  toolErrors: 0,
  durationMs: 100,
  ...over,
});

const snap = (task: string, finalText: string, over: Partial<RunStats> = {}): RunSnapshot => ({
  task,
  finalText,
  stats: stats(over),
});

describe('run comparison (Day 28)', () => {
  it('normalizes tasks and records snapshots immutably, ignoring blank tasks', () => {
    expect(normalizeRunTask('  计算   1 + 1  ')).toBe('计算 1 + 1');
    expect(normalizeRunTask(42)).toBe('');
    const empty: RunSnapshot[] = [];
    const one = recordRunSnapshot(empty, ' 计算  1 + 1 ', ' 125 ', stats({ durationMs: 99.9 }));
    expect(empty).toEqual([]);
    expect(one).toEqual([{ task: '计算 1 + 1', finalText: '125', stats: stats({ durationMs: 99 }) }]);
    expect(recordRunSnapshot(one, '   ', 'x', stats())).toEqual(one);
  });

  it('caps the snapshot history at the most recent entries', () => {
    let snaps: RunSnapshot[] = [];
    for (let i = 1; i <= MAX_RUN_SNAPSHOTS + 2; i += 1) {
      snaps = recordRunSnapshot(snaps, `task ${i}`, `answer ${i}`, stats());
    }
    expect(snaps).toHaveLength(MAX_RUN_SNAPSHOTS);
    expect(snaps[0].task).toBe('task 3');
  });

  it('finds the latest same-task pair and none when tasks differ', () => {
    const snaps = [
      snap('A', 'a1'),
      snap('B', 'b1'),
      snap('A', 'a2'),
      snap('B', 'b2'),
      snap('C', 'c1'),
    ];
    const pair = findLatestSameTaskPair(snaps);
    expect(pair?.[0].finalText).toBe('b1');
    expect(pair?.[1].finalText).toBe('b2');
    expect(findLatestSameTaskPair([snap('A', 'a'), snap('B', 'b')])).toBeNull();
    expect(findLatestSameTaskPair([])).toBeNull();
  });

  it('compares answers and computes signed cost deltas', () => {
    const c = compareRunSnapshots(
      snap('T', 'same', { steps: 3, toolCalls: 2, toolErrors: 1, durationMs: 300 }),
      snap('T', ' same ', { steps: 2, toolCalls: 2, toolErrors: 0, durationMs: 250 }),
    );
    expect(c.answersEqual).toBe(true);
    expect(c.stepsDelta).toBe(-1);
    expect(c.toolCallsDelta).toBe(0);
    expect(c.toolErrorsDelta).toBe(-1);
    expect(c.durationDeltaMs).toBe(-50);
    expect(compareRunSnapshots(snap('T', 'x'), snap('T', 'y')).answersEqual).toBe(false);
  });

  it('formats both answers and costs side by side with the delta line', () => {
    const pair = findLatestSameTaskPair([
      snap('计算 1 + 1', '2', { durationMs: 100 }),
      snap('计算 1 + 1', '2', { steps: 3, durationMs: 180 }),
    ])!;
    const text = formatRunComparison(compareRunSnapshots(pair[0], pair[1]));
    expect(text).toContain('双运行对比 · 任务：计算 1 + 1');
    expect(text).toContain('第一次回答：2');
    expect(text).toContain('第二次回答：2');
    expect(text).toContain('第一次成本');
    expect(text).toContain('第二次成本');
    expect(text).toContain('回答相同');
    expect(text).toContain('步数 +1');
    expect(text).toContain('耗时 +80 ms');
  });

  it('formats a null comparison as an explicit placeholder', () => {
    expect(formatRunComparison(null)).toContain('暂无双运行对比');
  });
});
