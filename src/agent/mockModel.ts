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

    // If tool(s) already answered this user turn, compose the final reply.
    const pending = pendingToolExchanges(messages, lastUserIdx);
    if (pending.length > 0) {
      const parts = pending.map((p) => composeFinal(p.callName, p.args, p.result));
      return { type: 'text', content: parts.join('\n') };
    }

    // Collect every tool this turn needs — Day 1: one turn, several calls.
    let nextId = messages.filter((m) => m.toolCall).length + 1;
    const calls: { name: string; args: Record<string, unknown>; title: string }[] = [];

    // 1) Arithmetic? Extract and delegate to the calculator tool.
    const expr = extractExpression(userText);
    if (expr) {
      calls.push({ name: 'calculator', args: { expression: expr }, title: `用 calculator 计算 ${expr}` });
    }

    // 2) Asking for the time?
    if (/几点|时间|日期|星期/.test(userText)) {
      calls.push({ name: 'clock', args: {}, title: '用 clock 查询当前时间' });
    }

    // 3) Asking a knowledge question?
    if (/什么是|查一下|搜索|查一查|介绍一下|讲讲|解释/.test(userText)) {
      const query = userText
        .replace(/什么是|查一下|搜索|查一查|介绍一下|讲讲|解释|请问|帮我|一下/g, '')
        .replace(/[？?：:，,。\s]+/g, ' ')
        .trim();
      calls.push({ name: 'kb_search', args: { query: query || userText }, title: `用 kb_search 检索「${query || userText}」` });
    }

    // Day 3 · Planner-Executor: with several things to do and no plan yet
    // in this turn, first reply with the plan checklist; the runtime will
    // tick each step off as its tool call finishes. On the next turn the
    // plan is already in the history, so we fall through and execute.
    const planAlreadyMade = messages
      .slice(lastUserIdx + 1)
      .some((m) => m.plan && m.plan.length > 0);
    if (calls.length > 1 && !planAlreadyMade) {
      return { type: 'plan', steps: calls.map((c) => c.title) };
    }

    if (calls.length === 1) {
      return {
        type: 'toolCall',
        call: { id: `call_${nextId}`, name: calls[0].name, args: calls[0].args },
      };
    }
    if (calls.length > 1) {
      return {
        type: 'toolCalls',
        calls: calls.map((c) => ({ id: `call_${nextId++}`, name: c.name, args: c.args })),
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
        '· 一句话里问两件事，例如「计算 3 + 4，现在几点」，我会先列一份计划清单，再逐个执行并勾销\n' +
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

/** After the last user message, collect every assistant tool call that
 *  already has its tool result, paired in request order. Non-empty means
 *  the model owes a final answer covering all of them. */
function pendingToolExchanges(messages: Message[], lastUserIdx: number): PendingExchange[] {
  const calls: { name: string; args: Record<string, unknown>; id: string }[] = [];
  const results = new Map<string, string>();
  for (let i = lastUserIdx + 1; i < messages.length; i++) {
    const msg = messages[i];
    const batch = msg.toolCalls ?? (msg.toolCall ? [msg.toolCall] : []);
    for (const c of batch) calls.push({ name: c.name, args: c.args, id: c.id });
    if (msg.role === 'tool' && msg.toolCallId) results.set(msg.toolCallId, msg.content);
  }
  return calls
    .filter((c) => results.has(c.id))
    .map((c) => ({ callName: c.name, args: c.args, result: results.get(c.id) as string }));
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
