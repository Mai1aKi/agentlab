// Trace export / replay (Day 5): a run's trace can be saved as JSON
// and imported back for replay, without re-running the model or tools.
// These helpers are pure so export, validation and stepping are
// testable on their own.

import type { TraceEvent } from './types';

export const TRACE_EXPORT_VERSION = 1 as const;

export interface TraceExport {
  version: typeof TRACE_EXPORT_VERSION;
  exportedAt: string;
  events: TraceEvent[];
}

const EVENT_TYPES = new Set([
  'user',
  'modelReply',
  'toolResult',
  'memoryCompressed',
  'planCreated',
  'planStepDone',
  'subAgentStarted',
  'subAgentDone',
  'final',
  'stopped',
]);

/** Serialize a trace to the portable JSON export format. */
export function serializeTrace(
  trace: readonly TraceEvent[],
  exportedAt: string = new Date().toISOString(),
): string {
  const payload: TraceExport = {
    version: TRACE_EXPORT_VERSION,
    exportedAt,
    events: [...trace],
  };
  return JSON.stringify(payload, null, 2);
}

/** Parse and validate an exported trace. Throws on bad JSON, a wrong
 *  version, a missing events array, or an unknown event type. */
export function parseTrace(json: string): TraceEvent[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('轨迹文件不是有效的 JSON');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('轨迹文件格式不对：应为导出对象');
  }
  const payload = data as Partial<TraceExport>;
  if (payload.version !== TRACE_EXPORT_VERSION) {
    throw new Error(`轨迹版本不支持：${String(payload.version)}`);
  }
  if (!Array.isArray(payload.events)) {
    throw new Error('轨迹文件缺少 events 数组');
  }
  for (const event of payload.events) {
    if (
      !event ||
      typeof event !== 'object' ||
      typeof (event as { type?: unknown }).type !== 'string' ||
      !EVENT_TYPES.has((event as { type: string }).type)
    ) {
      throw new Error('轨迹中包含未知事件类型');
    }
  }
  return payload.events as TraceEvent[];
}

/** A stepper for replaying a trace one event at a time. */
export interface TraceReplay {
  readonly total: number;
  readonly position: number;
  readonly done: boolean;
  current(): TraceEvent | undefined;
  next(): TraceEvent | undefined;
  reset(): void;
}

export function createReplay(trace: readonly TraceEvent[]): TraceReplay {
  let position = 0;
  return {
    get total() {
      return trace.length;
    },
    get position() {
      return position;
    },
    get done() {
      return position >= trace.length;
    },
    current() {
      return trace[position];
    },
    next() {
      const event = trace[position];
      if (event !== undefined) position += 1;
      return event;
    },
    reset() {
      position = 0;
    },
  };
}

/** Emit every event in order (a full replay); returns how many fired. */
export function replayTrace(
  trace: readonly TraceEvent[],
  emit: (event: TraceEvent) => void,
): number {
  const replay = createReplay(trace);
  let event: TraceEvent | undefined;
  let count = 0;
  while ((event = replay.next()) !== undefined) {
    emit(event);
    count += 1;
  }
  return count;
}
