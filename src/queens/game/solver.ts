/**
 * Solves a Queens layout, returning up to `limit` solutions as the queen's
 * column per row. Always branches on the region with the fewest open cells,
 * which prunes far better than going row by row.
 */
export function solve(size: number, regions: ArrayLike<number>, limit = 2): number[][] {
  const n = size;
  const byRegion: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n * n; i++) byRegion[regions[i]].push(i);

  const out: number[][] = [];
  const cols = new Array<number>(n).fill(-1);
  const touch = new Int8Array(n * n); // >0 when next to a placed queen
  let usedRows = 0, usedCols = 0, usedRegions = 0;

  const open = (i: number) => {
    const r = (i / n) | 0, c = i % n;
    return !(usedRows & (1 << r)) && !(usedCols & (1 << c)) && touch[i] === 0;
  };

  const mark = (i: number, d: 1 | -1) => {
    const r = (i / n) | 0, c = i % n;
    for (let rr = Math.max(0, r - 1); rr <= Math.min(n - 1, r + 1); rr++)
      for (let cc = Math.max(0, c - 1); cc <= Math.min(n - 1, c + 1); cc++) touch[rr * n + cc] += d;
  };

  const go = (placed: number): boolean => {
    if (placed === n) {
      out.push(cols.slice());
      return out.length >= limit;
    }
    let best = -1, bestCount = Infinity;
    for (let g = 0; g < n; g++) {
      if (usedRegions & (1 << g)) continue;
      let count = 0;
      for (const i of byRegion[g]) if (open(i)) count++;
      if (count < bestCount) {
        best = g;
        bestCount = count;
        if (count <= 1) break;
      }
    }
    if (bestCount === 0) return false;
    for (const i of byRegion[best]) {
      if (!open(i)) continue;
      const r = (i / n) | 0, c = i % n;
      usedRows |= 1 << r;
      usedCols |= 1 << c;
      usedRegions |= 1 << best;
      mark(i, 1);
      cols[r] = c;
      const done = go(placed + 1);
      mark(i, -1);
      usedRows &= ~(1 << r);
      usedCols &= ~(1 << c);
      usedRegions &= ~(1 << best);
      if (done) return true;
    }
    return false;
  };

  go(0);
  return out;
}

export function countSolutions(size: number, regions: ArrayLike<number>, limit = 2): number {
  return solve(size, regions, limit).length;
}
