import { describe, expect, it } from 'vitest';
import {
  completeStep,
  createPlan,
  formatPlan,
  isPlanComplete,
  nextPending,
} from '../src/agent/planner';

describe('planner checklist (Day 3)', () => {
  it('creates a pending checklist, trimming and dropping blank steps', () => {
    const plan = createPlan(['  计算 3 + 4 ', '', ' 查询时间 ']);
    expect(plan).toEqual([
      { index: 0, title: '计算 3 + 4', status: 'pending' },
      { index: 1, title: '查询时间', status: 'pending' },
    ]);
    expect(isPlanComplete(plan)).toBe(false);
    expect(nextPending(plan)?.title).toBe('计算 3 + 4');
  });

  it('completes a step purely, without mutating the original plan', () => {
    const plan = createPlan(['a', 'b']);
    const after = completeStep(plan, 0);
    expect(plan[0].status).toBe('pending');
    expect(after[0].status).toBe('done');
    expect(nextPending(after)?.title).toBe('b');
    expect(isPlanComplete(completeStep(after, 1))).toBe(true);
    expect(nextPending(completeStep(after, 1))).toBeUndefined();
  });

  it('formats the checklist with tick boxes', () => {
    const plan = completeStep(createPlan(['a', 'b']), 1);
    expect(formatPlan(plan)).toBe('1. [ ] a\n2. [x] b');
  });
});
