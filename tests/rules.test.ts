import { describe, expect, it } from 'vitest';
import { blocked, conflicts, isSolved } from '../src/game/rules';
import { EMPTY, QUEEN, type Puzzle } from '../src/game/types';

// Hand-made 5x5 layout; rule checks don't need it to be a real puzzle.
const puzzle: Puzzle = {
  size: 5,
  seed: 0,
  solution: [0, 2, 4, 1, 3],
  regions: [
    0, 0, 1, 1, 1,
    0, 1, 1, 2, 2,
    3, 3, 1, 2, 2,
    3, 3, 4, 4, 2,
    3, 3, 4, 4, 4,
  ],
};

const board = (queens: number[]) => {
  const m = new Array(25).fill(EMPTY);
  for (const q of queens) m[q] = QUEEN;
  return m;
};

describe('rules', () => {
  it('flags same row', () => {
    expect([...conflicts(puzzle, board([0, 3]))].sort()).toEqual([0, 3]);
  });
  it('flags same column', () => {
    expect([...conflicts(puzzle, board([1, 21]))].sort((a, b) => a - b)).toEqual([1, 21]);
  });
  it('flags diagonal touch', () => {
    expect(conflicts(puzzle, board([0, 6])).size).toBe(2);
  });
  it('flags same region', () => {
    // (0,3) and (2,2) are both region 1 but share no row, column or edge
    expect(conflicts(puzzle, board([3, 12])).size).toBe(2);
  });
  it('allows non-attacking queens', () => {
    // (0,0) region 0 and (2,3) region 2
    expect(conflicts(puzzle, board([0, 13])).size).toBe(0);
  });
  it('blocked marks attacked cells', () => {
    const b = blocked(puzzle, board([0]));
    expect(b[1]).toBe(1); // row
    expect(b[5]).toBe(1); // col + region
    expect(b[6]).toBe(1); // diagonal
    expect(b[13]).toBe(0);
    expect(b[0]).toBe(0); // queen itself
  });
  it('isSolved requires n non-conflicting queens', () => {
    expect(isSolved(puzzle, board([0]))).toBe(false);
  });
});
