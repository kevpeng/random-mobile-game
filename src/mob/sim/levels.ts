import { mulberry32 } from '../../shared/rng';

// Treadmill shooter: your gun stays put at the bottom while the ground rolls
// toward you like a belt. Mob waves and gun gates ride it in on their own,
// independent schedules. Steer the gun into a gate as it arrives to change it:
// ×/÷ change bullets per shot, +/− change fire rate.

export type GateKind = 'mul' | 'add' | 'div' | 'sub';

export interface GateSpec {
  /** Seconds after the start that it appears at the far end. */
  t: number;
  kind: GateKind;
  n: number;
  /** Lane span, within [-1, 1]. */
  x0: number;
  x1: number;
}

export interface WaveSpec {
  /** Seconds after the start. */
  t: number;
  count: number;
  /** Hit points per mob (brutes > 1). */
  hp: number;
  /** Seconds over which the wave trickles in. */
  over: number;
}

export interface LevelSpec {
  /** Depth of the lane (mobs and gates appear at the far end). */
  length: number;
  gates: GateSpec[];
  /** Empty in endless mode (waves come from endlessWave). */
  waves: WaveSpec[];
  endless?: boolean;
}

export const isGood = (k: GateKind) => k === 'mul' || k === 'add';
export const gateLabel = (k: GateKind, n: number) =>
  k === 'mul' ? `×${n}` : k === 'add' ? `+${n}` : k === 'div' ? `÷${n}` : `−${n}`;
/** What a gate changes: ×/÷ bullets per shot, +/− fire rate. */
export const gateCaption = (k: GateKind) => (k === 'mul' || k === 'div' ? 'bullets' : 'fire rate');

export interface Gun {
  perShot: number;
  fireRate: number;
}
export const MAX_PER_SHOT = 200;
export const MIN_FIRE = 1.5;
export const MAX_FIRE = 16;
/** Shots per second a "+1" gate adds. */
export const FIRE_STEP = 0.5;

/** The gun after taking a gate. */
export function applyGate(g: Gun, gate: { kind: GateKind; n: number }): Gun {
  switch (gate.kind) {
    case 'mul':
      return { ...g, perShot: Math.min(MAX_PER_SHOT, g.perShot * gate.n) };
    case 'div':
      return { ...g, perShot: Math.max(1, Math.ceil(g.perShot / gate.n)) };
    case 'add':
      return { ...g, fireRate: Math.min(MAX_FIRE, g.fireRate + gate.n * FIRE_STEP) };
    case 'sub':
      return { ...g, fireRate: Math.max(MIN_FIRE, g.fireRate - gate.n * FIRE_STEP) };
  }
}

/** Bullets per second: what a gate is really worth. */
export const firepower = (g: Gun) => g.perShot * g.fireRate;

export const LENGTH = 16;

/**
 * Gates for a level: one every few seconds at a random spot, some good, some
 * bad, on their own clock (they don't line up with the waves).
 */
export function levelGates(rand: () => number, n: number, seconds: number, first = 2): GateSpec[] {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const gates: GateSpec[] = [];
  // Even odds: standing still averages out; steering into the good ones is what pays.
  const goodOdds = n < 3 ? 0.65 : 0.5;
  for (let t = first; t < seconds; t += 2.4 + rand() * 2) {
    const good = rand() < goodOdds;
    const kind: GateKind = good ? (rand() < 0.4 ? 'mul' : 'add') : rand() < 0.5 ? 'div' : 'sub';
    const num = kind === 'mul' ? (rand() < 0.2 ? 3 : 2) : kind === 'div' ? 2 : pick([1, 2, 2, 3, 4]);
    const w = rand() < 0.6 ? 1 : 2 / 3; // half or a third of the lane
    const x0 = -1 + rand() * (2 - w);
    gates.push({ t, kind, n: num, x0, x1: x0 + w });
  }
  return gates;
}

/**
 * Mob waves for level n: a burst every 6 s, bigger each level, with brutes
 * (big hp) every 12 s from level 3 on. `bursts` waves in all.
 */
export function levelWaves(n: number, bursts: number): WaveSpec[] {
  const waves: WaveSpec[] = [];
  // Each wave is bigger than the last: later ones need the firepower good gates give.
  // The first wave is small on every level (the gun starts weak); the ramp is what gets steeper.
  const burst = (k: number) => Math.round((5 + 0.3 * n) * (1 + (0.4 + 0.08 * n) * k));
  for (let k = 0; k < bursts; k++) waves.push({ t: 4 + k * 6, count: burst(k), hp: 1, over: 1.6 });
  if (n >= 3) {
    for (let k = 1; k < bursts; k += 2) waves.push({ t: 4 + k * 6 + 3, count: 1 + Math.floor(n / 5), hp: 5 + 2 * n, over: 0.6 });
  }
  return waves.sort((a, b) => a.t - b.t);
}

export const wavesFor = (n: number) => Math.min(14, 5 + Math.floor(n / 2));

/** Level `n` (1-based). */
export function levelSpec(n: number): LevelSpec {
  if (n === 1) {
    // Gentle start: good gates first so you learn to steer into them.
    return {
      length: LENGTH,
      waves: levelWaves(1, 5),
      gates: [
        { t: 1, kind: 'mul', n: 2, x0: -1, x1: 0 },
        { t: 5, kind: 'add', n: 2, x0: 0, x1: 1 },
        { t: 9, kind: 'div', n: 2, x0: -0.5, x1: 0.5 },
        { t: 13, kind: 'mul', n: 2, x0: 0, x1: 1 },
        { t: 18, kind: 'sub', n: 2, x0: -1, x1: 0 },
        { t: 22, kind: 'add', n: 3, x0: -1, x1: 0 },
      ],
    };
  }
  return generateLevel(n, n * 7919);
}

export function generateLevel(n: number, seed: number): LevelSpec {
  const rand = mulberry32(seed);
  const waves = levelWaves(n, wavesFor(n));
  const end = waves[waves.length - 1].t;
  return { length: LENGTH, waves, gates: levelGates(rand, n, end) };
}

/** Endless: waves come from endlessWave, gates from endlessGates (both unending). */
export function endlessSpec(): LevelSpec {
  return { length: LENGTH, waves: [], gates: [], endless: true };
}

/** Endless wave `w` (0-based), starting at time 3 + 7w, ever larger. */
export function endlessWave(w: number): WaveSpec {
  const big = w % 4 === 3;
  return {
    t: 3 + w * 7,
    count: big ? 3 + Math.floor(w / 2) : 10 + w * 4,
    hp: big ? 6 + Math.floor(w / 2) : 1,
    over: big ? 2 : 4,
  };
}

/** Endless gates for the minute starting at `t0`. */
export function endlessGates(seed: number, minute: number): GateSpec[] {
  const t0 = minute * 60;
  return levelGates(mulberry32(seed * 31 + minute * 7919), 3 + minute * 4, t0 + 60, t0 + 1).filter((g) => g.t >= t0);
}
