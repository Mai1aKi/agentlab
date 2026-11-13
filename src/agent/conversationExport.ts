// Conversation export (Day 12): the whole chat plus the most recent
// run's trace, rendered as one Markdown file the user can save, share
// or paste into notes. Pure string building over plain data — the
// console keeps the chat log and the last trace, this module only
// formats them, so the exact file content is testable without a DOM.

import { formatRunStats } from './stats';
import type { TraceEvent } from './types';

/** One visible chat bubble, in display order. Only user / assistant
 *  bubbles appear in the console, so only those two roles exist here. */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  text: string;
}

function renderTraceEvent(event: TraceEvent, index: number): string {
  const n = index + 1;
  switch (event.type) {
    case 'user':
      return `${n}. **任务**：${event.content}`;
    case 'modelReply': {
      if (event.reply.type === 'text') {
        return `${n}. **步骤 ${event.step} · 模型**：直接回复 — ${event.reply.content}`;
      }
      if (event.reply.type === 'plan') {
        const steps = event.reply.steps.map((s, i) => `${i + 1}. [ ] ${s}`).join('\n');
        return `${n}. **步骤 ${event.step} · 模型**：先制定计划\n\n\`\`\`\n${steps}\n\`\`\``;
      }
      const calls = event.reply.type === 'toolCalls' ? event.reply.calls : [event.reply.call];
      const rendered = calls
        .map((c) => `\`${c.name}\`\n\n\`\`\`json\n${JSON.stringify(c.args, null, 2)}\n\`\`\``)
        .join('\n\n');
      return `${n}. **步骤 ${event.step} · 模型**：决定调用工具 ${rendered}`;
    }
    case 'toolResult':
      return (
        `${n}. **工具结果${event.isError ? '（失败）' : ''}**：\`${event.call.name}\`` +
        `\n\n\`\`\`\n${event.result}\n\`\`\``
      );
    case 'toolRetry':
      return `${n}. **工具重试**：\`${event.call.name}\` 第 ${event.attempt} 次重试（上次失败：${event.result}）`;
    case 'toolDisabled':
      return `${n}. **工具禁用**：\`${event.call.name}\` 已被禁用，跳过执行（${event.result}）`;
    case 'memoryCompressed':
      return (
        `${n}. **记忆压缩**：早期 ${event.summarizedCount} 条已摘要，保留最近 ${event.keptCount} 条` +
        `\n\n\`\`\`\n${event.summary}\n\`\`\``
      );
    case 'planCreated': {
      const steps = event.steps.map((s, i) => `${i + 1}. [ ] ${s}`).join('\n');
      return `${n}. **计划**：共 ${event.steps.length} 步\n\n\`\`\`\n${steps}\n\`\`\``;
    }
    case 'planStepDone':
      return `${n}. **勾销计划**：第 ${event.index + 1} 步已完成：${event.title}`;
    case 'subAgentStarted':
      return `${n}. **子 Agent**：${event.role} 开始：${event.instruction}`;
    case 'subAgentDone':
      return `${n}. **子 Agent**：${event.role} 完成：${event.summary}`;
    case 'runStats':
      return `${n}. **运行成本**：${formatRunStats(event.stats)}`;
    case 'final':
      return `${n}. **完成**：已生成最终回答`;
    case 'stopped':
      return `${n}. **停止**：${event.reason}`;
  }
}

/** Render the chat log and a trace as one Markdown document. The
 *  export time is injectable so tests get deterministic output; an
 *  empty chat or trace renders an explicit placeholder line instead
 *  of a silently blank section. */
export function formatConversationMarkdown(
  messages: readonly ConversationMessage[],
  trace: readonly TraceEvent[],
  exportedAt: string = new Date().toISOString(),
): string {
  const lines: string[] = [
    '# AgentLab · 对话导出',
    '',
    `导出时间：${exportedAt}`,
    '',
    '## 对话',
    '',
  ];
  if (messages.length === 0) {
    lines.push('（暂无对话）');
  } else {
    for (const message of messages) {
      const label = message.role === 'user' ? '用户' : '助手';
      lines.push(`**${label}：**`, '', message.text, '');
    }
  }
  lines.push('## 运行轨迹（最近一次运行）', '');
  if (trace.length === 0) {
    lines.push('（暂无轨迹）');
  } else {
    trace.forEach((event, i) => {
      lines.push(renderTraceEvent(event, i), '');
    });
  }
  return lines.join('\n').trimEnd() + '\n';
}
