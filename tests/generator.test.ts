import { describe, expect, it } from 'vitest';
import { generatePuzzle } from '../src/game/generator';
import { isSolved } from '../src/game/rules';
import { countSolutions } from '../src/game/solver';
import { EMPTY, QUEEN } from '../src/game/types';

function regionsConnected(n: number, regions: number[]): boolean {
  for (let g = 0; g < n; g++) {
    const cells = regions.flatMap((r, i) => (r === g ? [i] : []));
    if (!cells.length) return false;
    const seen = new Set([cells[0]]);
    const stack = [cells[0]];
    while (stack.length) {
      const i = stack.pop()!;
      const r = Math.floor(i / n), c = i % n;
      for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
        const j = rr * n + cc;
        if (regions[j] === g && !seen.has(j)) {
          seen.add(j);
          stack.push(j);
        }
      }
    }
    if (seen.size !== cells.length) return false;
  }
  return true;
}

describe('generator', () => {
  for (let size = 5; size <= 10; size++) {
    it(`makes unique, connected ${size}x${size} puzzles`, () => {
      const seeds = size >= 9 ? 60 : 200;
      for (let seed = 1; seed <= seeds; seed++) {
        const p = generatePuzzle(size, seed);
        expect(p.regions.length).toBe(size * size);
        expect(new Set(p.regions).size).toBe(size);
        expect(countSolutions(size, p.regions, 2)).toBe(1);
        expect(regionsConnected(size, p.regions)).toBe(true);
        const marks = new Array(size * size).fill(EMPTY);
        p.solution.forEach((c, r) => (marks[r * size + c] = QUEEN));
        expect(isSolved(p, marks)).toBe(true);
      }
    }, 30_000);
  }

  it('is deterministic per seed', () => {
    expect(generatePuzzle(8, 42)).toEqual(generatePuzzle(8, 42));
  });
});
