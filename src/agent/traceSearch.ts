// Trace search (Day 19): the trace panel can get long, so the
// console can narrow it by keyword — only events whose searchable
// text contains the query stay visible. The searchable text for
// each event is a pure function, so the panel and the tests agree
// on exactly what a keyword can hit (task text, model replies,
// tool names and arguments, tool results, plan steps, and so on).
// Search never mutates or drops the underlying trace: export and
// replay still see it all, and clearing the query restores it.

import type { TraceEvent } from './types';

/** Coerce an unknown value into a normalized query: non-strings
 *  become the empty query, strings are trimmed, internal runs of
 *  whitespace collapse to one space, and the result is lowercased
 *  so matching is case-insensitive. An empty query matches every
 *  event, so a blank or bad value never hides the trace. */
export function normalizeTraceQuery(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The searchable text of one event: its type plus every piece of
 *  human-visible content it carries — the task, a model reply's
 *  text / plan steps / tool names and arguments, a tool call's
 *  name, arguments and result, plan titles, sub-agent text, run
 *  stats numbers, and the final / stop text. */
export function traceEventSearchText(event: TraceEvent): string {
  switch (event.type) {
    case 'user':
      return `${event.type} ${event.content}`;
    case 'modelReply': {
      const reply = event.reply;
      if (reply.type === 'text') {
        return `${event.type} ${event.step} ${reply.content}`;
      }
      if (reply.type === 'plan') {
        return `${event.type} ${event.step} plan ${reply.steps.join(' ')}`;
      }
      const calls = reply.type === 'toolCalls' ? reply.calls : [reply.call];
      const rendered = calls
        .map((c) => `${c.name} ${JSON.stringify(c.args)}`)
        .join(' ');
      return `${event.type} ${event.step} ${rendered}`;
    }
    case 'toolResult':
      return (
        `${event.type} ${event.call.name} ${JSON.stringify(event.call.args)} ` +
        `${event.result}${event.isError ? ' error' : ''}` +
        `${typeof event.durationMs === 'number' ? ` durationMs ${event.durationMs}` : ''}`
      );
    case 'toolRetry':
      return `${event.type} ${event.call.name} ${JSON.stringify(event.call.args)} ${event.attempt} ${event.result}`;
    case 'toolDisabled':
      return `${event.type} ${event.call.name} ${JSON.stringify(event.call.args)} ${event.result}`;
    case 'memoryCompressed':
      return `${event.type} ${event.summarizedCount} ${event.keptCount} ${event.summary}`;
    case 'planCreated':
      return `${event.type} ${event.steps.join(' ')}`;
    case 'planStepDone':
      return `${event.type} ${event.index + 1} ${event.title}`;
    case 'subAgentStarted':
      return `${event.type} ${event.role} ${event.instruction}`;
    case 'subAgentDone':
      return `${event.type} ${event.role} ${event.summary}`;
    case 'planReview':
      return (
        `${event.type} total ${event.review.total} done ${event.review.done} ` +
        `pending ${event.review.pending} percent ${event.review.percent} ` +
        `${event.review.pendingTitles.join(' ')}`
      );
    case 'runStats':
      return (
        `${event.type} steps ${event.stats.steps} toolCalls ${event.stats.toolCalls} ` +
        `toolErrors ${event.stats.toolErrors} durationMs ${event.stats.durationMs}`
      );
    case 'final':
      return `${event.type} ${event.content}`;
    case 'stopped':
      return `${event.type} ${event.reason}`;
  }
}

/** Whether one event matches a query. The query is normalized
 *  first, so case and surrounding whitespace never matter; an
 *  empty query matches everything. */
export function matchesTraceSearch(event: TraceEvent, query: unknown): boolean {
  const normalized = normalizeTraceQuery(query);
  if (normalized === '') return true;
  return traceEventSearchText(event).toLowerCase().includes(normalized);
}

/** The events matching a query, in their original order. Returns
 *  a new array; the input trace is left untouched. An empty query
 *  keeps every event. */
export function searchTraceEvents(
  events: readonly TraceEvent[],
  query: unknown,
): TraceEvent[] {
  return events.filter((event) => matchesTraceSearch(event, query));
}

/** One-line summary for the console next to the search box: with
 *  no query it reports the total, with a query it reports how
 *  many of the total matched and echoes the trimmed query. */
export function formatTraceSearchSummary(
  query: unknown,
  matched: number,
  total: number,
): string {
  const normalized = normalizeTraceQuery(query);
  if (normalized === '') return total > 0 ? `共 ${total} 个事件` : '';
  return `命中 ${matched} / ${total} 个事件`;
}
