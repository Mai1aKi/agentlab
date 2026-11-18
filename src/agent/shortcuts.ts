// Keyboard shortcuts (Day 18): the console's task input grows two
// shortcuts — Ctrl/Cmd+Enter runs the task and Esc clears the
// input. The decision of "which action does this key press mean"
// is a pure function over a minimal event shape, so the console
// handler and the tests agree exactly, and a stray modifier or an
// IME composition can never trigger a run by accident.

/** What a key press in the task input asks the console to do. */
export type ShortcutAction = 'run' | 'clear';

/** The smallest slice of a KeyboardEvent the decision needs.
 *  `isComposing` marks an IME composition in progress (e.g. typing
 *  Chinese): Enter/Esc there belong to the IME, not the console. */
export interface ShortcutKeyEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
}

/** Map a key press to a console action, or null when it is just
 *  ordinary typing. Enter runs — plain Enter keeps its long-standing
 *  behaviour, and Ctrl+Enter / Cmd+Enter (macOS) run too; Alt+Enter
 *  is left alone (browsers / OSes reserve it). A bare Escape (no
 *  Ctrl/Cmd/Alt held) clears; modified Escapes belong to the OS.
 *  Nothing fires while an IME composition is in progress. */
export function resolveShortcutAction(
  event: ShortcutKeyEvent,
): ShortcutAction | null {
  if (!event || typeof event.key !== 'string' || event.isComposing) {
    return null;
  }
  if (event.key === 'Enter') {
    return event.altKey ? null : 'run';
  }
  if (event.key === 'Escape') {
    return event.ctrlKey || event.metaKey || event.altKey ? null : 'clear';
  }
  return null;
}

/** The hint line the console shows under the composer, kept here
 *  so the wording the tests pin down is the wording users see. */
export function formatShortcutHint(): string {
  return '快捷键：Ctrl/Cmd+Enter 运行任务 · Esc 清空输入';
}
