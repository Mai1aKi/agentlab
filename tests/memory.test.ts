import { describe, expect, it } from 'vitest';
import { Agent } from '../src/agent/agent';
import { createDefaultRegistry } from '../src/agent/builtinTools';
import { compressHistory, isSummaryMessage, summarizeMessages, SUMMARY_PREFIX } from '../src/agent/memory';
import { MockModel } from '../src/agent/mockModel';
import type { ChatModel, Message } from '../src/agent/types';

function msg(role: Message['role'], content: string): Message {
  return { role, content };
}

describe('summarizeMessages', () => {
  it('folds a batch into one prefixed system summary naming tools', () => {
    const summary = summarizeMessages([
      msg('user', '帮我算一下'),
      { role: 'assistant', content: '', toolCall: { id: '1', name: 'calculator', args: {} } },
      { role: 'tool', content: '42', toolCallId: '1', toolName: 'calculator' },
      msg('assistant', '结果是 42'),
    ]);
    expect(summary.role).toBe('system');
    expect(summary.content.startsWith(SUMMARY_PREFIX)).toBe(true);
    expect(summary.content).toContain('共 4 条');
    expect(summary.content).toContain('calculator');
    expect(summary.content).toContain('42');
    expect(isSummaryMessage(summary)).toBe(true);
  });

  it('truncates very long content', () => {
    const summary = summarizeMessages([msg('user', '长'.repeat(500))]);
    expect(summary.content.length).toBeLessThan(700);
  });
});

describe('compressHistory', () => {
  it('returns null when history is within the limit', () => {
    const messages = [msg('system', 'sys'), msg('user', 'hi'), msg('assistant', 'hello')];
    expect(compressHistory(messages, 24, 10)).toBeNull();
  });

  it('keeps system prompt + summary + recent tail when over the limit', () => {
    const messages: Message[] = [msg('system', 'sys')];
    for (let i = 1; i <= 10; i++) messages.push(msg('user', `第 ${i} 问`), msg('assistant', `第 ${i} 答`));
    const result = compressHistory(messages, 8, 4);
    expect(result).not.toBeNull();
    expect(result!.messages[0].content).toBe('sys');
    expect(isSummaryMessage(result!.messages[1])).toBe(true);
    expect(result!.summarizedCount).toBe(16);
    expect(result!.messages).toHaveLength(6);
    expect(result!.messages[result!.messages.length - 1].content).toBe('第 10 答');
  });

  it('never leaves an orphan tool result at the head of the kept tail', () => {
    const messages: Message[] = [
      msg('system', 'sys'),
      msg('user', '算一下'),
      { role: 'assistant', content: '', toolCall: { id: '1', name: 'clock', args: {} } },
      { role: 'tool', content: '12:00', toolCallId: '1', toolName: 'clock' },
      msg('assistant', '现在 12 点'),
      msg('user', '谢谢'),
    ];
    // keepRecent=3 would start the tail at the tool result; it must be folded instead.
    const result = compressHistory(messages, 3, 3);
    expect(result).not.toBeNull();
    expect(result!.messages[2].role).not.toBe('tool');
  });
});

describe('agent memory compression', () => {
  it('compresses across runs, emits a trace event, and still answers', async () => {
    const agent = new Agent(new MockModel(), createDefaultRegistry(), {
      maxHistoryMessages: 6,
      keepRecentMessages: 4,
    });
    await agent.run('计算 1 + 1');
    await agent.run('计算 2 + 2');
    const third = await agent.run('计算 3 + 3');
    expect(third.finalText).toContain('6');
    const compressed = third.trace.filter((e) => e.type === 'memoryCompressed');
    expect(compressed.length).toBeGreaterThanOrEqual(1);
    expect(agent.history[1].content.startsWith(SUMMARY_PREFIX)).toBe(true);
    // History stays bounded: system + summary + a short recent tail.
    expect(agent.history.length).toBeLessThanOrEqual(9);
  });

  it('does not compress short conversations', async () => {
    const echo: ChatModel = {
      name: 'echo-stub',
      async complete() {
        return { type: 'text', content: 'ok' };
      },
    };
    const agent = new Agent(echo, createDefaultRegistry());
    const result = await agent.run('你好');
    expect(result.trace.some((e) => e.type === 'memoryCompressed')).toBe(false);
  });
});
