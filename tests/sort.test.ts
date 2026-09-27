import { describe, expect, it } from 'vitest';
import {
  analyze,
  applyMove,
  colorsOf,
  generateSort,
  hasUsefulMove,
  isSolved,
  lastWinnable,
  moveCount,
  solve,
  topRun,
  trappedInLoop,
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

describe('dead-end analysis', () => {
  // 3 colours, height 3, one spare tube. Two moves from a winnable deal reach a dead end.
  const initial = [[0, 0, 1], [0, 2, 1], [1, 2, 2], []];
  const dead = [[0, 0], [0, 2], [1, 2, 2], [1, 1]];

  it('proves a dead end exhaustively (moves exist, no solution)', () => {
    expect(hasUsefulMove(dead, 3)).toBe(true);
    expect(analyze(dead, 3)).toEqual({ path: null, complete: true });
  });
  it('never calls a position dead when the search runs out of budget', () => {
    const a = analyze(dead, 3, 3);
    expect(a.path).toBeNull();
    expect(a.complete).toBe(false);
  });
  it('winnable positions come back with a path', () => {
    const a = analyze(initial, 3);
    expect(a.complete).toBe(true);
    expect(a.path).not.toBeNull();
  });
  it('lastWinnable finds how far back to rewind', () => {
    expect(lastWinnable([initial], 3)).toBe(1);
    expect(lastWinnable([dead, dead], 3)).toBeNull();
    expect(lastWinnable([initial, dead, dead], 3)).toBe(3);
  });
});

describe('trappedInLoop', () => {
  // 3 colours, height 3: the 1s on tube 1 can only hop onto tube 0 and back.
  const pingPong = [[0, 1], [2, 1, 1], [0, 2], [2, 0]];

  it('catches one ball shuttling between the same two tubes', () => {
    expect(hasUsefulMove(pingPong, 3)).toBe(true);
    expect(trappedInLoop(pingPong, 3)).toBe(true);
    expect(trappedInLoop(applyMove(pingPong, 1, 0, 1), 3)).toBe(true);
    expect(analyze(pingPong, 3)).toEqual({ path: null, complete: true });
  });
  it('is false when a solution is reachable', () => {
    expect(trappedInLoop([[0, 0, 1], [0, 2, 1], [1, 2, 2], []], 3)).toBe(false);
    expect(trappedInLoop([[0, 0, 0], [1, 1], [2, 2, 2], [1]], 3)).toBe(false);
  });
  it('is false for fresh deals, and gives up quickly on big ones', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const p = generateSort({ colors: 4, height: 4, empty: 2 }, seed);
      expect(trappedInLoop(colorsOf(p, p.stacks), 4)).toBe(false);
    }
    const big = generateSort({ colors: 12, height: 5, empty: 2 }, 7);
    const t0 = performance.now();
    expect(trappedInLoop(colorsOf(big, big.stacks), 5)).toBe(false);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});
