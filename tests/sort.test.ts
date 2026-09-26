import { describe, expect, it } from 'vitest';
import {
  applyMove,
  colorsOf,
  generateSort,
  hasUsefulMove,
  isSolved,
  moveCount,
  solve,
  topRun,
} from '../src/sort/game';

describe('sort rules', () => {
  it('topRun counts matching top pieces', () => {
    expect(topRun([1, 2, 2])).toBe(2);
    expect(topRun([])).toBe(0);
  });
  it('moves carry as much of the run as fits', () => {
    const st = [[0, 1, 1], [2, 1], []];
    expect(moveCount(st, 0, 1, 4)).toBe(2);
    expect(moveCount(st, 0, 1, 3)).toBe(1);
    expect(moveCount(st, 1, 0, 3)).toBe(0); // full
    expect(moveCount(st, 0, 2, 3)).toBe(2);
    expect(moveCount([[0], [1]], 0, 1, 3)).toBe(0); // colour mismatch
    expect(applyMove(st, 0, 2, 2)).toEqual([[0], [2, 1], [1, 1]]);
  });
  it('isSolved accepts full single-colour stacks and empties', () => {
    expect(isSolved([[1, 1], [], [0, 0]], 2)).toBe(true);
    expect(isSolved([[1], [1]], 2)).toBe(false);
  });
});

function replay(stacks: number[][], cap: number, moves: [number, number][]) {
  let st = stacks;
  for (const [f, t] of moves) {
    const n = moveCount(st, f, t, cap);
    expect(n).toBeGreaterThan(0);
    st = applyMove(st, f, t, n);
  }
  return st;
}

describe('sort generator', () => {
  const configs = [
    { colors: 3, height: 3, empty: 2 },
    { colors: 4, height: 4, empty: 2 },
    { colors: 7, height: 4, empty: 2 },
    { colors: 10, height: 4, empty: 2 },
    { colors: 12, height: 5, empty: 2 },
    { colors: 8, height: 6, empty: 2 },
  ];
  for (const config of configs) {
    it(`deals solvable ${config.colors}x${config.height} puzzles`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const p = generateSort(config, seed);
        expect(p.stacks.length).toBe(config.colors + config.empty);
        const cs = colorsOf(p, p.stacks);
        expect(isSolved(cs, config.height)).toBe(false);
        const path = solve(cs, config.height)!;
        expect(isSolved(replay(cs, config.height, path), config.height)).toBe(true);
      }
    }, 30_000);
  }
});

describe('hasUsefulMove', () => {
  it('is false when every open tube has a mismatched top', () => {
    // Tubes: [0] [1] [2,2] [0,3] [1,3] with height 2: nothing can go anywhere.
    expect(hasUsefulMove([[0], [1], [2, 2], [0, 3], [1, 3]], 2)).toBe(false);
  });
  it('ignores pouring a single-colour stack into an empty tube', () => {
    expect(hasUsefulMove([[0, 0], [1], []], 2)).toBe(false);
  });
  it('is true when a matching top has room', () => {
    expect(hasUsefulMove([[0], [1, 0], [2, 2]], 2)).toBe(true);
  });
  it('is true when a mixed stack can go into an empty tube', () => {
    expect(hasUsefulMove([[0, 1], [1, 0], []], 2)).toBe(true);
  });
});
