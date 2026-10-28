// The built-in demo model: a small deterministic rule engine that plays
// the role of an LLM. It reads the conversation, decides whether a tool
// is needed, calls it, and then composes a final answer from the result.
// It exists so the lab runs (and is testable) with zero API cost — and so
// every decision it makes can be read and understood, unlike a real LLM.

import type { ChatModel, Message, ModelReply, ToolSpec } from './types';

export class MockModel implements ChatModel {
  readonly name = 'mock (内置演示模型)';

  async complete(messages: Message[], _tools: ToolSpec[]): Promise<ModelReply> {
    const lastUserIdx = findLastIndex(messages, (m) => m.role === 'user');
    const userText = lastUserIdx >= 0 ? messages[lastUserIdx].content : '';

    // If a tool already answered this user turn, compose the final reply.
    const pending = pendingToolExchange(messages, lastUserIdx);
    if (pending) {
      return { type: 'text', content: composeFinal(pending.callName, pending.args, pending.result) };
    }

    const callId = `call_${messages.filter((m) => m.toolCall).length + 1}`;

    // 1) Arithmetic? Extract and delegate to the calculator tool.
    const expr = extractExpression(userText);
    if (expr) {
      return {
        type: 'toolCall',
        call: { id: callId, name: 'calculator', args: { expression: expr } },
      };
    }

    // 2) Asking for the time?
    if (/几点|时间|日期|星期/.test(userText)) {
      return { type: 'toolCall', call: { id: callId, name: 'clock', args: {} } };
    }

    // 3) Asking a knowledge question?
    if (/什么是|查一下|搜索|查一查|介绍一下|讲讲|解释/.test(userText)) {
      const query = userText
        .replace(/什么是|查一下|搜索|查一查|介绍一下|讲讲|解释|请问|帮我|一下/g, '')
        .replace(/[？?：:，,。\s]+/g, ' ')
        .trim();
      return {
        type: 'toolCall',
        call: { id: callId, name: 'kb_search', args: { query: query || userText } },
      };
    }

    // 4) Otherwise, answer directly.
    return {
      type: 'text',
      content:
        '我是内置的演示模型（规则驱动，不是真的 LLM）。我能指挥 Agent 使用这些工具：\n' +
        '· 给我一道算式，我会调用 calculator 计算，例如「计算 (18 + 26) * 3」\n' +
        '· 问我「现在几点」，我会调用 clock\n' +
        '· 问我「什么是 RAG」，我会调用 kb_search 检索知识库\n' +
        '想接真模型的话，在上方把模型切换成「自定义 API（BYOK）」。',
    };
  }
}

function findLastIndex<T>(arr: T[], pred: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return i;
  return -1;
}

interface PendingExchange {
  callName: string;
  args: Record<string, unknown>;
  result: string;
}

/** After the last user message, is there an assistant tool call followed
 *  by its tool result? Then the model owes a final answer. */
function pendingToolExchange(messages: Message[], lastUserIdx: number): PendingExchange | null {
  let callMsg: Message | undefined;
  let resultMsg: Message | undefined;
  for (let i = lastUserIdx + 1; i < messages.length; i++) {
    if (messages[i].toolCall) callMsg = messages[i];
    if (messages[i].role === 'tool') resultMsg = messages[i];
  }
  if (callMsg?.toolCall && resultMsg) {
    return {
      callName: callMsg.toolCall.name,
      args: callMsg.toolCall.args,
      result: resultMsg.content,
    };
  }
  return null;
}

function composeFinal(callName: string, args: Record<string, unknown>, result: string): string {
  if (result.startsWith('Error:')) {
    return `工具调用失败了：${result}`;
  }
  switch (callName) {
    case 'calculator':
      return `计算完成：${String(args.expression)} = ${result}`;
    case 'clock':
      return `现在的时间是 ${result}。`;
    case 'kb_search':
      return `根据知识库检索到的内容：\n${result}`;
    default:
      return result;
  }
}

/** Pull an arithmetic expression out of a natural-language request. */
export function extractExpression(text: string): string | null {
  const normalized = text.replace(/×/g, '*').replace(/÷/g, '/').replace(/，/g, ' ');
  const match = normalized.match(/[\d\s.+\-*/%()]+/);
  if (!match) return null;
  const expr = match[0].trim();
  // Must contain at least one operator and one digit, and be mostly expression.
  if (!/\d/.test(expr) || !/[+\-*/%]/.test(expr)) return null;
  if (expr.replace(/[\d\s.+\-*/%()]/g, '').length > 0) return null;
  return expr;
}
