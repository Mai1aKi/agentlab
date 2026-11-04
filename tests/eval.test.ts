import { describe, expect, it } from 'vitest';
import { Agent } from '../src/agent/agent';
import { createDefaultRegistry } from '../src/agent/builtinTools';
import {
  BUILTIN_EVAL_TASKS,
  evaluateRun,
  extractCalledTools,
  formatEvalReport,
  runEvalSuite,
  summarizeEval,
} from '../src/agent/eval';
import { MockModel } from '../src/agent/mockModel';
import type { TraceEvent } from '../src/agent/types';

function toolTrace(...names: string[]): TraceEvent[] {
  return names.map((name, i) => ({
    type: 'toolResult' as const,
    call: { id: `call_${i + 1}`, name, args: {} },
    result: 'ok',
    isError: false,
  }));
}

describe('evaluation bench (Day 7)', () => {
  it('extracts called tools in order and scores an exact match as correct', () => {
    const trace = toolTrace('calculator', 'clock');
    expect(extractCalledTools(trace)).toEqual(['calculator', 'clock']);
    const result = evaluateRun(BUILTIN_EVAL_TASKS[3], trace, 3);
    expect(result.correct).toBe(true);
    expect(result.toolCalls).toBe(2);
    expect(result.steps).toBe(3);
  });

  it('marks wrong, missing or reordered tools as incorrect', () => {
    const task = BUILTIN_EVAL_TASKS[0];
    expect(evaluateRun(task, toolTrace('clock'), 2).correct).toBe(false);
    expect(evaluateRun(task, [], 1).correct).toBe(false);
    expect(
      evaluateRun(BUILTIN_EVAL_TASKS[3], toolTrace('clock', 'calculator'), 3).correct,
    ).toBe(false);
    // A no-tool task is correct only when nothing was called.
    expect(evaluateRun(BUILTIN_EVAL_TASKS[4], [], 1).correct).toBe(true);
  });

  it('summarizes accuracy, steps and tool calls over a batch', () => {
    const results = [
      evaluateRun(BUILTIN_EVAL_TASKS[0], toolTrace('calculator'), 2),
      evaluateRun(BUILTIN_EVAL_TASKS[1], toolTrace('kb_search'), 4),
    ];
    const summary = summarizeEval(results);
    expect(summary).toEqual({
      total: 2,
      passed: 1,
      toolCallAccuracy: 0.5,
      totalSteps: 6,
      averageSteps: 3,
      totalToolCalls: 2,
    });
    expect(summarizeEval([]).toolCallAccuracy).toBe(0);
  });

  it('runs a suite through an injected runner and formats the report', async () => {
    const { results, summary } = await runEvalSuite(async (prompt) => {
      if (prompt.includes('12')) return { trace: toolTrace('calculator'), steps: 2 };
      return { trace: [], steps: 1 };
    }, BUILTIN_EVAL_TASKS.slice(0, 2));
    expect(results.map((r) => r.correct)).toEqual([true, false]);
    expect(summary.passed).toBe(1);
    const report = formatEvalReport(results, summary);
    expect(report).toContain('1/2 个任务工具调用正确（正确率 50%）');
    expect(report).toContain('平均 1.5 步/任务');
  });

  it('passes every built-in task with the real MockModel agent', async () => {
    const { summary } = await runEvalSuite(async (prompt) => {
      const agent = new Agent(new MockModel(), createDefaultRegistry());
      const outcome = await agent.run(prompt);
      return { trace: outcome.trace, steps: outcome.steps };
    });
    expect(summary.total).toBe(BUILTIN_EVAL_TASKS.length);
    expect(summary.passed).toBe(BUILTIN_EVAL_TASKS.length);
    expect(summary.toolCallAccuracy).toBe(1);
    expect(summary.averageSteps).toBe(2);
    expect(summary.totalToolCalls).toBe(5);
  });
});
