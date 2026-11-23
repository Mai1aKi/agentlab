import { describe, expect, it } from 'vitest';
import { Agent } from '../src/agent/agent';
import {
  DEFAULT_BUDGET_MAX_DURATION_MS,
  DEFAULT_BUDGET_MAX_STEPS,
  evaluateBudget,
  formatBudgetAlert,
  sanitizeBudget,
} from '../src/agent/budget';
import { createDefaultRegistry } from '../src/agent/builtinTools';
import { parseTrace, serializeTrace } from '../src/agent/trace';
import type { ChatModel, RunStats } from '../src/agent/types';

const stats = (steps: number, durationMs: number): RunStats => ({
  steps,
  toolCalls: 0,
  toolErrors: 0,
  durationMs,
});

describe('budget alert (Day 23)', () => {
  it('completes a partial or bad budget with the defaults', () => {
    const defaults = {
      maxSteps: DEFAULT_BUDGET_MAX_STEPS,
      maxDurationMs: DEFAULT_BUDGET_MAX_DURATION_MS,
    };
    expect(sanitizeBudget(undefined)).toEqual(defaults);
    expect(sanitizeBudget(null)).toEqual(defaults);
    expect(sanitizeBudget({ maxSteps: 2 })).toEqual({
      maxSteps: 2,
      maxDurationMs: DEFAULT_BUDGET_MAX_DURATION_MS,
    });
    expect(sanitizeBudget({ maxSteps: 0, maxDurationMs: -5 })).toEqual(defaults);
    expect(sanitizeBudget({ maxSteps: 2.9, maxDurationMs: Number.NaN })).toEqual({
      maxSteps: 2,
      maxDurationMs: DEFAULT_BUDGET_MAX_DURATION_MS,
    });
  });

  it('treats a run exactly at the limit as within budget', () => {
    expect(evaluateBudget(stats(6, 3000))).toEqual({
      maxSteps: 6,
      maxDurationMs: 3000,
      steps: 6,
      durationMs: 3000,
      overSteps: false,
      overDuration: false,
      exceeded: false,
    });
  });

  it('flags only the limit that was strictly exceeded', () => {
    const overSteps = evaluateBudget(stats(7, 100), { maxSteps: 6, maxDurationMs: 3000 });
    expect(overSteps.overSteps).toBe(true);
    expect(overSteps.overDuration).toBe(false);
    expect(overSteps.exceeded).toBe(true);
    const overDuration = evaluateBudget(stats(1, 3001), {
      maxSteps: 6,
      maxDurationMs: 3000,
    });
    expect(overDuration.overSteps).toBe(false);
    expect(overDuration.overDuration).toBe(true);
    expect(overDuration.exceeded).toBe(true);
  });

  it('formats within-budget and over-budget checks in one line', () => {
    expect(formatBudgetAlert(evaluateBudget(stats(2, 100)))).toBe(
      '预算提醒：未超预算（步数 2/6 · 耗时 100/3000 ms）',
    );
    expect(
      formatBudgetAlert(
        evaluateBudget(stats(7, 3500), { maxSteps: 6, maxDurationMs: 3000 }),
      ),
    ).toBe('预算提醒：步数 7 超过预算 6；耗时 3500 ms 超过预算 3000 ms');
  });

  it('agent emits budgetAlert after runStats and before final when steps exceed the budget, and the event survives export', async () => {
    let turn = 0;
    const stub: ChatModel = {
      name: 'budget-stub',
      async complete() {
        turn++;
        if (turn === 1) {
          return {
            type: 'toolCall',
            call: { id: 'b1', name: 'calculator', args: { expression: '1 + 2' } },
          };
        }
        return { type: 'text', content: '算完了' };
      },
    };
    const agent = new Agent(stub, createDefaultRegistry(), {
      budget: { maxSteps: 1, maxDurationMs: 60_000 },
      now: () => 0,
    });
    const result = await agent.run('算一题');
    expect(result.budgetCheck.exceeded).toBe(true);
    expect(result.budgetCheck.overSteps).toBe(true);
    const kinds = result.trace.map((e) => e.type);
    expect(kinds.slice(-3)).toEqual(['runStats', 'budgetAlert', 'final']);
    const alert = result.trace.find((e) => e.type === 'budgetAlert');
    expect(alert?.type === 'budgetAlert' ? alert.check : null).toEqual(result.budgetCheck);
    expect(parseTrace(serializeTrace(result.trace))).toEqual(result.trace);
  });

  it('agent returns a budgetCheck but emits no budgetAlert when the run stays within budget', async () => {
    const stub: ChatModel = {
      name: 'budget-ok-stub',
      async complete() {
        return { type: 'text', content: '直接回答' };
      },
    };
    const agent = new Agent(stub, createDefaultRegistry(), { now: () => 0 });
    const result = await agent.run('打个招呼');
    expect(result.budgetCheck.exceeded).toBe(false);
    expect(result.trace.some((e) => e.type === 'budgetAlert')).toBe(false);
  });
});
