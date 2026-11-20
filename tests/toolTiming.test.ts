import { describe, expect, it } from 'vitest';
import { Agent } from '../src/agent/agent';
import { createDefaultRegistry } from '../src/agent/builtinTools';
import { MockModel } from '../src/agent/mockModel';
import {
  formatToolDuration,
  measureToolDuration,
  sanitizeToolDuration,
} from '../src/agent/toolTiming';
import type { ChatModel } from '../src/agent/types';

describe('tool-call timing (Day 20)', () => {
  it('sanitizes durations: floors positives, clamps bad values to 0', () => {
    expect(sanitizeToolDuration(12.9)).toBe(12);
    expect(sanitizeToolDuration(0)).toBe(0);
    expect(sanitizeToolDuration(-3)).toBe(0);
    expect(sanitizeToolDuration(Number.NaN)).toBe(0);
    expect(sanitizeToolDuration(Number.POSITIVE_INFINITY)).toBe(0);
    expect(sanitizeToolDuration('12')).toBe(0);
    expect(sanitizeToolDuration(undefined)).toBe(0);
  });

  it('measures elapsed time and treats a backwards clock as 0', () => {
    expect(measureToolDuration(100, 115)).toBe(15);
    expect(measureToolDuration(100, 100)).toBe(0);
    expect(measureToolDuration(100, 90)).toBe(0);
    expect(measureToolDuration('100', 115)).toBe(0);
  });

  it('formats a duration as one annotation line', () => {
    expect(formatToolDuration(15)).toBe('耗时 15 ms');
    expect(formatToolDuration(15.8)).toBe('耗时 15 ms');
    expect(formatToolDuration(undefined)).toBe('耗时 0 ms');
    expect(formatToolDuration(-1)).toBe('耗时 0 ms');
  });

  it('annotates each tool result with its measured duration', async () => {
    // Clock readings: run start, tool start, tool end, run-stats end.
    const times = [0, 10, 25, 100];
    let tick = 0;
    const agent = new Agent(new MockModel(), createDefaultRegistry(), {
      now: () => times[Math.min(tick++, times.length - 1)],
    });
    const result = await agent.run('计算 1 + 1');
    const toolEvent = result.trace.find((e) => e.type === 'toolResult');
    expect(toolEvent?.type === 'toolResult' ? toolEvent.durationMs : undefined).toBe(15);
    expect(result.stats.durationMs).toBe(100);
  });

  it('times every call in a multi-tool turn separately', async () => {
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
    // Readings: run start, call a start/end, call b start/end, stats end.
    const times = [0, 0, 7, 7, 19, 50];
    let tick = 0;
    const agent = new Agent(multiModel, createDefaultRegistry(), {
      now: () => times[Math.min(tick++, times.length - 1)],
    });
    const result = await agent.run('two things');
    const durations = result.trace
      .filter((e) => e.type === 'toolResult')
      .map((e) => (e.type === 'toolResult' ? e.durationMs : -1));
    expect(durations).toEqual([7, 12]);
  });

  it('reports 0 ms for a disabled tool that was never executed', async () => {
    const agent = new Agent(new MockModel(), createDefaultRegistry(), {
      disabledTools: ['calculator'],
      now: () => 42,
    });
    const result = await agent.run('计算 1 + 1');
    const toolEvent = result.trace.find((e) => e.type === 'toolResult');
    expect(toolEvent?.type === 'toolResult' ? toolEvent.durationMs : undefined).toBe(0);
    expect(toolEvent?.type === 'toolResult' ? toolEvent.isError : false).toBe(true);
  });
});
