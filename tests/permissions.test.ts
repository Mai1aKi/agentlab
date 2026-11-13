import { describe, expect, it } from 'vitest';
import { Agent } from '../src/agent/agent';
import { createDefaultRegistry } from '../src/agent/builtinTools';
import { MockModel } from '../src/agent/mockModel';
import {
  disabledToolResult,
  isToolDisabled,
  normalizeDisabledTools,
} from '../src/agent/permissions';
import { ToolRegistry } from '../src/agent/tools';
import { parseTrace, serializeTrace } from '../src/agent/trace';
import type { ChatModel } from '../src/agent/types';

describe('normalizeDisabledTools', () => {
  it('trims names, drops blanks and duplicates', () => {
    const set = normalizeDisabledTools([' calculator ', '', 'clock', 'calculator', '  ']);
    expect([...set].sort()).toEqual(['calculator', 'clock']);
    expect(isToolDisabled(set, 'calculator')).toBe(true);
    expect(isToolDisabled(set, 'kb_search')).toBe(false);
  });

  it('treats undefined / null / empty as nothing disabled', () => {
    expect(normalizeDisabledTools().size).toBe(0);
    expect(normalizeDisabledTools(null).size).toBe(0);
    expect(normalizeDisabledTools([]).size).toBe(0);
  });

  it('accepts a Set as input', () => {
    expect([...normalizeDisabledTools(new Set(['clock']))]).toEqual(['clock']);
  });
});

describe('disabledToolResult', () => {
  it('names the tool, carries the Error prefix and states the reason', () => {
    const result = disabledToolResult('calculator');
    expect(result.startsWith('Error:')).toBe(true);
    expect(result).toContain('calculator');
    expect(result).toContain('禁用');
  });
});

/** A model that calls calculator and clock in one turn, then answers. */
function twoToolModel(): ChatModel {
  let turn = 0;
  return {
    name: 'permissions-stub',
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
}

/** A registry with counting calculator / clock tools. */
function countingRegistry(): { registry: ToolRegistry; runs: (name: string) => number } {
  const counts = new Map<string, number>();
  const registry = new ToolRegistry();
  for (const name of ['calculator', 'clock']) {
    registry.register({
      spec: { name, description: name, parameters: {} },
      run: () => {
        counts.set(name, (counts.get(name) ?? 0) + 1);
        return `${name}-ok`;
      },
    });
  }
  return { registry, runs: (name) => counts.get(name) ?? 0 };
}

describe('tool permissions in the agent loop (Day 13)', () => {
  it('skips a disabled tool without executing it, feeds the reason back, and still runs the others', async () => {
    const { registry, runs } = countingRegistry();
    const agent = new Agent(twoToolModel(), registry, { disabledTools: ['calculator'] });
    const result = await agent.run('two things');
    expect(runs('calculator')).toBe(0);
    expect(runs('clock')).toBe(1);
    expect(result.finalText).toBe('done');
    const disabled = result.trace.filter((e) => e.type === 'toolDisabled');
    expect(disabled).toHaveLength(1);
    expect(disabled[0]).toMatchObject({ call: { name: 'calculator' } });
    // The blocked call becomes exactly one error toolResult, before clock's.
    const toolEvents = result.trace.filter((e) => e.type === 'toolResult');
    expect(toolEvents).toHaveLength(2);
    expect(toolEvents[0]).toMatchObject({ isError: true });
    expect(toolEvents[0].type === 'toolResult' ? toolEvents[0].result : '').toContain('禁用');
    expect(toolEvents[1]).toMatchObject({ result: 'clock-ok', isError: false });
    // The model sees the reason as the tool message for that call.
    const toolMsgs = agent.history.filter((m) => m.role === 'tool');
    expect(toolMsgs.map((m) => m.toolCallId)).toEqual(['a', 'b']);
    expect(toolMsgs[0].content).toContain('calculator');
    // A permission denial is not retried.
    expect(result.trace.some((e) => e.type === 'toolRetry')).toBe(false);
  });

  it('runs everything as before when nothing is disabled', async () => {
    const { registry, runs } = countingRegistry();
    const agent = new Agent(twoToolModel(), registry);
    const result = await agent.run('two things');
    expect(runs('calculator')).toBe(1);
    expect(runs('clock')).toBe(1);
    expect(result.trace.some((e) => e.type === 'toolDisabled')).toBe(false);
  });

  it('mock model surfaces the disabled reason in its final answer', async () => {
    const agent = new Agent(new MockModel(), createDefaultRegistry(), {
      disabledTools: ['calculator'],
    });
    const result = await agent.run('计算 1 + 2');
    expect(result.finalText).toContain('工具调用失败');
    expect(result.finalText).toContain('禁用');
    expect(result.trace.some((e) => e.type === 'toolDisabled')).toBe(true);
  });

  it('a trace containing toolDisabled survives export / import', async () => {
    const { registry } = countingRegistry();
    const agent = new Agent(twoToolModel(), registry, { disabledTools: ['clock'] });
    const result = await agent.run('two things');
    const roundTripped = parseTrace(serializeTrace(result.trace));
    expect(roundTripped.some((e) => e.type === 'toolDisabled')).toBe(true);
  });
});
