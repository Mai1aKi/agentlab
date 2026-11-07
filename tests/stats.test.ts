import { describe, expect, it } from 'vitest';
import { Agent } from '../src/agent/agent';
import { createDefaultRegistry } from '../src/agent/builtinTools';
import { MockModel } from '../src/agent/mockModel';
import { computeRunStats, formatRunStats } from '../src/agent/stats';
import type { ChatModel, TraceEvent } from '../src/agent/types';

const call = { id: 'c1', name: 'calculator', args: { expression: '1 + 1' } };

describe('run-cost statistics (Day 10)', () => {
  it('derives steps, tool calls and errors from a trace', () => {
    const trace: TraceEvent[] = [
      { type: 'user', content: 'hi' },
      { type: 'modelReply', step: 1, reply: { type: 'toolCall', call } },
      { type: 'toolResult', call, result: '2', isError: false },
      {
        type: 'toolResult',
        call: { ...call, id: 'c2', name: 'clock' },
        result: 'boom',
        isError: true,
      },
      { type: 'modelReply', step: 2, reply: { type: 'text', content: 'done' } },
    ];
    expect(computeRunStats(trace, 123.9)).toEqual({
      steps: 2,
      toolCalls: 2,
      toolErrors: 1,
      durationMs: 123,
    });
  });

  it('returns zeros for an empty trace and clamps a bad duration', () => {
    expect(computeRunStats([], -5)).toEqual({
      steps: 0,
      toolCalls: 0,
      toolErrors: 0,
      durationMs: 0,
    });
    expect(computeRunStats([], Number.NaN).durationMs).toBe(0);
  });

  it('formats stats as one panel line', () => {
    const line = formatRunStats({ steps: 3, toolCalls: 2, toolErrors: 1, durationMs: 42 });
    expect(line).toContain('步数 3');
    expect(line).toContain('工具调用 2 次');
    expect(line).toContain('失败 1 次');
    expect(line).toContain('耗时 42 ms');
  });

  it('agent returns stats and emits runStats before final, with an injected clock', async () => {
    const times = [1000, 1250];
    let tick = 0;
    const agent = new Agent(new MockModel(), createDefaultRegistry(), {
      now: () => times[Math.min(tick++, times.length - 1)],
    });
    const result = await agent.run('计算 1 + 1');
    expect(result.stats).toEqual({ steps: 2, toolCalls: 1, toolErrors: 0, durationMs: 250 });
    const kinds = result.trace.map((e) => e.type);
    expect(kinds[kinds.length - 2]).toBe('runStats');
    expect(kinds[kinds.length - 1]).toBe('final');
    const statsEvent = result.trace.find((e) => e.type === 'runStats');
    expect(statsEvent?.type === 'runStats' ? statsEvent.stats : null).toEqual(result.stats);
  });

  it('a stopped run still reports stats before the stopped event', async () => {
    const loopingModel: ChatModel = {
      name: 'loop-stub',
      async complete() {
        return { type: 'toolCall', call: { id: 'x', name: 'clock', args: {} } };
      },
    };
    const agent = new Agent(loopingModel, createDefaultRegistry(), {
      maxSteps: 2,
      now: () => 0,
    });
    const result = await agent.run('go');
    expect(result.stats).toEqual({ steps: 2, toolCalls: 2, toolErrors: 0, durationMs: 0 });
    const kinds = result.trace.map((e) => e.type);
    expect(kinds[kinds.length - 2]).toBe('runStats');
    expect(kinds[kinds.length - 1]).toBe('stopped');
  });
});
