import { columnMultiplier, gateShift, type GateRowSpec } from './levels';
import { CANNON_Z, TOWER_HALF, UNIT_SPEED, World } from './world';

/** Rough delay (s) between setting targetX and the cannon getting there. */
const CANNON_LAG = 0.08;
/** Units fired outside the tower footprint still fight, but never hit the tower. */
const OFF_TOWER = 0.3;

/**
 * Gate rows as a shot fired now would meet them: each row where it will be
 * when the shot reaches it (gates move; units fly straight).
 */
export function predictedRows(w: World, lead = CANNON_LAG): GateRowSpec[] {
  const rows = new Map<number, GateRowSpec>();
  for (const g of w.gates) {
    if (g.broken) continue;
    // Arrival time at the row: start from its current depth, refine once for its drift.
    let t = w.time + lead + (g.z - CANNON_Z) / UNIT_SPEED;
    let s = gateShift(g.move, t);
    t = w.time + lead + (g.bz + s.dz - CANNON_Z) / UNIT_SPEED;
    s = gateShift(g.move, t);
    const r = rows.get(g.row) ?? { z: g.bz + s.dz, panels: [] };
    r.panels.push({ kind: g.kind, n: g.n, x0: g.bx0 + s.dx, x1: g.bx1 + s.dx });
    rows.set(g.row, r);
  }
  return [...rows.values()];
}

/**
 * A simple steering policy used to check that levels are winnable: aim the
 * straight-line column that gets the most units through the gates as they
 * will be when the shot arrives, preferring columns that then go on to hit
 * the tower (units can't turn after they're fired).
 */
export function botSteer(w: World): void {
  const rows = predictedRows(w);
  const N = 48;
  const xs: number[] = [];
  const scores: number[] = [];
  for (let k = 0; k <= N; k++) {
    const x = -0.95 + (k * 1.9) / N;
    const onTower = w.endless || Math.abs(x) <= TOWER_HALF - 0.06;
    xs.push(x);
    scores.push(columnMultiplier(rows, x) * (onTower ? 1 : OFF_TOWER));
  }
  const top = Math.max(...scores);
  // Aim at the middle of the widest run of best columns: the safest spot
  // while the gates slide (ties go to the run nearest the centre).
  let best = { x: 0, len: -1 };
  for (let k = 0; k <= N; ) {
    if (scores[k] < top - 1e-9) {
      k++;
      continue;
    }
    let e = k;
    while (e + 1 <= N && scores[e + 1] >= top - 1e-9) e++;
    const x = (xs[k] + xs[e]) / 2;
    const len = e - k;
    if (len > best.len || (len === best.len && Math.abs(x) < Math.abs(best.x))) best = { x, len };
    k = e + 1;
  }
  w.targetX = best.x;
}

/** Plays a level headlessly with the bot; returns the outcome. */
export function playLevel(w: World, maxSeconds = 180): World {
  for (let s = 0; s < maxSeconds * 60 && w.state === 'playing'; s++) {
    if (s % 6 === 0) botSteer(w);
    w.step();
  }
  return w;
}
