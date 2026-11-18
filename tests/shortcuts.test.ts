import { describe, expect, it } from 'vitest';
import {
  formatShortcutHint,
  resolveShortcutAction,
} from '../src/agent/shortcuts';

describe('keyboard shortcuts (Day 18)', () => {
  it('runs on Ctrl+Enter and on Cmd+Enter', () => {
    expect(resolveShortcutAction({ key: 'Enter', ctrlKey: true })).toBe('run');
    expect(resolveShortcutAction({ key: 'Enter', metaKey: true })).toBe('run');
    expect(
      resolveShortcutAction({ key: 'Enter', ctrlKey: true, metaKey: true }),
    ).toBe('run');
  });

  it('keeps plain Enter running and leaves Alt+Enter alone', () => {
    expect(resolveShortcutAction({ key: 'Enter' })).toBe('run');
    expect(resolveShortcutAction({ key: 'Enter', altKey: true })).toBeNull();
    expect(
      resolveShortcutAction({ key: 'Enter', ctrlKey: true, altKey: true }),
    ).toBeNull();
  });

  it('clears on a bare Escape only', () => {
    expect(resolveShortcutAction({ key: 'Escape' })).toBe('clear');
    expect(resolveShortcutAction({ key: 'Escape', ctrlKey: true })).toBeNull();
    expect(resolveShortcutAction({ key: 'Escape', metaKey: true })).toBeNull();
    expect(resolveShortcutAction({ key: 'Escape', altKey: true })).toBeNull();
  });

  it('ignores ordinary typing and unknown keys', () => {
    expect(resolveShortcutAction({ key: 'a' })).toBeNull();
    expect(resolveShortcutAction({ key: 'Backspace' })).toBeNull();
    expect(resolveShortcutAction({ key: 'Tab' })).toBeNull();
    expect(resolveShortcutAction({ key: '' })).toBeNull();
  });

  it('never fires during an IME composition', () => {
    expect(
      resolveShortcutAction({ key: 'Enter', ctrlKey: true, isComposing: true }),
    ).toBeNull();
    expect(
      resolveShortcutAction({ key: 'Escape', isComposing: true }),
    ).toBeNull();
  });

  it('pins the hint wording shown under the composer', () => {
    expect(formatShortcutHint()).toBe(
      '快捷键：Ctrl/Cmd+Enter 运行任务 · Esc 清空输入',
    );
    expect(formatShortcutHint()).toContain('Ctrl/Cmd+Enter');
    expect(formatShortcutHint()).toContain('Esc');
  });
});
