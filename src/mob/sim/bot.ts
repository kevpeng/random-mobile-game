import { bestColumn, type GateRowSpec } from './levels';
import { World } from './world';

/**
 * A simple steering policy used to check that levels are winnable: aim down
 * the best straight-line column through the gates (units can't turn after
 * they're fired), re-evaluated as − gates break.
 */
export function botSteer(w: World): void {
  const rows = new Map<number, GateRowSpec>();
  for (const g of w.gates) {
    if (g.broken) continue;
    const r = rows.get(g.z) ?? { z: g.z, panels: [] };
    r.panels.push({ kind: g.kind, n: g.n, x0: g.x0, x1: g.x1 });
    rows.set(g.z, r);
  }
  w.targetX = bestColumn([...rows.values()]).x;
}

/** Plays a level headlessly with the bot; returns the outcome. */
export function playLevel(w: World, maxSeconds = 180): World {
  for (let s = 0; s < maxSeconds * 60 && w.state === 'playing'; s++) {
    if (s % 30 === 0) botSteer(w);
    w.step();
  }
  return w;
}
