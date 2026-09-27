import { batch, computed, effect, signal } from '@preact/signals';
import { blocked, conflicts, isSolved } from '../game/rules';
import { EMPTY, QUEEN, X, type Puzzle } from '../game/types';
import { load, save } from '../../shared/storage';
import { createTimer } from '../../shared/timer';
import { prefetch, takePuzzle } from './puzzles';

export interface Settings {
  size: number;
  autoX: boolean;
  /** Hard mode: no ✕ marks at all, crowns only. */
  hard: boolean;
}

const SETTINGS_KEY = 'queens:settings:v1';
const GAME_KEY = 'queens:game:v1';
const BESTS_KEY = 'queens:bests:v1';
export const HINT_PENALTY_MS = 10_000;
const HISTORY_CAP = 300;

export const settings = signal<Settings>(
  load(SETTINGS_KEY, { size: 8, autoX: true, hard: false }),
);
/** Best times, keyed by size ("8") or size + hard ("8h"). */
export const bests = signal<Record<string, number>>(load(BESTS_KEY, {}));
export const bestKey = (size: number, hard = settings.value.hard) => `${size}${hard ? 'h' : ''}`;

export const puzzle = signal<Puzzle | null>(null);
export const marks = signal<number[]>([]);
export const history = signal<number[][]>([]);
export const won = signal(false);
export const hintsUsed = signal(0);
/** True once a new best was set by the current win. */
export const newBest = signal(false);

export const timer = createTimer();

export function elapsedMs(): number {
  return timer.elapsed();
}

function startTimer(): void {
  if (!won.value) timer.start();
}

export const conflictCells = computed(() => {
  const p = puzzle.value;
  return p ? conflicts(p, marks.value) : new Set<number>();
});

export const blockedCells = computed(() => {
  const p = puzzle.value;
  if (!p || !settings.value.autoX || settings.value.hard) return new Uint8Array(0);
  return blocked(p, marks.value);
});

// --- gestures & edits -------------------------------------------------------

let gestureStart: number[] | null = null;

/** Call at the start of a touch; the whole gesture becomes a single undo step. */
export function beginGesture(): void {
  gestureStart = marks.value;
}

export function setCell(i: number, mark: number): void {
  if (won.value || marks.value[i] === mark) return;
  const next = marks.value.slice();
  next[i] = mark;
  marks.value = next;
  startTimer();
}

/** Returns 'win' | 'conflict' | null so the UI can pick feedback. */
export function endGesture(): 'win' | 'conflict' | 'change' | null {
  const start = gestureStart;
  gestureStart = null;
  if (!start || start === marks.value) return null;
  previous.value = null; // played on: this is the game now
  history.value = [...history.value.slice(-HISTORY_CAP + 1), start];
  return checkWin() ? 'win' : conflictCells.value.size ? 'conflict' : 'change';
}

function checkWin(): boolean {
  const p = puzzle.value;
  if (!p || !isSolved(p, marks.value)) return false;
  timer.pause();
  const t = elapsedMs();
  batch(() => {
    won.value = true;
    const k = bestKey(p.size);
    const prev = bests.value[k];
    newBest.value = prev === undefined || t < prev;
    if (newBest.value) bests.value = { ...bests.value, [k]: t };
  });
  return true;
}

export function undo(): void {
  const h = history.value;
  if (!h.length || won.value) return;
  batch(() => {
    marks.value = h[h.length - 1];
    history.value = h.slice(0, -1);
  });
}

/** Turns hard mode on/off; turning it on wipes existing ✕ marks (undoable). */
export function setHard(on: boolean): void {
  settings.value = { ...settings.value, hard: on };
  if (!on || won.value || !marks.value.includes(X)) return;
  batch(() => {
    history.value = [...history.value, marks.value];
    marks.value = marks.value.map((m) => (m === X ? EMPTY : m));
  });
}

export function clearBoard(): void {
  if (won.value || marks.value.every((m) => m === EMPTY)) return;
  batch(() => {
    history.value = [...history.value, marks.value];
    marks.value = marks.value.map(() => EMPTY);
  });
}

/** Places one correct queen, removing any queens that contradict it. */
export function hint(): boolean {
  const p = puzzle.value;
  if (!p || won.value) return false;
  const n = p.size;
  const rows = p.solution.flatMap((c, r) => (marks.value[r * n + c] === QUEEN ? [] : [r]));
  if (!rows.length) return false;
  const r = rows[Math.floor(Math.random() * rows.length)];
  const target = r * n + p.solution[r];
  const next = marks.value.slice();
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== QUEEN) continue;
    const ir = Math.floor(i / n), ic = i % n;
    if (p.solution[ir] !== ic) next[i] = EMPTY; // wrong queen
  }
  next[target] = QUEEN;
  batch(() => {
    previous.value = null;
    history.value = [...history.value, marks.value];
    marks.value = next;
    hintsUsed.value++;
  });
  startTimer();
  timer.add(HINT_PENALTY_MS);
  checkWin();
  return true;
}

// --- game lifecycle -----------------------------------------------------------

function startPuzzle(p: Puzzle): void {
  timer.reset();
  batch(() => {
    puzzle.value = p;
    marks.value = new Array(p.size * p.size).fill(EMPTY);
    history.value = [];
    won.value = false;
    newBest.value = false;
    hintsUsed.value = 0;
  });
}

interface QueensSnapshot {
  puzzle: Puzzle;
  marks: number[];
  history: number[][];
  hints: number;
  elapsed: number;
}

/** The game "New" replaced, offered back until the first move on the new one. */
export const previous = signal<QueensSnapshot | null>(null);

export async function newGame(size = settings.value.size): Promise<void> {
  const p = puzzle.value;
  // Keep a game worth returning to; pressing New again on an untouched puzzle
  // keeps the original one.
  if (p && !won.value && marks.value.some((m) => m !== EMPTY)) {
    previous.value = {
      puzzle: p,
      marks: marks.value,
      history: history.value,
      hints: hintsUsed.value,
      elapsed: elapsedMs(),
    };
  } else if (won.value) previous.value = null;
  if (size !== settings.value.size) settings.value = { ...settings.value, size };
  startPuzzle(await takePuzzle(size));
}

export function goBack(): void {
  const s = previous.value;
  if (!s) return;
  startPuzzle(s.puzzle);
  batch(() => {
    previous.value = null;
    if (s.puzzle.size !== settings.value.size) settings.value = { ...settings.value, size: s.puzzle.size };
    marks.value = s.marks;
    history.value = s.history;
    hintsUsed.value = s.hints;
  });
  timer.reset(s.elapsed);
  timer.start();
}

let restored = false;

/** Loads the saved game (or starts one) the first time Queens is opened. */
export function restoreOrStart(): void {
  if (restored) return;
  restored = true;
  const saved = load<{
    puzzle: Puzzle | null;
    marks: number[];
    history: number[][];
    elapsed: number;
    won: boolean;
    hints: number;
  }>(GAME_KEY, { puzzle: null, marks: [], history: [], elapsed: 0, won: false, hints: 0 });
  if (saved.puzzle && saved.marks.length === saved.puzzle.size ** 2) {
    timer.reset(saved.elapsed);
    batch(() => {
      puzzle.value = saved.puzzle;
      marks.value = saved.marks;
      history.value = saved.history;
      won.value = saved.won;
      hintsUsed.value = saved.hints;
    });
    // Resume the clock only if play had begun.
    if (!saved.won && saved.marks.some((m) => m !== EMPTY)) timer.startWhenShown();
    prefetch(saved.puzzle.size);
  } else {
    void newGame();
  }
  // Start persisting only after restoring, so the empty initial state never overwrites a saved game.
  effect(() => {
    void puzzle.value, marks.value, won.value;
    if (puzzle.value) persistGame();
  });
}

function persistGame(): void {
  save(GAME_KEY, {
    puzzle: puzzle.value,
    marks: marks.value,
    history: history.value.slice(-50),
    elapsed: elapsedMs(),
    won: won.value,
    hints: hintsUsed.value,
  });
}

effect(() => save(SETTINGS_KEY, settings.value));
effect(() => save(BESTS_KEY, bests.value));

if (typeof document !== 'undefined') {
  // The shared timer pauses itself in the background; just save the game.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && puzzle.value) persistGame();
  });
  window.addEventListener('pagehide', () => puzzle.value && persistGame());
}
