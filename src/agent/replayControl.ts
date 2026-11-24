// Replay control (Day 24): an imported trace no longer has to
// play back all at once. Playback is a small explicit state —
// how many events there are, how many have been shown, and
// whether it is currently playing — so it can be paused, resumed
// and stepped one event at a time. Pure functions over that
// state; the console owns the timer, these own the rules.

export interface ReplayState {
  total: number;
  position: number;
  playing: boolean;
  done: boolean;
}

function sanitizeTotal(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function makeState(total: number, position: number, playing: boolean): ReplayState {
  const safeTotal = sanitizeTotal(total);
  const safePosition = Math.min(
    safeTotal,
    typeof position === 'number' && Number.isFinite(position) && position > 0
      ? Math.floor(position)
      : 0,
  );
  const done = safePosition >= safeTotal;
  return { total: safeTotal, position: safePosition, playing: playing && !done, done };
}

/** Start a replay paused at the first event, ready to play or step. */
export function createReplayState(total: unknown): ReplayState {
  return makeState(sanitizeTotal(total), 0, false);
}

/** Start (or resume) automatic playback; a finished replay stays finished. */
export function playReplay(state: ReplayState): ReplayState {
  return makeState(state.total, state.position, true);
}

/** Pause automatic playback, keeping the current position. */
export function pauseReplay(state: ReplayState): ReplayState {
  return makeState(state.total, state.position, false);
}

/** Advance exactly one event (single-step). Stepping always pauses
 *  automatic playback, and stepping past the end is a no-op that
 *  leaves the replay marked done. */
export function stepReplay(state: ReplayState): ReplayState {
  return makeState(state.total, state.position + 1, false);
}

/** Advance one event as part of automatic playback (playing is kept
 *  until the last event lands, which flips the state to done). */
export function tickReplay(state: ReplayState): ReplayState {
  if (!state.playing) return makeState(state.total, state.position, false);
  return makeState(state.total, state.position + 1, true);
}

/** Restart from the beginning, paused. */
export function resetReplay(state: ReplayState): ReplayState {
  return makeState(state.total, 0, false);
}

/** One-line playback status for the console. */
export function formatReplayStatus(state: ReplayState): string {
  if (state.total <= 0) return '回放：暂无事件';
  if (state.done) return `回放：已完成 ${state.position}/${state.total}`;
  return `回放：${state.playing ? '播放中' : '已暂停'} ${state.position}/${state.total}`;
}
