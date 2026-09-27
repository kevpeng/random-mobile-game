import { mulberry32, shuffle } from '../shared/rng';

/** Stacks of colours, bottom → top. */
export type Stacks = number[][];
export type Move = [from: number, to: number];

export interface SortConfig {
  colors: number;
  height: number;
  empty: number;
}

export const MAX_COLORS = 12;

const top = (s: number[]) => s[s.length - 1];

/** Number of same-coloured pieces on top of a stack. */
export function topRun(s: number[]): number {
  let k = 0;
  while (k < s.length && s[s.length - 1 - k] === top(s)) k++;
  return k;
}

export function isComplete(s: number[], cap: number): boolean {
  return s.length === cap && topRun(s) === cap;
}

export function isSolved(stacks: Stacks, cap: number): boolean {
  return stacks.every((s) => s.length === 0 || isComplete(s, cap));
}

/** How many pieces a move would carry (0 if illegal). Moves carry as much of the top run as fits. */
export function moveCount(stacks: Stacks, from: number, to: number, cap: number): number {
  const src = stacks[from], dst = stacks[to];
  if (from === to || !src.length || dst.length >= cap) return 0;
  if (dst.length && top(dst) !== top(src)) return 0;
  return Math.min(topRun(src), cap - dst.length);
}

export function applyMove<T>(stacks: T[][], from: number, to: number, count: number): T[][] {
  const next = stacks.slice();
  const src = stacks[from];
  next[from] = src.slice(0, src.length - count);
  next[to] = [...stacks[to], ...src.slice(src.length - count)];
  return next;
}

/**
 * Legal moves that change the position meaningfully (with how many pieces each
 * carries). Moving a finished tube, or pouring a single-colour stack into an
 * empty tube, doesn't count.
 */
export function usefulMoves(stacks: Stacks, cap: number): [from: number, to: number, count: number][] {
  const out: [number, number, number][] = [];
  for (let from = 0; from < stacks.length; from++) {
    const src = stacks[from];
    if (!src.length || isComplete(src, cap)) continue;
    const uniform = topRun(src) === src.length;
    for (let to = 0; to < stacks.length; to++) {
      const n = moveCount(stacks, from, to, cap);
      if (n && !(uniform && stacks[to].length === 0)) out.push([from, to, n]);
    }
  }
  return out;
}

export const hasUsefulMove = (stacks: Stacks, cap: number): boolean => usefulMoves(stacks, cap).length > 0;

/**
 * Whether every move left just cycles between a handful of positions — e.g.
 * one ball ping-ponging between the same two tubes — with no way to finish.
 * Explores the whole reachable set (same moves as hasUsefulMove) and gives up
 * with false past `limit` positions, leaving big searches to analyze().
 */
export function trappedInLoop(stacks: Stacks, cap: number, limit = 24): boolean {
  const seen = new Set([positionKey(stacks)]);
  const queue = [stacks];
  for (let i = 0; i < queue.length; i++) {
    if (isSolved(queue[i], cap)) return false;
    for (const [from, to, n] of usefulMoves(queue[i], cap)) {
      const next = applyMove(queue[i], from, to, n);
      const k = positionKey(next);
      if (seen.has(k)) continue;
      if (seen.size >= limit) return false;
      seen.add(k);
      queue.push(next);
    }
  }
  return true;
}

/**
 * Depth-first search with a visited set, trying promising moves first.
 * Returns a move list, or null if unsolvable (or the node budget ran out).
 */
export function solve(start: Stacks, cap: number, budget = 200_000): Move[] | null {
  return analyze(start, cap, budget).path;
}

export interface Analysis {
  /** A solution from this position, if one was found. */
  path: Move[] | null;
  /** False if the search ran out of budget, so "no path" isn't proof of a dead end. */
  complete: boolean;
}

/**
 * Like solve(), but says whether the search was exhaustive. With
 * `complete && !path` the position is a proven dead end (the pruning below
 * only skips moves that can never matter). Positions in `avoid` (e.g. ones
 * already played) are treated as visited, so the route never passes through them.
 */
export function analyze(start: Stacks, cap: number, budget = 200_000, avoid: Stacks[] = []): Analysis {
  const key = positionKey;
  const seen = new Set<string>(avoid.map(key));
  seen.delete(key(start));
  const path: Move[] = [];
  let exhausted = false;

  const go = (st: Stacks): boolean => {
    if (isSolved(st, cap)) return true;
    if (--budget <= 0) {
      exhausted = true;
      return false;
    }
    const k = key(st);
    if (seen.has(k)) return false;
    seen.add(k);

    const moves: [number, Move, number][] = [];
    let emptyTried = false;
    for (let to = 0; to < st.length; to++) {
      const dstEmpty = st[to].length === 0;
      if (dstEmpty && emptyTried) continue; // all empty stacks are equivalent
      for (let from = 0; from < st.length; from++) {
        const src = st[from];
        if (!src.length || isComplete(src, cap)) continue;
        const n = moveCount(st, from, to, cap);
        if (!n) continue;
        const run = topRun(src);
        if (dstEmpty && run === src.length) continue; // pointless: moving a uniform stack
        if (n < run && dstEmpty) continue; // splitting a run into an empty stack never helps
        // Prefer building on existing stacks and freeing up long runs.
        const score = (dstEmpty ? 0 : 10 + st[to].length) + (n === run ? 3 : 0) + (run === src.length ? 0 : 1);
        moves.push([score, [from, to], n]);
      }
      if (dstEmpty) emptyTried = true;
    }
    moves.sort((a, b) => b[0] - a[0]);
    for (const [, mv, n] of moves) {
      path.push(mv);
      if (go(applyMove(st, mv[0], mv[1], n))) return true;
      path.pop();
    }
    return false;
  };

  const found = go(start);
  return { path: found ? path : null, complete: found || !exhausted };
}

/** Same position regardless of tube order (tubes are interchangeable). */
export function positionKey(st: Stacks): string {
  return st.map((s) => s.join(',')).sort().join('|');
}


/**
 * For a dead end: how many moves back (1..history.length) the most recent
 * winnable position is, or null if none is found within the budget.
 * `history` is oldest → newest.
 */
export function lastWinnable(history: Stacks[], cap: number, budget = 200_000): number | null {
  for (let back = 1; back <= history.length; back++) {
    const a = analyze(history[history.length - back], cap, budget);
    if (a.path) return back;
  }
  return null;
}

export interface SortPuzzle {
  config: SortConfig;
  /** Colour of each piece id. */
  colors: number[];
  /** Piece ids per stack, bottom → top. */
  stacks: number[][];
  seed: number;
}

export function colorsOf(p: { colors: number[] }, stacks: number[][]): Stacks {
  return stacks.map((s) => s.map((id) => p.colors[id]));
}

/** Random deal that the solver can finish, with no stack already sorted. */
export function generateSort(config: SortConfig, seed: number): SortPuzzle {
  const rand = mulberry32(seed);
  const { colors: k, height: h, empty } = config;
  for (;;) {
    const colors = shuffle(
      Array.from({ length: k * h }, (_, i) => Math.floor(i / h)),
      rand,
    );
    const stacks: number[][] = [];
    for (let s = 0; s < k; s++) stacks.push(Array.from({ length: h }, (_, j) => s * h + j));
    for (let e = 0; e < empty; e++) stacks.push([]);
    const cs = colorsOf({ colors }, stacks);
    // Avoid deals that start partly solved: no stack with a run of h-1 or more.
    if (cs.some((s) => s.length && topRun(s) >= Math.max(2, h - 1))) continue;
    if (cs.some((s) => new Set(s).size === 1 && s.length)) continue;
    if (solve(cs, h)) return { config, colors, stacks, seed };
  }
}
