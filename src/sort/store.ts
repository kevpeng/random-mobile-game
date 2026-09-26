import { batch, computed, effect, signal } from '@preact/signals';
import { randomSeed } from '../shared/rng';
import { load, save } from '../shared/storage';
import {
  applyMove,
  colorsOf,
  generateSort,
  isComplete,
  isSolved,
  moveCount,
  solve,
  type Move,
  type SortConfig,
  type SortPuzzle,
  type Stacks,
} from './game';

export const PRESETS: { name: string; config: SortConfig }[] = [
  { name: 'Easy', config: { colors: 4, height: 4, empty: 2 } },
  { name: 'Medium', config: { colors: 7, height: 4, empty: 2 } },
  { name: 'Hard', config: { colors: 10, height: 4, empty: 2 } },
  { name: 'Expert', config: { colors: 12, height: 5, empty: 2 } },
];

export function configName(c: SortConfig): string {
  const p = PRESETS.find((p) => p.config.colors === c.colors && p.config.height === c.height);
  return p ? p.name : `${c.colors}×${c.height}`;
}

const configKey = (c: SortConfig) => `${c.colors}x${c.height}x${c.empty}`;

const CONFIG_KEY = 'sort:config:v1';
const GAME_KEY = 'sort:game:v1';
const BESTS_KEY = 'sort:bests:v1';

export const config = signal<SortConfig>(load(CONFIG_KEY, PRESETS[1].config));
export const bests = signal<Record<string, number>>(load(BESTS_KEY, {}));

export const puzzle = signal<SortPuzzle | null>(null);
export const stacks = signal<number[][]>([]);
export const history = signal<number[][][]>([]);
export const moves = signal(0);
export const selected = signal<number | null>(null);
export const won = signal(false);
export const newBest = signal(false);
/** A suggested move to highlight, or 'stuck' when there's no way forward. */
export const hintMove = signal<Move | 'stuck' | null>(null);

export const colorStacks = computed<Stacks>(() => (puzzle.value ? colorsOf(puzzle.value, stacks.value) : []));

// --- worker -------------------------------------------------------------------

let worker: Worker | null = null;
try {
  worker = new Worker(new URL('./gen.worker.ts', import.meta.url), { type: 'module' });
} catch {
  worker = null;
}
let nextId = 0;
const pending = new Map<number, (r: unknown) => void>();
worker?.addEventListener('message', (e: MessageEvent<{ id: number; result: unknown }>) => {
  pending.get(e.data.id)?.(e.data.result);
  pending.delete(e.data.id);
});

function ask<T>(msg: object, fallback: () => T): Promise<T> {
  if (!worker) return Promise.resolve(fallback());
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve as (r: unknown) => void);
    worker!.postMessage({ id, ...msg });
  });
}

const ready = new Map<string, Promise<SortPuzzle>>();

function prefetch(c: SortConfig): void {
  const k = configKey(c);
  if (ready.has(k)) return;
  const seed = randomSeed();
  ready.set(k, ask({ type: 'gen', config: c, seed }, () => generateSort(c, seed)));
}

function take(c: SortConfig): Promise<SortPuzzle> {
  prefetch(c);
  const k = configKey(c);
  const p = ready.get(k)!;
  ready.delete(k);
  p.then(() => prefetch(c));
  return p;
}

// --- actions ------------------------------------------------------------------

function start(p: SortPuzzle): void {
  batch(() => {
    puzzle.value = p;
    stacks.value = p.stacks;
    history.value = [];
    moves.value = 0;
    selected.value = null;
    won.value = false;
    newBest.value = false;
    hintMove.value = null;
  });
}

export async function newGame(c: SortConfig = config.value): Promise<void> {
  config.value = c;
  start(await take(c));
}

export function restart(): void {
  if (puzzle.value) start(puzzle.value);
}

export type TapResult = 'lift' | 'drop' | 'move' | 'complete' | 'win' | 'switch' | 'blocked' | null;

export function tapStack(i: number): TapResult {
  const p = puzzle.value;
  if (!p || won.value) return null;
  const cap = p.config.height;
  const cs = colorStacks.value;
  const sel = selected.value;
  hintMove.value = null;

  if (sel === null) {
    if (!cs[i].length || isComplete(cs[i], cap)) return 'blocked';
    selected.value = i;
    return 'lift';
  }
  if (sel === i) {
    selected.value = null;
    return 'drop';
  }
  const n = moveCount(cs, sel, i, cap);
  if (!n) {
    // Can't go there: pick that stack up instead, if it can move at all.
    if (cs[i].length && !isComplete(cs[i], cap)) {
      selected.value = i;
      return 'switch';
    }
    selected.value = null;
    return 'blocked';
  }
  const next = applyMove(stacks.value, sel, i, n);
  batch(() => {
    history.value = [...history.value, stacks.value];
    stacks.value = next;
    moves.value++;
    selected.value = null;
  });
  const after = colorStacks.value;
  if (isSolved(after, cap)) {
    const k = configKey(p.config);
    const prev = bests.value[k];
    batch(() => {
      won.value = true;
      newBest.value = prev === undefined || moves.value < prev;
      if (newBest.value) bests.value = { ...bests.value, [k]: moves.value };
    });
    return 'win';
  }
  return isComplete(after[i], cap) ? 'complete' : 'move';
}

export function undo(): void {
  const h = history.value;
  if (!h.length || won.value) return;
  batch(() => {
    stacks.value = h[h.length - 1];
    history.value = h.slice(0, -1);
    moves.value++; // undoing still counts as a move
    selected.value = null;
    hintMove.value = null;
  });
}

let hintToken = 0;
export async function hint(): Promise<void> {
  const p = puzzle.value;
  if (!p || won.value) return;
  const token = ++hintToken;
  const cs = colorStacks.value;
  const cap = p.config.height;
  const path = await ask<Move[] | null>({ type: 'solve', stacks: cs, cap }, () => solve(cs, cap, 400_000));
  if (token !== hintToken || colorStacks.value !== cs) return; // board changed meanwhile
  batch(() => {
    selected.value = null;
    hintMove.value = path && path.length ? path[0] : 'stuck';
  });
}

// --- persistence ----------------------------------------------------------------

let restored = false;

export function restoreOrStart(): void {
  if (restored) return;
  restored = true;
  const saved = load<{
    puzzle: SortPuzzle | null;
    stacks: number[][];
    history: number[][][];
    moves: number;
    won: boolean;
  }>(GAME_KEY, { puzzle: null, stacks: [], history: [], moves: 0, won: false });
  if (saved.puzzle && saved.stacks.length === saved.puzzle.stacks.length) {
    batch(() => {
      puzzle.value = saved.puzzle;
      stacks.value = saved.stacks;
      history.value = saved.history;
      moves.value = saved.moves;
      won.value = saved.won;
    });
    prefetch(saved.puzzle.config);
  } else {
    void newGame();
  }
  effect(() => {
    if (!puzzle.value) return;
    save(GAME_KEY, {
      puzzle: puzzle.value,
      stacks: stacks.value,
      history: history.value.slice(-100),
      moves: moves.value,
      won: won.value,
    });
  });
}

effect(() => save(CONFIG_KEY, config.value));
effect(() => save(BESTS_KEY, bests.value));
