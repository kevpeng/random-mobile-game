import { QUEEN, type Puzzle } from './types';

/** True when queens at cells a and b may not coexist (same row/col/region, or touching). */
export function attacks(puzzle: Puzzle, a: number, b: number): boolean {
  const n = puzzle.size;
  const ar = Math.floor(a / n), ac = a % n;
  const br = Math.floor(b / n), bc = b % n;
  return (
    ar === br ||
    ac === bc ||
    puzzle.regions[a] === puzzle.regions[b] ||
    (Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1)
  );
}

function queensOf(marks: ArrayLike<number>): number[] {
  const qs: number[] = [];
  for (let i = 0; i < marks.length; i++) if (marks[i] === QUEEN) qs.push(i);
  return qs;
}

/** Queen cells that break a rule with at least one other queen. */
export function conflicts(puzzle: Puzzle, marks: ArrayLike<number>): Set<number> {
  const qs = queensOf(marks);
  const bad = new Set<number>();
  for (let i = 0; i < qs.length; i++)
    for (let j = i + 1; j < qs.length; j++)
      if (attacks(puzzle, qs[i], qs[j])) {
        bad.add(qs[i]);
        bad.add(qs[j]);
      }
  return bad;
}

/** Non-queen cells ruled out by at least one placed queen (for auto-✕). */
export function blocked(puzzle: Puzzle, marks: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(marks.length);
  const qs = queensOf(marks);
  if (!qs.length) return out;
  for (let c = 0; c < marks.length; c++) {
    if (marks[c] === QUEEN) continue;
    for (const q of qs)
      if (attacks(puzzle, q, c)) {
        out[c] = 1;
        break;
      }
  }
  return out;
}

export function isSolved(puzzle: Puzzle, marks: ArrayLike<number>): boolean {
  return queensOf(marks).length === puzzle.size && conflicts(puzzle, marks).size === 0;
}
