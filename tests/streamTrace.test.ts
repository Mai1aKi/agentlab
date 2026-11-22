import { describe, expect, it } from 'vitest';
import { Agent } from '../src/agent/agent';
import { createDefaultRegistry } from '../src/agent/builtinTools';
import {
  appendStreamDelta,
  collectStreamText,
  formatStreamTraceSummary,
  joinStreamDeltas,
  normalizeStreamDelta,
} from '../src/agent/streamTrace';
import { parseTrace, serializeTrace } from '../src/agent/trace';
import type { ChatModel, TraceEvent } from '../src/agent/types';

describe('stream trace (Day 22)', () => {
  it('normalizes only real strings, verbatim', () => {
    expect(normalizeStreamDelta(' 你好 ')).toBe(' 你好 ');
    expect(normalizeStreamDelta('')).toBe('');
    expect(normalizeStreamDelta(42)).toBe('');
    expect(normalizeStreamDelta(null)).toBe('');
    expect(normalizeStreamDelta(undefined)).toBe('');
  });

  it('appends fragments immutably and skips empty or non-string fragments', () => {
    const start: string[] = ['你'];
    const next = appendStreamDelta(start, '好');
    expect(next).toEqual(['你', '好']);
    expect(start).toEqual(['你']);
    expect(appendStreamDelta(next, '')).toEqual(['你', '好']);
    expect(appendStreamDelta(next, 7)).toEqual(['你', '好']);
  });

  it('joins fragments back into the full streamed text', () => {
    expect(joinStreamDeltas(['你', '好', '，世界'])).toBe('你好，世界');
    expect(joinStreamDeltas([])).toBe('');
  });

  it('collects streamed text from a trace in order and ignores other events', () => {
    const events: TraceEvent[] = [
      { type: 'user', content: '打个招呼' },
      { type: 'textDelta', step: 1, index: 0, delta: '你' },
      { type: 'textDelta', step: 1, index: 1, delta: '好' },
      { type: 'final', content: '你好' },
    ];
    expect(collectStreamText(events)).toBe('你好');
    expect(collectStreamText([{ type: 'user', content: 'x' }])).toBe('');
  });

  it('formats a one-line summary and an explicit empty summary', () => {
    expect(formatStreamTraceSummary(['你', '好呀'])).toBe('流式轨迹：共 2 片，合计 3 字');
    expect(formatStreamTraceSummary([])).toBe('流式轨迹：本次运行没有流式片段');
  });

  it('agent records each streamed fragment as a textDelta event and still forwards it', async () => {
    const forwarded: string[] = [];
    const stub: ChatModel = {
      name: 'stream-trace-stub',
      async complete(_messages, _tools, onTextDelta) {
        onTextDelta?.('你');
        onTextDelta?.('');
        onTextDelta?.('好');
        return { type: 'text', content: '你好' };
      },
    };
    const agent = new Agent(stub, createDefaultRegistry(), {
      onTextDelta: (d) => forwarded.push(d),
    });
    const result = await agent.run('打个招呼');
    expect(forwarded).toEqual(['你', '', '好']);
    const deltas = result.trace.filter((e) => e.type === 'textDelta');
    expect(deltas).toEqual([
      { type: 'textDelta', step: 1, index: 0, delta: '你' },
      { type: 'textDelta', step: 1, index: 1, delta: '好' },
    ]);
    expect(collectStreamText(result.trace)).toBe('你好');
    // Export / replay round-trip keeps the new event type.
    expect(parseTrace(serializeTrace(result.trace))).toEqual(result.trace);
  });

  it('agent without a streaming callback records no textDelta events', async () => {
    const stub: ChatModel = {
      name: 'no-stream-stub',
      async complete(_messages, _tools, onTextDelta) {
        expect(onTextDelta).toBeUndefined();
        return { type: 'text', content: '直接回答' };
      },
    };
    const agent = new Agent(stub, createDefaultRegistry());
    const result = await agent.run('直接回答');
    expect(result.trace.some((e) => e.type === 'textDelta')).toBe(false);
  });
});
