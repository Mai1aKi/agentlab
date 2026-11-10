import { describe, expect, it } from 'vitest';
import {
  formatConversationMarkdown,
  type ConversationMessage,
} from '../src/agent/conversationExport';
import type { TraceEvent } from '../src/agent/types';

const AT = '2026-11-09T00:00:00.000Z';
const call = { id: 'c1', name: 'calculator', args: { expression: '3 + 4' } };

const messages: ConversationMessage[] = [
  { role: 'user', text: '计算 3 + 4' },
  { role: 'assistant', text: '3 + 4 = 7' },
];

const trace: TraceEvent[] = [
  { type: 'user', content: '计算 3 + 4' },
  { type: 'modelReply', step: 1, reply: { type: 'toolCall', call } },
  { type: 'toolResult', call, result: '7', isError: false },
  {
    type: 'runStats',
    stats: { steps: 2, toolCalls: 1, toolErrors: 0, durationMs: 42 },
  },
  { type: 'final', content: '3 + 4 = 7' },
];

describe('conversation Markdown export (Day 12)', () => {
  it('renders the header, export time and both sections', () => {
    const md = formatConversationMarkdown(messages, trace, AT);
    expect(md.startsWith('# AgentLab · 对话导出\n')).toBe(true);
    expect(md).toContain(`导出时间：${AT}`);
    expect(md).toContain('## 对话');
    expect(md).toContain('## 运行轨迹（最近一次运行）');
    expect(md.endsWith('\n')).toBe(true);
  });

  it('renders user and assistant bubbles in order with labels', () => {
    const md = formatConversationMarkdown(messages, trace, AT);
    const userAt = md.indexOf('**用户：**');
    const assistantAt = md.indexOf('**助手：**');
    expect(userAt).toBeGreaterThan(-1);
    expect(assistantAt).toBeGreaterThan(userAt);
    expect(md).toContain('计算 3 + 4');
    expect(md).toContain('3 + 4 = 7');
  });

  it('renders trace events numbered, with tool args and results fenced', () => {
    const md = formatConversationMarkdown(messages, trace, AT);
    expect(md).toContain('1. **任务**：计算 3 + 4');
    expect(md).toContain('**步骤 1 · 模型**：决定调用工具 `calculator`');
    expect(md).toContain('"expression": "3 + 4"');
    expect(md).toContain('**工具结果**：`calculator`');
    expect(md).toContain('```\n7\n```');
    expect(md).toContain('**运行成本**：步数 2 · 工具调用 1 次（失败 0 次）· 耗时 42 ms');
    expect(md).toContain('**完成**：已生成最终回答');
  });

  it('marks a failed tool result as failed in the trace section', () => {
    const failed: TraceEvent[] = [
      { type: 'toolResult', call, result: 'boom', isError: true },
    ];
    const md = formatConversationMarkdown([], failed, AT);
    expect(md).toContain('**工具结果（失败）**：`calculator`');
    expect(md).toContain('boom');
  });

  it('renders explicit placeholders for an empty chat and trace', () => {
    const md = formatConversationMarkdown([], [], AT);
    expect(md).toContain('（暂无对话）');
    expect(md).toContain('（暂无轨迹）');
  });

  it('renders a text model reply and a stopped run', () => {
    const other: TraceEvent[] = [
      { type: 'modelReply', step: 1, reply: { type: 'text', content: '你好' } },
      { type: 'stopped', reason: '超过最大步数' },
    ];
    const md = formatConversationMarkdown([], other, AT);
    expect(md).toContain('**步骤 1 · 模型**：直接回复 — 你好');
    expect(md).toContain('**停止**：超过最大步数');
  });
});
