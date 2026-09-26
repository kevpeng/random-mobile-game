/** Cell marks. Auto-✕ marks are derived at render time and never stored. */
export const EMPTY = 0;
export const X = 1;
export const QUEEN = 2;
export type Mark = typeof EMPTY | typeof X | typeof QUEEN;

export interface Puzzle {
  size: number;
  /** Region id per cell, row-major, length size*size. */
  regions: number[];
  /** Column of the queen in each row of the unique solution. */
  solution: number[];
  seed: number;
}
