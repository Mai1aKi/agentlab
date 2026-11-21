import { describe, expect, it } from 'vitest';
import { Agent } from '../src/agent/agent';
import { createDefaultRegistry } from '../src/agent/builtinTools';
import { completeStep, createPlan } from '../src/agent/planner';
import { formatPlanReview, summarizePlanReview } from '../src/agent/planReview';
import type { ChatModel } from '../src/agent/types';

describe('plan review (Day 21)', () => {
  it('treats a missing or empty plan as a zero review, never NaN', () => {
    const zero = {
      total: 0,
      done: 0,
      pending: 0,
      percent: 0,
      complete: false,
      pendingTitles: [],
    };
    expect(summarizePlanReview(undefined)).toEqual(zero);
    expect(summarizePlanReview(null)).toEqual(zero);
    expect(summarizePlanReview([])).toEqual(zero);
    expect(formatPlanReview(summarizePlanReview(undefined))).toBe(
      '计划回看：本次运行没有计划',
    );
  });

  it('reports a fully completed plan at 100%', () => {
    const plan = completeStep(completeStep(createPlan(['算一题', '看时间']), 0), 1);
    expect(summarizePlanReview(plan)).toEqual({
      total: 2,
      done: 2,
      pending: 0,
      percent: 100,
      complete: true,
      pendingTitles: [],
    });
  });

  it('counts a partial plan, rounds the percent and lists pending titles in order without mutating the plan', () => {
    const plan = completeStep(createPlan(['算一题', '看时间', '查知识']), 0);
    const review = summarizePlanReview(plan);
    expect(review).toEqual({
      total: 3,
      done: 1,
      pending: 2,
      percent: 33,
      complete: false,
      pendingTitles: ['看时间', '查知识'],
    });
    expect(plan.map((p) => p.status)).toEqual(['done', 'pending', 'pending']);
  });

  it('formats a completed review in one line', () => {
    const plan = completeStep(createPlan(['算一题']), 0);
    expect(formatPlanReview(summarizePlanReview(plan))).toBe(
      '计划回看：1/1 步已完成（100%），全部完成',
    );
  });

  it('formats a partial review with the remaining step titles', () => {
    const plan = completeStep(createPlan(['算一题', '看时间', '查知识']), 0);
    expect(formatPlanReview(summarizePlanReview(plan))).toBe(
      '计划回看：1/3 步已完成（33%），剩余 2 步未完成：看时间、查知识',
    );
  });

  it('agent emits a partial planReview before runStats and final when a planned run ends early', async () => {
    let turn = 0;
    const stub: ChatModel = {
      name: 'plan-review-stub',
      async complete() {
        turn++;
        if (turn === 1) return { type: 'plan', steps: ['算一题', '看时间'] };
        if (turn === 2) {
          return {
            type: 'toolCall',
            call: { id: 'r1', name: 'calculator', args: { expression: '1 + 2' } },
          };
        }
        return { type: 'text', content: '先到这里' };
      },
    };
    const agent = new Agent(stub, createDefaultRegistry());
    const result = await agent.run('做两件事但只做一件');
    expect(result.planReview).toEqual({
      total: 2,
      done: 1,
      pending: 1,
      percent: 50,
      complete: false,
      pendingTitles: ['看时间'],
    });
    const kinds = result.trace.map((e) => e.type);
    expect(kinds.slice(-3)).toEqual(['planReview', 'runStats', 'final']);
    const reviewEvent = result.trace.find((e) => e.type === 'planReview');
    expect(reviewEvent?.type === 'planReview' ? reviewEvent.review : null).toEqual(
      result.planReview,
    );
  });
});
