import { describe, expect, it } from 'vitest';
import { createReplay, parseTrace, replayTrace, serializeTrace } from '../src/agent/trace';
import type { TraceEvent } from '../src/agent/types';

const sample: TraceEvent[] = [
  { type: 'user', content: '计算 3 + 4' },
  {
    type: 'toolResult',
    call: { id: 'c1', name: 'calculator', args: { expression: '3 + 4' } },
    result: '7',
    isError: false,
  },
  { type: 'final', content: '3 + 4 = 7' },
];

describe('trace export / replay (Day 5)', () => {
  it('round-trips a trace through serialize and parse', () => {
    const json = serializeTrace(sample, '2026-11-01T00:00:00.000Z');
    const payload = JSON.parse(json) as { version: number; exportedAt: string };
    expect(payload.version).toBe(1);
    expect(payload.exportedAt).toBe('2026-11-01T00:00:00.000Z');
    expect(parseTrace(json)).toEqual(sample);
  });

  it('rejects invalid JSON, wrong version, and unknown events', () => {
    expect(() => parseTrace('not json')).toThrow('JSON');
    expect(() => parseTrace('{"version":2,"events":[]}')).toThrow('版本');
    expect(() => parseTrace('{"version":1}')).toThrow('events');
    expect(() => parseTrace('{"version":1,"events":[{"type":"nope"}]}')).toThrow('未知');
  });

  it('steps through a replay in order and resets', () => {
    const replay = createReplay(sample);
    expect(replay.total).toBe(3);
    expect(replay.done).toBe(false);
    expect(replay.current()).toEqual(sample[0]);
    expect(replay.next()).toEqual(sample[0]);
    expect(replay.position).toBe(1);
    expect(replay.next()).toEqual(sample[1]);
    expect(replay.next()).toEqual(sample[2]);
    expect(replay.done).toBe(true);
    expect(replay.next()).toBeUndefined();
    replay.reset();
    expect(replay.position).toBe(0);
    expect(replay.current()).toEqual(sample[0]);
  });

  it('replays every event in order', () => {
    const seen: TraceEvent[] = [];
    const count = replayTrace(sample, (e) => seen.push(e));
    expect(count).toBe(3);
    expect(seen).toEqual(sample);
  });
});
