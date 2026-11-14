// Session restore (Day 14): the visible conversation and the most
// recent run's trace are kept in the browser's localStorage, so a
// refresh brings the console back the way the user left it. The
// snapshot format and its validation are pure functions over plain
// data; the storage helpers take any minimal get/set/remove store,
// so everything is testable without a DOM or a real localStorage.

import type { ConversationMessage } from './conversationExport';
import { parseTrace } from './trace';
import type { TraceEvent } from './types';

export const SESSION_STORAGE_KEY = 'agentlab-session-v1';
export const SESSION_VERSION = 1 as const;

export interface SessionSnapshot {
  version: typeof SESSION_VERSION;
  savedAt: string;
  chat: ConversationMessage[];
  trace: TraceEvent[];
}

/** The slice of the Web Storage API the session helpers need. */
export interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Serialize the chat log and the last trace into the stored format.
 *  The save time is injectable so tests get deterministic output. */
export function serializeSession(
  chat: readonly ConversationMessage[],
  trace: readonly TraceEvent[],
  savedAt: string = new Date().toISOString(),
): string {
  const payload: SessionSnapshot = {
    version: SESSION_VERSION,
    savedAt,
    chat: [...chat],
    trace: [...trace],
  };
  return JSON.stringify(payload);
}

/** Parse and validate a stored snapshot. A missing value (nothing
 *  saved yet) returns null; corrupt JSON, a wrong version, a chat
 *  entry that is not a user/assistant text bubble, or an unknown
 *  trace event type all throw, like the trace import does. */
export function parseSession(json: string | null): SessionSnapshot | null {
  if (json === null || json.trim() === '') return null;
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('会话存档不是有效的 JSON');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('会话存档格式不对：应为存档对象');
  }
  const payload = data as Partial<SessionSnapshot>;
  if (payload.version !== SESSION_VERSION) {
    throw new Error(`会话存档版本不支持：${String(payload.version)}`);
  }
  if (!Array.isArray(payload.chat)) {
    throw new Error('会话存档缺少 chat 数组');
  }
  for (const message of payload.chat) {
    if (
      !message ||
      typeof message !== 'object' ||
      ((message as ConversationMessage).role !== 'user' &&
        (message as ConversationMessage).role !== 'assistant') ||
      typeof (message as ConversationMessage).text !== 'string'
    ) {
      throw new Error('会话存档中包含无效的对话条目');
    }
  }
  if (!Array.isArray(payload.trace)) {
    throw new Error('会话存档缺少 trace 数组');
  }
  // Reuse the trace whitelist: wrap the raw events in the export
  // shape and let parseTrace reject any unknown event type.
  parseTrace(
    JSON.stringify({ version: 1, exportedAt: payload.savedAt ?? '', events: payload.trace }),
  );
  return payload as SessionSnapshot;
}

/** Save the current chat + trace under the session key. */
export function saveSessionTo(
  storage: SessionStorage,
  chat: readonly ConversationMessage[],
  trace: readonly TraceEvent[],
  savedAt?: string,
): void {
  storage.setItem(SESSION_STORAGE_KEY, serializeSession(chat, trace, savedAt));
}

/** Load the saved snapshot, if any. A corrupt archive loads as
 *  "nothing saved" instead of breaking the console on startup —
 *  the next save simply overwrites it. */
export function loadSessionFrom(storage: SessionStorage): SessionSnapshot | null {
  try {
    return parseSession(storage.getItem(SESSION_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Forget the saved session (the on-screen chat is left alone). */
export function clearSessionFrom(storage: SessionStorage): void {
  storage.removeItem(SESSION_STORAGE_KEY);
}
