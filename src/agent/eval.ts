// Day 7 · Evaluation bench: run a built-in task set in one batch and
// score each run by which tools it actually called (and in what order),
// plus how many steps it took. Pure scoring helpers + an injectable
// runner, so tests can use stubs and the console can use the real
// Agent + MockModel with zero API cost.

import type { TraceEvent } from './types';

export interface EvalTask {
  id: string;
  prompt: string;
  /** The exact tool names a correct run must call, in order.
   *  An empty list means the task should be answered with no tools. */
  expectedTools: string[];
}

export interface EvalCaseResult {
  id: string;
  prompt: string;
  expectedTools: string[];
  actualTools: string[];
  /** True only when the called tools match the expected ones exactly,
   *  in name and order. */
  correct: boolean;
  steps: number;
  toolCalls: number;
}

export interface EvalSummary {
  total: number;
  passed: number;
  /** Fraction of tasks whose tool calls were exactly right (0–1). */
  toolCallAccuracy: number;
  totalSteps: number;
  averageSteps: number;
  totalToolCalls: number;
}

/** The built-in task set: one task per behaviour the demo model is
 *  supposed to have — single tool, combined tools, and no tool. */
export const BUILTIN_EVAL_TASKS: EvalTask[] = [
  { id: 'calc', prompt: '计算 12 * 8', expectedTools: ['calculator'] },
  { id: 'clock', prompt: '现在几点了？', expectedTools: ['clock'] },
  { id: 'kb', prompt: '什么是 Embedding？', expectedTools: ['kb_search'] },
  { id: 'combo', prompt: '计算 3 + 4，现在几点了？', expectedTools: ['calculator', 'clock'] },
  { id: 'direct', prompt: '你好，你能做什么？', expectedTools: [] },
];

/** Tool names actually called during a run, in execution order. */
export function extractCalledTools(trace: readonly TraceEvent[]): string[] {
  return trace
    .filter((e): e is Extract<TraceEvent, { type: 'toolResult' }> => e.type === 'toolResult')
    .map((e) => e.call.name);
}

/** Score one finished run against its task. */
export function evaluateRun(
  task: EvalTask,
  trace: readonly TraceEvent[],
  steps: number,
): EvalCaseResult {
  const actualTools = extractCalledTools(trace);
  const correct =
    actualTools.length === task.expectedTools.length &&
    actualTools.every((name, i) => name === task.expectedTools[i]);
  return {
    id: task.id,
    prompt: task.prompt,
    expectedTools: [...task.expectedTools],
    actualTools,
    correct,
    steps,
    toolCalls: actualTools.length,
  };
}

/** Aggregate a batch of case results into headline numbers. */
export function summarizeEval(results: readonly EvalCaseResult[]): EvalSummary {
  const total = results.length;
  const passed = results.filter((r) => r.correct).length;
  const totalSteps = results.reduce((sum, r) => sum + r.steps, 0);
  return {
    total,
    passed,
    toolCallAccuracy: total === 0 ? 0 : passed / total,
    totalSteps,
    averageSteps: total === 0 ? 0 : totalSteps / total,
    totalToolCalls: results.reduce((sum, r) => sum + r.toolCalls, 0),
  };
}

export interface EvalRunOutcome {
  trace: TraceEvent[];
  steps: number;
}

/** Run every task once, in order, through an injected runner. */
export async function runEvalSuite(
  runOne: (prompt: string) => Promise<EvalRunOutcome>,
  tasks: readonly EvalTask[] = BUILTIN_EVAL_TASKS,
): Promise<{ results: EvalCaseResult[]; summary: EvalSummary }> {
  const results: EvalCaseResult[] = [];
  for (const task of tasks) {
    const outcome = await runOne(task.prompt);
    results.push(evaluateRun(task, outcome.trace, outcome.steps));
  }
  return { results, summary: summarizeEval(results) };
}

/** Human-readable batch report, one line per task plus the headline. */
export function formatEvalReport(
  results: readonly EvalCaseResult[],
  summary: EvalSummary,
): string {
  const lines = results.map(
    (r) =>
      `- ${r.correct ? '✓' : '✗'} ${r.id}：「${r.prompt}」工具 ${r.actualTools.join(' + ') || '（无）'} · ${r.steps} 步`,
  );
  const pct = `${Math.round(summary.toolCallAccuracy * 100)}%`;
  return [
    `评测台跑批完成：${summary.passed}/${summary.total} 个任务工具调用正确（正确率 ${pct}）`,
    ...lines,
    `共 ${summary.totalSteps} 步，平均 ${summary.averageSteps.toFixed(1)} 步/任务，工具调用 ${summary.totalToolCalls} 次。`,
  ].join('\n');
}
