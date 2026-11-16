import { describe, expect, it } from 'vitest';
import {
  TRACE_FILTERS,
  filterTraceEvents,
  matchesTraceFilter,
  normalizeTraceFilter,
  traceEventCategory,
} from '../src/agent/traceFilter';
import type { TraceEvent } from '../src/agent/types';

const call = { id: 'c1', name: 'calculator', args: { expression: '1 + 2' } };

const TRACE: TraceEvent[] = [
  { type: 'user', content: '计算 1 + 2' },
  { type: 'modelReply', step: 1, reply: { type: 'toolCall', call } },
  { type: 'toolRetry', call, attempt: 1, result: 'Error: boom' },
  { type: 'toolResult', call, result: '3', isError: false },
  { type: 'toolDisabled', call, result: 'Error: disabled' },
  { type: 'modelReply', step: 2, reply: { type: 'text', content: '答案是 3' } },
  { type: 'final', content: '答案是 3' },
];

describe('trace filtering (Day 16)', () => {
  it('offers exactly the all / tool / model filters with labels', () => {
    expect(TRACE_FILTERS.map((f) => f.id)).toEqual(['all', 'tool', 'model']);
    for (const filter of TRACE_FILTERS) {
      expect(filter.label.trim()).not.toBe('');
    }
  });

  it('classifies tool, model and other events', () => {
    expect(traceEventCategory(TRACE[3])).toBe('tool');
    expect(traceEventCategory(TRACE[2])).toBe('tool');
    expect(traceEventCategory(TRACE[4])).toBe('tool');
    expect(traceEventCategory(TRACE[1])).toBe('model');
    expect(traceEventCategory(TRACE[0])).toBe('other');
    expect(traceEventCategory(TRACE[6])).toBe('other');
  });

  it('keeps every event in order under the all filter', () => {
    const kept = filterTraceEvents(TRACE, 'all');
    expect(kept).toEqual(TRACE);
    expect(kept).not.toBe(TRACE);
  });

  it('keeps only tool events under the tool filter, in order', () => {
    expect(filterTraceEvents(TRACE, 'tool').map((e) => e.type)).toEqual([
      'toolRetry',
      'toolResult',
      'toolDisabled',
    ]);
  });

  it('keeps only model replies under the model filter', () => {
    const kept = filterTraceEvents(TRACE, 'model');
    expect(kept).toEqual([TRACE[1], TRACE[5]]);
    expect(matchesTraceFilter(TRACE[0], 'model')).toBe(false);
    expect(matchesTraceFilter(TRACE[3], 'model')).toBe(false);
  });

  it('normalizes unknown filters to all and keeps an empty trace empty', () => {
    expect(normalizeTraceFilter('tool')).toBe('tool');
    expect(normalizeTraceFilter(' model ')).toBe('model');
    expect(normalizeTraceFilter('everything')).toBe('all');
    expect(normalizeTraceFilter('')).toBe('all');
    expect(normalizeTraceFilter(undefined)).toBe('all');
    expect(normalizeTraceFilter(null)).toBe('all');
    expect(filterTraceEvents([], 'tool')).toEqual([]);
  });
});
