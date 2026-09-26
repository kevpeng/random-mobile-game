import { signal, type Signal } from '@preact/signals';

export interface GameTimer {
  /** Bumps a few times a second while running, so views re-render. */
  tick: Signal<number>;
  elapsed(): number;
  running(): boolean;
  /** Starts (or keeps) the clock, e.g. on the first move. */
  start(): void;
  /** Stops the clock, e.g. on a win. */
  pause(): void;
  reset(ms?: number): void;
  add(ms: number): void;
  /**
   * Marks the clock as running-but-suspended, e.g. when restoring a game in
   * progress; it actually starts once its game is on screen.
   */
  startWhenShown(): void;
  /** The game's screen appeared or disappeared. */
  setShown(shown: boolean): void;
}

const timers: Internal[] = [];

/** Re-render views without subscribing the caller (safe inside effects). */
const bump = (t: GameTimer) => (t.tick.value = t.tick.peek() + 1);

interface Internal extends GameTimer {
  suspend(): void;
  resume(): void;
}

const now = () => performance.now();
const hidden = () => typeof document !== 'undefined' && document.hidden;

export function createTimer(): GameTimer {
  let accumulated = 0;
  let since: number | null = null; // set while actually running
  let suspended = false; // should be running, but app/game is hidden
  let shown = false;

  const t: Internal = {
    tick: signal(0),
    elapsed: () => accumulated + (since === null ? 0 : now() - since),
    running: () => since !== null,
    start() {
      if (since !== null) return;
      if (shown && !hidden()) since = now();
      else suspended = true;
    },
    pause() {
      suspended = false;
      if (since !== null) {
        accumulated += now() - since;
        since = null;
      }
      bump(t);
    },
    reset(ms = 0) {
      accumulated = ms;
      since = null;
      suspended = false;
      bump(t);
    },
    add(ms) {
      accumulated += ms;
      bump(t);
    },
    startWhenShown() {
      suspended = true;
      t.resume();
    },
    setShown(v) {
      shown = v;
      if (v) t.resume();
      else t.suspend();
    },
    suspend() {
      if (since === null) return;
      accumulated += now() - since;
      since = null;
      suspended = true;
    },
    resume() {
      if (!suspended || !shown || hidden()) return;
      suspended = false;
      since = now();
    },
  };
  timers.push(t);
  return t;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    for (const t of timers) {
      if (document.hidden) t.suspend();
      else t.resume();
    }
  });
  setInterval(() => {
    for (const t of timers) if (t.running()) bump(t);
  }, 250);
}
