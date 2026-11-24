import { describe, expect, it } from 'vitest';
import {
  createReplayState,
  formatReplayStatus,
  pauseReplay,
  playReplay,
  resetReplay,
  stepReplay,
  tickReplay,
} from '../src/agent/replayControl';

describe('replay control (Day 24)', () => {
  it('creates a paused replay at the start and sanitizes a bad total', () => {
    expect(createReplayState(3)).toEqual({ total: 3, position: 0, playing: false, done: false });
    expect(createReplayState(-2)).toEqual({ total: 0, position: 0, playing: false, done: true });
    expect(createReplayState('x')).toEqual({ total: 0, position: 0, playing: false, done: true });
    expect(createReplayState(2.9).total).toBe(2);
  });

  it('steps one event at a time, pauses while stepping, and stops at the end', () => {
    let s = stepReplay(createReplayState(2));
    expect(s).toEqual({ total: 2, position: 1, playing: false, done: false });
    s = stepReplay(playReplay(s));
    expect(s).toEqual({ total: 2, position: 2, playing: false, done: true });
    expect(stepReplay(s)).toEqual(s);
  });

  it('pauses and resumes without moving the position', () => {
    const playing = playReplay(stepReplay(createReplayState(3)));
    expect(playing.playing).toBe(true);
    const paused = pauseReplay(playing);
    expect(paused).toEqual({ total: 3, position: 1, playing: false, done: false });
    expect(playReplay(paused).position).toBe(1);
  });

  it('ticks only while playing and finishes on the last event', () => {
    const paused = createReplayState(2);
    expect(tickReplay(paused)).toEqual(paused);
    let s = tickReplay(playReplay(paused));
    expect(s).toEqual({ total: 2, position: 1, playing: true, done: false });
    s = tickReplay(s);
    expect(s).toEqual({ total: 2, position: 2, playing: false, done: true });
    expect(playReplay(s).playing).toBe(false);
  });

  it('resets to the beginning, paused, without mutating the old state', () => {
    const s = stepReplay(createReplayState(3));
    const reset = resetReplay(s);
    expect(reset).toEqual({ total: 3, position: 0, playing: false, done: false });
    expect(s.position).toBe(1);
  });

  it('formats a one-line status for empty, paused, playing and done', () => {
    expect(formatReplayStatus(createReplayState(0))).toBe('回放：暂无事件');
    expect(formatReplayStatus(createReplayState(3))).toBe('回放：已暂停 0/3');
    expect(formatReplayStatus(playReplay(createReplayState(3)))).toBe('回放：播放中 0/3');
    expect(formatReplayStatus(stepReplay(stepReplay(createReplayState(2))))).toBe('回放：已完成 2/2');
  });
});
