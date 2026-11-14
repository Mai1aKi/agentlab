import { describe, expect, it } from 'vitest';
import type { ConversationMessage } from '../src/agent/conversationExport';
import {
  SESSION_STORAGE_KEY,
  clearSessionFrom,
  loadSessionFrom,
  parseSession,
  saveSessionTo,
  serializeSession,
  type SessionStorage,
} from '../src/agent/session';
import type { TraceEvent } from '../src/agent/types';

const AT = '2026-11-13T00:00:00.000Z';
const call = { id: 'c1', name: 'calculator', args: { expression: '3 + 4' } };

const chat: ConversationMessage[] = [
  { role: 'user', text: '计算 3 + 4' },
  { role: 'assistant', text: '3 + 4 = 7' },
];

const trace: TraceEvent[] = [
  { type: 'user', content: '计算 3 + 4' },
  { type: 'toolResult', call, result: '7', isError: false },
  { type: 'final', content: '3 + 4 = 7' },
];

function fakeStorage(): SessionStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

describe('session restore (Day 14)', () => {
  it('serializes and parses a chat + trace snapshot round-trip', () => {
    const parsed = parseSession(serializeSession(chat, trace, AT));
    expect(parsed?.version).toBe(1);
    expect(parsed?.savedAt).toBe(AT);
    expect(parsed?.chat).toEqual(chat);
    expect(parsed?.trace).toEqual(trace);
  });

  it('treats a missing or empty stored value as no saved session', () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession('')).toBeNull();
    expect(loadSessionFrom(fakeStorage())).toBeNull();
  });

  it('rejects corrupt JSON, a wrong version and invalid entries', () => {
    expect(() => parseSession('{nope')).toThrow('有效的 JSON');
    expect(() =>
      parseSession(JSON.stringify({ version: 2, savedAt: AT, chat: [], trace: [] })),
    ).toThrow('版本不支持');
    expect(() =>
      parseSession(
        JSON.stringify({
          version: 1,
          savedAt: AT,
          chat: [{ role: 'tool', text: 'x' }],
          trace: [],
        }),
      ),
    ).toThrow('无效的对话条目');
    expect(() =>
      parseSession(
        JSON.stringify({ version: 1, savedAt: AT, chat: [], trace: [{ type: 'mystery' }] }),
      ),
    ).toThrow('未知事件类型');
  });

  it('saves, loads and clears through a storage backend', () => {
    const storage = fakeStorage();
    saveSessionTo(storage, chat, trace, AT);
    expect(storage.map.has(SESSION_STORAGE_KEY)).toBe(true);
    const loaded = loadSessionFrom(storage);
    expect(loaded?.chat).toEqual(chat);
    expect(loaded?.trace).toEqual(trace);
    clearSessionFrom(storage);
    expect(loadSessionFrom(storage)).toBeNull();
  });

  it('loads a corrupt stored archive as no session instead of throwing', () => {
    const storage = fakeStorage();
    storage.setItem(SESSION_STORAGE_KEY, '{"version":99}');
    expect(loadSessionFrom(storage)).toBeNull();
  });

  it('keeps an empty chat and trace as a valid, restorable snapshot', () => {
    const parsed = parseSession(serializeSession([], [], AT));
    expect(parsed?.chat).toEqual([]);
    expect(parsed?.trace).toEqual([]);
  });
});
