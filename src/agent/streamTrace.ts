// Stream trace (Day 22): streamed text used to vanish into the
// live bubble — once the run finished, only the final answer
// remained and there was no way to see how it had been generated.
// These pure helpers collect the fragments a model streamed, in
// arrival order, so the trace panel (and the export, and replay)
// can show the generation process itself, fragment by fragment.
// Collecting never mutates the fragments it was given.

import type { TraceEvent } from './types';

/** Coerce an unknown value into a stream fragment: only real
 *  strings pass through (verbatim — whitespace is content in a
 *  stream); anything else becomes the empty fragment. */
export function normalizeStreamDelta(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Append one fragment to a collection, returning a new array.
 *  Empty (or non-string) fragments are skipped, so the collection
 *  only holds fragments that actually carried text. */
export function appendStreamDelta(
  chunks: readonly string[],
  delta: unknown,
): string[] {
  const normalized = normalizeStreamDelta(delta);
  if (normalized === '') return [...chunks];
  return [...chunks, normalized];
}

/** Join collected fragments back into the full streamed text. */
export function joinStreamDeltas(chunks: readonly string[]): string {
  return chunks.join('');
}

/** The streamed text of a whole trace, rebuilt from its
 *  `textDelta` events in order. Traces without any streamed
 *  fragments (non-streaming runs, older exports) give ''. */
export function collectStreamText(events: readonly TraceEvent[]): string {
  const chunks: string[] = [];
  for (const event of events) {
    if (event.type === 'textDelta') chunks.push(event.delta);
  }
  return joinStreamDeltas(chunks);
}

/** One-line summary of a fragment collection for the console:
 *  how many fragments arrived and how much text they carried. */
export function formatStreamTraceSummary(chunks: readonly string[]): string {
  if (chunks.length === 0) return '流式轨迹：本次运行没有流式片段';
  const chars = joinStreamDeltas(chunks).length;
  return `流式轨迹：共 ${chunks.length} 片，合计 ${chars} 字`;
}
