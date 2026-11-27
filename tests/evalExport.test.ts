import { describe, expect, it } from 'vitest';
import { evaluateRun, summarizeEval } from '../src/agent/eval';
import { formatEvalReportMarkdown } from '../src/agent/evalExport';
import type { TraceEvent } from '../src/agent/types';

function toolTrace(...names: string[]): TraceEvent[] {
  return names.map((name, i) => ({
    type: 'toolResult' as const,
    call: { id: `call_${i + 1}`, name, args: {} },
    result: 'ok',
    isError: false,
  }));
}

const WHEN = new Date('2026-11-26T12:00:00.000Z');

function sampleBatch() {
  const results = [
    evaluateRun(
      { id: 'calc', prompt: '计算 12 * 8', expectedTools: ['calculator'] },
      toolTrace('calculator'),
      2,
    ),
    evaluateRun(
      { id: 'clock', prompt: '现在几点了？', expectedTools: ['clock'] },
      toolTrace('kb_search'),
      3,
    ),
    evaluateRun(
      { id: 'direct', prompt: '你好', expectedTools: [] },
      [],
      1,
    ),
  ];
  return { results, summary: summarizeEval(results) };
}

describe('eval report export (Day 27)', () => {
  it('renders the title, the injected export time and the summary headline', () => {
    const { results, summary } = sampleBatch();
    const md = formatEvalReportMarkdown(results, summary, WHEN);
    expect(md).toContain('# AgentLab 评测报告');
    expect(md).toContain('导出时间：2026-11-26T12:00:00.000Z');
    expect(md).toContain('工具调用正确：2/3（正确率 67%）');
    expect(md).toContain('总步数：6（平均 2.0 步/任务）');
    expect(md).toContain('工具调用总数：2');
  });

  it('renders one table row per task with expected vs actual tools and verdict', () => {
    const { results, summary } = sampleBatch();
    const md = formatEvalReportMarkdown(results, summary, WHEN);
    expect(md).toContain('| 期望工具 | 实际工具 |');
    expect(md).toContain('calculator');
    expect(md).toContain('✓ 通过');
    // The failed row shows what was expected and what actually ran.
    const clockRow = md.split('\n').find((l) => l.includes('clock'));
    expect(clockRow).toContain('kb_search');
    expect(clockRow).toContain('✗ 未通过');
    // A no-tool task renders both tool lists as （无）.
    const directRow = md.split('\n').find((l) => l.includes('direct'));
    expect(directRow).toContain('（无）');
  });

  it('renders an explicit placeholder instead of an empty table for no results', () => {
    const md = formatEvalReportMarkdown([], summarizeEval([]), WHEN);
    expect(md).toContain('暂无评测结果');
    expect(md).toContain('任务总数：0');
    expect(md).not.toContain('| # | 任务 |');
  });

  it('escapes pipes and flattens newlines inside table cells', () => {
    const results = [
      evaluateRun(
        { id: 'we|ird', prompt: '一行\n二行 | 管道', expectedTools: [] },
        [],
        1,
      ),
    ];
    const md = formatEvalReportMarkdown(results, summarizeEval(results), WHEN);
    const row = md.split('\n').find((l) => l.includes('we\\|ird'));
    expect(row).toBeDefined();
    expect(row).toContain('一行 二行 \\| 管道');
  });

  it('falls back to the epoch for an invalid export time instead of printing NaN text', () => {
    const { results, summary } = sampleBatch();
    const md = formatEvalReportMarkdown(results, summary, new Date('not a date'));
    expect(md).toContain('导出时间：1970-01-01T00:00:00.000Z');
    expect(md).not.toContain('Invalid Date');
  });
});
