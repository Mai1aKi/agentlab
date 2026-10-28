import { describe, expect, it } from 'vitest';
import { Agent } from '../src/agent/agent';
import { createDefaultRegistry } from '../src/agent/builtinTools';
import { extractExpression, MockModel } from '../src/agent/mockModel';
import type { ChatModel } from '../src/agent/types';

describe('agent loop with the mock model', () => {
  it('routes arithmetic through the calculator tool', async () => {
    const agent = new Agent(new MockModel(), createDefaultRegistry());
    const result = await agent.run('计算 (18 + 26) * 3 - 7');
    expect(result.finalText).toContain('125');
    const kinds = result.trace.map((e) => e.type);
    expect(kinds).toEqual(['user', 'modelReply', 'toolResult', 'modelReply', 'final']);
    const toolEvent = result.trace.find((e) => e.type === 'toolResult');
    expect(toolEvent).toMatchObject({ isError: false, result: '125' });
  });

  it('answers time questions through the clock tool', async () => {
    const agent = new Agent(new MockModel(), createDefaultRegistry());
    const result = await agent.run('现在几点了？');
    expect(result.finalText).toMatch(/现在的时间是/);
    expect(result.steps).toBe(2);
  });

  it('answers knowledge questions through kb_search', async () => {
    const agent = new Agent(new MockModel(), createDefaultRegistry());
    const result = await agent.run('什么是 RAG？');
    expect(result.finalText).toMatch(/检索增强|Retrieval/);
  });

  it('answers chit-chat directly without tools', async () => {
    const agent = new Agent(new MockModel(), createDefaultRegistry());
    const result = await agent.run('你好');
    expect(result.steps).toBe(1);
    expect(result.trace.some((e) => e.type === 'toolResult')).toBe(false);
  });

  it('stops at maxSteps when the model keeps calling tools forever', async () => {
    const loopingModel: ChatModel = {
      name: 'loop-stub',
      async complete() {
        return {
          type: 'toolCall',
          call: { id: 'x', name: 'clock', args: {} },
        };
      },
    };
    const agent = new Agent(loopingModel, createDefaultRegistry(), { maxSteps: 3 });
    const result = await agent.run('go');
    expect(result.steps).toBe(3);
    expect(result.trace[result.trace.length - 1].type).toBe('stopped');
  });

  it('keeps conversation history across runs', async () => {
    const agent = new Agent(new MockModel(), createDefaultRegistry());
    await agent.run('计算 1 + 1');
    await agent.run('计算 2 + 2');
    const roles = agent.history.map((m) => m.role);
    expect(roles.filter((r) => r === 'user')).toHaveLength(2);
    expect(roles.filter((r) => r === 'tool')).toHaveLength(2);
  });
});

describe('extractExpression', () => {
  it('pulls expressions out of Chinese requests', () => {
    expect(extractExpression('帮我计算 (3 + 4) * 5 吧')).toBe('(3 + 4) * 5');
    expect(extractExpression('计算 100 ÷ 4')).toBe('100 / 4');
  });

  it('returns null when there is no arithmetic', () => {
    expect(extractExpression('你好呀')).toBeNull();
    expect(extractExpression('2026 年有什么计划')).toBeNull();
  });
});
