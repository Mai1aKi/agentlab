// Trace filtering (Day 16): the trace panel can get long, so the
// console can narrow it to one kind of event — only tool events,
// only model replies, or everything. The classification is a pure
// function over the trace events, so the panel and the tests agree
// on exactly what each filter keeps. Filtering never mutates or
// drops the underlying trace: export and replay still see it all.

import type { TraceEvent } from './types';

/** The three filters the console offers, in display order. */
export type TraceFilter = 'all' | 'tool' | 'model';

export const TRACE_FILTERS: readonly { id: TraceFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'tool', label: '只看工具' },
  { id: 'model', label: '只看模型' },
];

/** Coerce an unknown value into a valid filter; anything that is
 *  not exactly 'tool' or 'model' (after trimming) falls back to
 *  'all', so a bad stored or typed value never hides the trace. */
export function normalizeTraceFilter(value: unknown): TraceFilter {
  if (typeof value !== 'string') return 'all';
  const trimmed = value.trim();
  return trimmed === 'tool' || trimmed === 'model' ? trimmed : 'all';
}

/** Which bucket an event belongs to. Tool events are the ones a
 *  tool produced or caused (its result, a retry of it, or a call
 *  skipped because the tool was disabled); model events are the
 *  model's own replies; everything else (the task, plans, memory
 *  compression, sub-agents, run stats, the finish / stop markers)
 *  is 'other' and only shows under 'all'. */
export function traceEventCategory(
  event: TraceEvent,
): 'tool' | 'model' | 'other' {
  switch (event.type) {
    case 'toolResult':
    case 'toolRetry':
    case 'toolDisabled':
      return 'tool';
    case 'modelReply':
    case 'textDelta':
      return 'model';
    default:
      return 'other';
  }
}

/** Whether one event is visible under a filter. */
export function matchesTraceFilter(
  event: TraceEvent,
  filter: TraceFilter,
): boolean {
  if (filter === 'all') return true;
  return traceEventCategory(event) === filter;
}

/** The events visible under a filter, in their original order.
 *  Returns a new array; the input trace is left untouched. */
export function filterTraceEvents(
  events: readonly TraceEvent[],
  filter: TraceFilter,
): TraceEvent[] {
  return events.filter((event) => matchesTraceFilter(event, filter));
}
