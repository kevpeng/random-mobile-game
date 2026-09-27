import { bestLine, type GateRowSpec, type SquadSpec } from './levels';
import { CROWD_Z, World } from './world';

/**
 * The next choice ahead of the crowd: squads still to come before the next
 * gate row, and that row (or, after the last row, the squads before the base).
 */
export function nextSegment(w: World): { squads: SquadSpec[]; row?: GateRowSpec } {
  const rows = new Map<number, GateRowSpec>();
  for (const g of w.gates) {
    if (g.passed) continue;
    const r = rows.get(g.row) ?? { z: g.z, panels: [] };
    r.panels.push({ kind: g.kind, n: g.n, x0: g.x0, x1: g.x1 });
    rows.set(g.row, r);
  }
  const row = [...rows.values()].sort((a, b) => a.z - b.z)[0];
  const upTo = row ? row.z : Infinity;
  const squads = w.squads
    .filter((s) => !s.done && s.z + s.depth >= CROWD_Z - 0.2 && s.z < upTo)
    .map((s) => ({ z: s.z, x: s.x, half: s.half, count: s.left, hp: 1 }));
  return { squads, row };
}

/** Steers for the most troops through the next segment (optimal: every effect is monotone in troops). */
export function botSteer(w: World): void {
  const { squads, row } = nextSegment(w);
  w.targetX = bestLine(w.troops, squads, row).x;
}

/** Plays a level headlessly with the bot; returns the outcome. */
export function playLevel(w: World, maxSeconds = 180): World {
  for (let s = 0; s < maxSeconds * 60 && w.state === 'playing'; s++) {
    if (s % 6 === 0) botSteer(w);
    w.step();
  }
  return w;
}
