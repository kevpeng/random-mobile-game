import { mulberry32, shuffle } from '../../shared/rng';
import { solve } from './solver';
import type { Puzzle } from './types';

const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

/** Random queen column per row with no two queens in adjacent rows touching. */
function randomQueens(n: number, rand: () => number): number[] {
  const cols: number[] = [];
  const used = new Array<boolean>(n).fill(false);
  const go = (row: number): boolean => {
    if (row === n) return true;
    for (const c of shuffle([...Array(n).keys()], rand)) {
      if (used[c] || (row > 0 && Math.abs(c - cols[row - 1]) <= 1)) continue;
      used[c] = true;
      cols[row] = c;
      if (go(row + 1)) return true;
      used[c] = false;
    }
    return false;
  };
  go(0);
  return cols;
}

/** Grows one region from each queen by randomly claiming unassigned neighbours. */
function growRegions(n: number, queens: number[], rand: () => number): number[] {
  const regions = new Array<number>(n * n).fill(-1);
  queens.forEach((c, r) => (regions[r * n + c] = r));
  // Per-region appetite gives a mix of shapes; dividing by current size keeps
  // any one region from swallowing the board.
  const appetite = queens.map(() => 0.5 + rand());
  const sizes = queens.map(() => 1);
  const weight = (g: number) => appetite[g] / Math.pow(sizes[g], 0.8);
  let remaining = n * n - n;
  while (remaining > 0) {
    // Collect frontier (unassigned cell, neighbouring region) pairs.
    const frontier: [number, number][] = [];
    let total = 0;
    for (let i = 0; i < n * n; i++) {
      if (regions[i] !== -1) continue;
      const r = Math.floor(i / n), c = i % n;
      for (const [dr, dc] of ORTHO) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
        const g = regions[rr * n + cc];
        if (g !== -1) {
          frontier.push([i, g]);
          total += weight(g);
        }
      }
    }
    let pick = rand() * total;
    for (const [cell, g] of frontier) {
      pick -= weight(g);
      if (pick <= 0) {
        regions[cell] = g;
        sizes[g]++;
        remaining--;
        break;
      }
    }
  }
  return regions;
}

/** Is `region` still connected if `without` is removed from it? */
function connectedWithout(n: number, regions: number[], region: number, without: number): boolean {
  const cells: number[] = [];
  for (let i = 0; i < n * n; i++) if (regions[i] === region && i !== without) cells.push(i);
  if (!cells.length) return false;
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop()!;
    const r = Math.floor(i / n), c = i % n;
    for (const [dr, dc] of ORTHO) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
      const j = rr * n + cc;
      if (j !== without && regions[j] === region && !seen.has(j)) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size === cells.length;
}

/**
 * Removes an alternative solution by moving one of its queen cells into a
 * neighbouring region (the alternative then has two queens there). The true
 * solution is untouched because that cell is never one of its queens.
 */
function breakAlternative(n: number, regions: number[], solution: number[], alt: number[], rand: () => number): boolean {
  const rows = shuffle([...Array(n).keys()].filter((r) => alt[r] !== solution[r]), rand);
  for (const r of rows) {
    const cell = r * n + alt[r];
    const from = regions[cell];
    const c = alt[r];
    const targets = new Set<number>();
    for (const [dr, dc] of ORTHO) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
      const g = regions[rr * n + cc];
      if (g !== from) targets.add(g);
    }
    if (!targets.size || !connectedWithout(n, regions, from, cell)) continue;
    const opts = shuffle([...targets], rand);
    regions[cell] = opts[0];
    return true;
  }
  return false;
}

export function generatePuzzle(size: number, seed: number): Puzzle {
  const rand = mulberry32(seed);
  for (;;) {
    const solution = randomQueens(size, rand);
    const regions = growRegions(size, solution, rand);
    for (let attempt = 0; attempt < size * size * 2; attempt++) {
      const sols = solve(size, regions, 2);
      if (sols.length === 1) return { size, regions, solution, seed };
      const alt = sols.find((s) => s.some((c, r) => c !== solution[r]))!;
      if (!breakAlternative(size, regions, solution, alt, rand)) break;
    }
  }
}
