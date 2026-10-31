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

  it('executes several tool calls from one model turn, in order', async () => {
    let turn = 0;
    const multiModel: ChatModel = {
      name: 'multi-stub',
      async complete() {
        turn++;
        if (turn === 1) {
          return {
            type: 'toolCalls',
            calls: [
              { id: 'a', name: 'calculator', args: { expression: '2 + 3' } },
              { id: 'b', name: 'clock', args: {} },
            ],
          };
        }
        return { type: 'text', content: 'done' };
      },
    };
    const agent = new Agent(multiModel, createDefaultRegistry());
    const result = await agent.run('two things at once');
    expect(result.finalText).toBe('done');
    expect(result.steps).toBe(2);
    const kinds = result.trace.map((e) => e.type);
    expect(kinds).toEqual(['user', 'modelReply', 'toolResult', 'toolResult', 'modelReply', 'final']);
    const toolEvents = result.trace.filter((e) => e.type === 'toolResult');
    expect(toolEvents.map((e) => (e.type === 'toolResult' ? e.call.id : ''))).toEqual(['a', 'b']);
    expect(toolEvents[0]).toMatchObject({ result: '5', isError: false });
    // Both results are fed back as tool messages answering their own calls.
    const toolMsgs = agent.history.filter((m) => m.role === 'tool');
    expect(toolMsgs.map((m) => m.toolCallId)).toEqual(['a', 'b']);
  });

  it('mock model fires calculator and clock together for a combined ask', async () => {
    const agent = new Agent(new MockModel(), createDefaultRegistry());
    const result = await agent.run('计算 3 + 4，现在几点了？');
    // Day 3: plan first, then the combined tool turn, then the final text.
    expect(result.steps).toBe(3);
    const toolEvents = result.trace.filter((e) => e.type === 'toolResult');
    expect(toolEvents).toHaveLength(2);
    expect(result.finalText).toContain('3 + 4 = 7');
    expect(result.finalText).toMatch(/现在的时间是/);
  });

  it('planner-executor: plan first, then steps ticked off as tools finish', async () => {
    let turn = 0;
    const plannerModel: ChatModel = {
      name: 'planner-stub',
      async complete() {
        turn++;
        if (turn === 1) return { type: 'plan', steps: ['算一题', '看时间'] };
        if (turn === 2) {
          return {
            type: 'toolCalls',
            calls: [
              { id: 'p1', name: 'calculator', args: { expression: '1 + 2' } },
              { id: 'p2', name: 'clock', args: {} },
            ],
          };
        }
        return { type: 'text', content: '全部完成' };
      },
    };
    const agent = new Agent(plannerModel, createDefaultRegistry());
    const result = await agent.run('先算再看时间');
    expect(result.finalText).toBe('全部完成');
    const kinds = result.trace.map((e) => e.type);
    expect(kinds).toEqual([
      'user',
      'modelReply',
      'planCreated',
      'modelReply',
      'toolResult',
      'planStepDone',
      'toolResult',
      'planStepDone',
      'modelReply',
      'final',
    ]);
    expect(result.plan?.map((p) => p.status)).toEqual(['done', 'done']);
    const doneEvents = result.trace.filter((e) => e.type === 'planStepDone');
    expect(doneEvents.map((e) => (e.type === 'planStepDone' ? e.index : -1))).toEqual([0, 1]);
  });

  it('mock model plans a combined ask and ticks every step off', async () => {
    const agent = new Agent(new MockModel(), createDefaultRegistry());
    const result = await agent.run('计算 3 + 4，现在几点了？');
    const created = result.trace.find((e) => e.type === 'planCreated');
    expect(created?.type === 'planCreated' ? created.steps : []).toHaveLength(2);
    expect(result.plan?.every((p) => p.status === 'done')).toBe(true);
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
