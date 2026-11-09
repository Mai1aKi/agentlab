import { describe, expect, it } from 'vitest';
import { Agent } from '../src/agent/agent';
import { DEFAULT_MAX_TOOL_RETRIES, resolveMaxToolRetries } from '../src/agent/retry';
import { ToolRegistry } from '../src/agent/tools';
import type { ChatModel } from '../src/agent/types';

/** A model that calls the `flaky` tool once, then answers with text. */
function toolThenTextModel(): ChatModel {
  let turn = 0;
  return {
    name: 'retry-stub',
    async complete() {
      turn++;
      if (turn === 1) {
        return { type: 'toolCall', call: { id: 'r1', name: 'flaky', args: {} } };
      }
      return { type: 'text', content: 'done' };
    },
  };
}

/** A registry whose `flaky` tool fails `failures` times, then succeeds. */
function flakyRegistry(failures: number): { registry: ToolRegistry; calls: () => number } {
  let calls = 0;
  const registry = new ToolRegistry();
  registry.register({
    spec: { name: 'flaky', description: 'fails, then works', parameters: {} },
    run: () => {
      calls++;
      if (calls <= failures) throw new Error(`boom ${calls}`);
      return 'ok';
    },
  });
  return { registry, calls: () => calls };
}

describe('resolveMaxToolRetries', () => {
  it('defaults to one retry, floors fractions, and honors an explicit 0', () => {
    expect(DEFAULT_MAX_TOOL_RETRIES).toBe(1);
    expect(resolveMaxToolRetries()).toBe(1);
    expect(resolveMaxToolRetries(0)).toBe(0);
    expect(resolveMaxToolRetries(2.9)).toBe(2);
  });

  it('falls back to the default for negative or non-finite values', () => {
    expect(resolveMaxToolRetries(-3)).toBe(1);
    expect(resolveMaxToolRetries(Number.NaN)).toBe(1);
    expect(resolveMaxToolRetries(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('tool-failure retry in the agent loop (Day 11)', () => {
  it('retries a failed call once, marks the trace, and feeds back only the final success', async () => {
    const { registry, calls } = flakyRegistry(1);
    const agent = new Agent(toolThenTextModel(), registry);
    const result = await agent.run('try it');
    expect(calls()).toBe(2);
    expect(result.finalText).toBe('done');
    const retries = result.trace.filter((e) => e.type === 'toolRetry');
    expect(retries).toHaveLength(1);
    expect(retries[0]).toMatchObject({ attempt: 1, result: 'Error: boom 1' });
    const toolEvents = result.trace.filter((e) => e.type === 'toolResult');
    expect(toolEvents).toHaveLength(1);
    expect(toolEvents[0]).toMatchObject({ result: 'ok', isError: false });
    // The model sees exactly one tool message for the call — the success.
    const toolMsgs = agent.history.filter((m) => m.role === 'tool');
    expect(toolMsgs).toHaveLength(1);
    expect(toolMsgs[0].content).toBe('ok');
  });

  it('gives up after one retry and feeds the final error back', async () => {
    const { registry, calls } = flakyRegistry(99);
    const agent = new Agent(toolThenTextModel(), registry);
    const result = await agent.run('try it');
    expect(calls()).toBe(2);
    expect(result.trace.filter((e) => e.type === 'toolRetry')).toHaveLength(1);
    const toolEvents = result.trace.filter((e) => e.type === 'toolResult');
    expect(toolEvents).toHaveLength(1);
    expect(toolEvents[0]).toMatchObject({ result: 'Error: boom 2', isError: true });
  });

  it('does not retry a successful call', async () => {
    const { registry, calls } = flakyRegistry(0);
    const agent = new Agent(toolThenTextModel(), registry);
    const result = await agent.run('try it');
    expect(calls()).toBe(1);
    expect(result.trace.some((e) => e.type === 'toolRetry')).toBe(false);
  });

  it('maxToolRetries: 0 disables retrying', async () => {
    const { registry, calls } = flakyRegistry(1);
    const agent = new Agent(toolThenTextModel(), registry, { maxToolRetries: 0 });
    const result = await agent.run('try it');
    expect(calls()).toBe(1);
    expect(result.trace.some((e) => e.type === 'toolRetry')).toBe(false);
    const toolEvents = result.trace.filter((e) => e.type === 'toolResult');
    expect(toolEvents[0]).toMatchObject({ isError: true });
  });
});
