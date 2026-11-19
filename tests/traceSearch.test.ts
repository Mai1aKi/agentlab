import { describe, expect, it } from 'vitest';
import {
  formatTraceSearchSummary,
  matchesTraceSearch,
  normalizeTraceQuery,
  searchTraceEvents,
  traceEventSearchText,
} from '../src/agent/traceSearch';
import type { TraceEvent } from '../src/agent/types';

const call = { id: 'c1', name: 'calculator', args: { expression: '1 + 2' } };

const TRACE: TraceEvent[] = [
  { type: 'user', content: '计算 1 + 2' },
  { type: 'modelReply', step: 1, reply: { type: 'toolCall', call } },
  { type: 'toolResult', call, result: '3', isError: false },
  { type: 'modelReply', step: 2, reply: { type: 'text', content: '答案是 3' } },
  { type: 'final', content: '答案是 3' },
];

describe('trace search (Day 19)', () => {
  it('normalizes queries by trimming, collapsing whitespace and lowercasing', () => {
    expect(normalizeTraceQuery('  Calculator  ')).toBe('calculator');
    expect(normalizeTraceQuery('a   b')).toBe('a b');
    expect(normalizeTraceQuery('')).toBe('');
    expect(normalizeTraceQuery('   ')).toBe('');
    expect(normalizeTraceQuery(undefined)).toBe('');
    expect(normalizeTraceQuery(null)).toBe('');
    expect(normalizeTraceQuery(42)).toBe('');
  });

  it('builds searchable text from tool names, arguments and results', () => {
    expect(traceEventSearchText(TRACE[1])).toContain('calculator');
    expect(traceEventSearchText(TRACE[1])).toContain('1 + 2');
    expect(traceEventSearchText(TRACE[2])).toContain('calculator');
    expect(traceEventSearchText(TRACE[0])).toContain('计算 1 + 2');
    expect(traceEventSearchText(TRACE[3])).toContain('答案是 3');
  });

  it('matches case-insensitively and an empty query matches everything', () => {
    expect(matchesTraceSearch(TRACE[2], 'CALCULATOR')).toBe(true);
    expect(matchesTraceSearch(TRACE[2], ' calculator ')).toBe(true);
    expect(matchesTraceSearch(TRACE[0], 'calculator')).toBe(false);
    expect(matchesTraceSearch(TRACE[0], '')).toBe(true);
    expect(matchesTraceSearch(TRACE[0], '   ')).toBe(true);
  });

  it('keeps only matching events in order and leaves the trace untouched', () => {
    const kept = searchTraceEvents(TRACE, 'calculator');
    expect(kept.map((e) => e.type)).toEqual(['modelReply', 'toolResult']);
    expect(TRACE).toHaveLength(5);
    expect(searchTraceEvents(TRACE, '答案')).toEqual([TRACE[3], TRACE[4]]);
  });

  it('keeps every event for an empty query and none for a miss', () => {
    const all = searchTraceEvents(TRACE, '');
    expect(all).toEqual(TRACE);
    expect(all).not.toBe(TRACE);
    expect(searchTraceEvents(TRACE, '不存在的关键词')).toEqual([]);
    expect(searchTraceEvents([], 'calculator')).toEqual([]);
  });

  it('formats the search summary for empty and active queries', () => {
    expect(formatTraceSearchSummary('', 5, 5)).toBe('共 5 个事件');
    expect(formatTraceSearchSummary('', 0, 0)).toBe('');
    expect(formatTraceSearchSummary('calculator', 2, 5)).toBe('命中 2 / 5 个事件');
    expect(formatTraceSearchSummary('zzz', 0, 5)).toBe('命中 0 / 5 个事件');
  });
});
