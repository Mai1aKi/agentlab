// Day 27 · Eval report export: render one finished eval-bench batch
// as a standalone Markdown document — headline summary plus a
// per-task table with expected vs actual tools — so a run can be
// saved or shared outside the console. Pure function; the export
// time is injectable so tests can pin it.

import type { EvalCaseResult, EvalSummary } from './eval';

/** Make a value safe for one Markdown table cell: pipes would split
 *  the cell and newlines would split the row, so both are flattened. */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
}

function toolList(tools: readonly string[]): string {
  return tools.length === 0 ? '（无）' : tools.join(' + ');
}

/** Render a batch of eval results + their summary as Markdown. */
export function formatEvalReportMarkdown(
  results: readonly EvalCaseResult[],
  summary: EvalSummary,
  exportedAt: Date = new Date(),
): string {
  const when =
    exportedAt instanceof Date && Number.isFinite(exportedAt.getTime())
      ? exportedAt
      : new Date(0);
  const pct = `${Math.round(summary.toolCallAccuracy * 100)}%`;
  const lines: string[] = [
    '# AgentLab 评测报告',
    '',
    `导出时间：${when.toISOString()}`,
    '',
    '## 汇总',
    '',
    `- 任务总数：${summary.total}`,
    `- 工具调用正确：${summary.passed}/${summary.total}（正确率 ${pct}）`,
    `- 总步数：${summary.totalSteps}（平均 ${summary.averageSteps.toFixed(1)} 步/任务）`,
    `- 工具调用总数：${summary.totalToolCalls}`,
    '',
    '## 逐任务结果',
    '',
  ];
  if (results.length === 0) {
    lines.push('暂无评测结果，先运行一次评测台跑批。');
    return lines.join('\n');
  }
  lines.push(
    '| # | 任务 | 提示词 | 期望工具 | 实际工具 | 步数 | 结果 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  );
  results.forEach((r, i) => {
    lines.push(
      `| ${i + 1} | ${cell(r.id)} | ${cell(r.prompt)} | ${cell(toolList(r.expectedTools))} | ${cell(toolList(r.actualTools))} | ${r.steps} | ${r.correct ? '✓ 通过' : '✗ 未通过'} |`,
    );
  });
  return lines.join('\n');
}
