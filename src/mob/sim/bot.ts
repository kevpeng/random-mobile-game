import { applyGate, firepower } from './levels';
import { BELT_SPEED, CANNON_Z, World } from './world';

/** Seconds ahead the bot looks for gates. */
const LOOKAHEAD = 1.6;
/** Lane widths per second the gun can cover (it glides, so this is conservative). */
const REACH_SPEED = 2.5;

/**
 * A simple policy used to check levels are winnable: steer into the most
 * valuable gate that will reach the gun soon (and can be reached in time),
 * dodge bad ones; otherwise aim at the thickest bunch of mobs.
 */
export function botSteer(w: World): void {
  const line = CANNON_Z + 0.15;
  let best: { x: number; value: number } | null = null;
  const bad: { x0: number; x1: number }[] = [];
  const now = firepower(w);
  for (const g of w.gates) {
    if (g.taken || g.cool > 0 || g.z < line) continue;
    const eta = (g.z - line) / BELT_SPEED;
    if (eta > LOOKAHEAD) continue;
    const value = firepower(applyGate(w, g)) - now;
    if (value <= 0) {
      if (eta < 0.8) bad.push(g);
      continue;
    }
    const x = Math.max(g.x0 + 0.08, Math.min(g.x1 - 0.08, w.cannonX));
    if (Math.abs(x - w.cannonX) > REACH_SPEED * eta + 0.05) continue;
    if (!best || value > best.value) best = { x, value };
  }
  let x = best ? best.x : mobColumn(w);
  // Stay out of bad gates about to arrive.
  for (const b of bad) {
    if (x < b.x0 - 0.05 || x > b.x1 + 0.05) continue;
    // Step out past the nearer edge that's still on the lane.
    const sides = [b.x0 - 0.12, b.x1 + 0.12].filter((s) => s >= -0.95 && s <= 0.95);
    if (sides.length) x = sides.reduce((a, s) => (Math.abs(s - x) < Math.abs(a - x) ? s : a));
  }
  w.targetX = Math.max(-0.95, Math.min(0.95, x));
}

/** Lane position with the most mob hit points close in. */
function mobColumn(w: World): number {
  const bins = new Float32Array(9);
  const e = w.enemies;
  for (let i = 0; i < e.n; i++) {
    if (e.z[i] > w.length * 0.7) continue;
    const b = Math.min(8, Math.max(0, Math.floor(((e.x[i] + 1) / 2) * 9)));
    bins[b] += e.hp[i] * (1 + (w.length - e.z[i]) / w.length);
  }
  let top = 4;
  for (let b = 0; b < 9; b++) if (bins[b] > bins[top]) top = b;
  return bins[top] > 0 ? -1 + ((top + 0.5) * 2) / 9 : w.cannonX;
}

/** Plays a level headlessly with the bot; returns the outcome. */
export function playLevel(w: World, maxSeconds = 180): World {
  for (let s = 0; s < maxSeconds * 60 && w.state === 'playing'; s++) {
    if (s % 6 === 0) botSteer(w);
    w.step();
  }
  return w;
}
