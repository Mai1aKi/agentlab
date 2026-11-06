import { describe, expect, it } from 'vitest';
import { Agent } from '../src/agent/agent';
import { ToolRegistry } from '../src/agent/tools';
import { DEFAULT_MAX_TOOL_RESULT_CHARS, truncateToolResult } from '../src/agent/truncate';
import type { ChatModel, Message } from '../src/agent/types';

describe('truncateToolResult', () => {
  it('passes short results through untouched', () => {
    const r = truncateToolResult('hello', 10);
    expect(r).toEqual({ text: 'hello', truncated: false, originalLength: 5 });
  });

  it('passes a result exactly at the limit through untouched', () => {
    const input = 'x'.repeat(10);
    const r = truncateToolResult(input, 10);
    expect(r.truncated).toBe(false);
    expect(r.text).toBe(input);
  });

  it('cuts over-long results to the limit and annotates the omission', () => {
    const r = truncateToolResult('x'.repeat(25), 10);
    expect(r.truncated).toBe(true);
    expect(r.originalLength).toBe(25);
    expect(r.text.startsWith('x'.repeat(10))).toBe(true);
    expect(r.text).toContain('已截断');
    expect(r.text).toContain('25');
    expect(r.text).toContain('15');
  });

  it('uses the default limit when none is given and falls back on a bad limit', () => {
    const long = 'y'.repeat(DEFAULT_MAX_TOOL_RESULT_CHARS + 1);
    expect(truncateToolResult(long).truncated).toBe(true);
    expect(truncateToolResult(long, 0).truncated).toBe(true);
    expect(truncateToolResult('short', 0).text).toBe('short');
  });
});

describe('agent tool-result truncation', () => {
  it('feeds the model the truncated, annotated result — not the raw output', async () => {
    const registry = new ToolRegistry().register({
      spec: { name: 'dump', description: 'returns a long text', parameters: {} },
      run: () => 'z'.repeat(100),
    });
    let seenByModel: Message[] = [];
    let turn = 0;
    const stub: ChatModel = {
      name: 'truncate-stub',
      async complete(messages) {
        turn++;
        if (turn === 1) {
          return { type: 'toolCall', call: { id: 't1', name: 'dump', args: {} } };
        }
        seenByModel = [...messages];
        return { type: 'text', content: 'done' };
      },
    };
    const agent = new Agent(stub, registry, { maxToolResultChars: 10 });
    const result = await agent.run('dump it');
    expect(result.finalText).toBe('done');
    const toolMsg = seenByModel.find((m) => m.role === 'tool');
    expect(toolMsg?.content.startsWith('z'.repeat(10))).toBe(true);
    expect(toolMsg?.content).toContain('已截断');
    expect(toolMsg?.content).not.toContain('z'.repeat(11));
    const toolEvent = result.trace.find((e) => e.type === 'toolResult');
    expect(toolEvent?.type === 'toolResult' ? toolEvent.result : '').toBe(toolMsg?.content);
  });

  it('leaves short tool results exactly as the tool returned them', async () => {
    const registry = new ToolRegistry().register({
      spec: { name: 'ping', description: 'returns a short text', parameters: {} },
      run: () => 'pong',
    });
    let turn = 0;
    const stub: ChatModel = {
      name: 'short-stub',
      async complete() {
        turn++;
        if (turn === 1) {
          return { type: 'toolCall', call: { id: 's1', name: 'ping', args: {} } };
        }
        return { type: 'text', content: 'done' };
      },
    };
    const agent = new Agent(stub, registry, { maxToolResultChars: 10 });
    const result = await agent.run('ping it');
    const toolEvent = result.trace.find((e) => e.type === 'toolResult');
    expect(toolEvent).toMatchObject({ result: 'pong', isError: false });
  });
});
