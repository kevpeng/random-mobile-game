import { mulberry32 } from '../../shared/rng';

export type GateKind = 'mul' | 'add' | 'div' | 'sub';

export interface PanelSpec {
  x0: number; // lane span, within [-1, 1]
  x1: number;
  kind: GateKind;
  n: number;
}

export interface GateRowSpec {
  z: number;
  panels: PanelSpec[];
  /** Optional motion: the whole row slides sideways (and drifts toward the cannon) over time. */
  move?: GateMotion;
}

/**
 * How a gate row moves. Positions are a pure function of sim time and these
 * params (see gateShift), so seeded runs stay reproducible.
 */
export interface GateMotion {
  /** Sideways amplitude, in lane half-widths. */
  ax: number;
  /** How far the row drifts toward the cannon at the near end of its cycle (z units). */
  az: number;
  /** Seconds per side-to-side cycle. */
  period: number;
  /** Radians. */
  phase: number;
}

/** Offset of a moving row at sim time `t`: dx across the lane, dz along it (≤ 0, toward the cannon). */
export function gateShift(m: GateMotion | undefined, t: number): { dx: number; dz: number } {
  if (!m) return { dx: 0, dz: 0 };
  const a = (2 * Math.PI * t) / m.period + m.phase;
  // The drift runs on a slower cycle than the sway, so the pattern doesn't repeat every sweep.
  const b = (2 * Math.PI * t) / (m.period * 1.5) + m.phase;
  return { dx: m.ax * Math.sin(a), dz: -m.az * (0.5 - 0.5 * Math.cos(b)) };
}

/**
 * Motion for gate row `r` on level `n`: none on level 1, then gently wider,
 * faster and deeper with each level (capped).
 */
export function levelMotion(n: number, r: number): GateMotion | undefined {
  if (n < 2) return undefined;
  const k = n - 2;
  return {
    ax: Math.min(0.4, 0.06 + 0.025 * k),
    az: Math.min(0.8, 0.06 * k),
    period: Math.max(3.6, 7 - 0.25 * k),
    phase: ((r * 2.4 + n * 0.9) % (2 * Math.PI)),
  };
}

/**
 * Gives each row its level motion, narrowing the panels so the row stays
 * inside the lane over its whole sweep (the uncovered edge is a gate-free gap).
 */
export function withMotion(n: number, rows: GateRowSpec[]): GateRowSpec[] {
  return rows.map((row, r) => {
    const move = levelMotion(n, r);
    if (!move) return row;
    const s = 1 - move.ax;
    return { ...row, move, panels: row.panels.map((p) => ({ ...p, x0: p.x0 * s, x1: p.x1 * s })) };
  });
}

export interface WaveSpec {
  /** Seconds after the level starts. */
  t: number;
  count: number;
  /** Hit points per enemy (big enemies > 1). */
  hp: number;
  /** Seconds over which the wave trickles in. */
  over: number;
}

export interface LevelSpec {
  length: number; // z of the enemy tower
  towerHp: number;
  gates: GateRowSpec[];
  waves: WaveSpec[];
}

export const isGood = (k: GateKind) => k === 'mul' || k === 'add';
export const gateLabel = (k: GateKind, n: number) =>
  k === 'mul' ? `×${n}` : k === 'add' ? `+${n}` : k === 'div' ? `÷${n}` : `−${n}`;

const halves = (a: PanelSpec, b: PanelSpec): PanelSpec[] => [
  { ...a, x0: -1, x1: 0 },
  { ...b, x0: 0, x1: 1 },
];
const full = (p: Omit<PanelSpec, 'x0' | 'x1'>): PanelSpec[] => [{ ...p, x0: -1, x1: 1 }];
const P = (kind: GateKind, n: number) => ({ kind, n, x0: 0, x1: 0 });

/**
 * Output multiplier for a straight shot at lane position `x` (units don't turn
 * after they're fired). + gates add a flat number of units per second, worth
 * less as the stream grows.
 */
export function columnMultiplier(rows: GateRowSpec[], x: number, baseRate = 4): number {
  let mult = 1;
  for (const r of [...rows].sort((a, b) => a.z - b.z)) {
    const p = r.panels.find((p) => x >= p.x0 && x <= p.x1);
    if (!p) continue;
    mult *= p.kind === 'mul' ? p.n : p.kind === 'add' ? 1 + p.n / (baseRate * mult) : p.kind === 'div' ? 1 / p.n : 0.8;
  }
  return mult;
}

/** The best straight-line column through a layout: its lane position and multiplier. */
export function bestColumn(rows: GateRowSpec[]): { x: number; mult: number } {
  let best = { x: 0, mult: -1 };
  for (let k = 0; k <= 40; k++) {
    const x = -0.95 + (k * 1.9) / 40;
    const mult = columnMultiplier(rows, x);
    // Prefer the column nearest the centre of its panels on ties.
    if (mult > best.mult + 1e-9 || (Math.abs(mult - best.mult) < 1e-9 && Math.abs(x) < Math.abs(best.x))) best = { x, mult };
  }
  return best;
}

export const bestMultiplier = (rows: GateRowSpec[]) => bestColumn(rows).mult;

/**
 * Enemy pressure for level n: the tower releases a burst every 6 s (bigger each
 * level), with brutes (big hp) every 12 s from level 3 on. Between bursts your
 * surplus gets through to the tower. `power` (the layout's best multiplier)
 * scales it so every layout is a fight. Levels last until the tower falls.
 */
export function levelWaves(n: number, power = 2, minutes = 5): WaveSpec[] {
  const scale = Math.pow(power / 2, 0.7);
  const secs = minutes * 60;
  const burst = Math.round((7 + 3.2 * (n - 1)) * scale);
  const waves: WaveSpec[] = [];
  for (let t = 3; t < secs; t += 6) waves.push({ t, count: burst, hp: 1, over: 1.6 });
  if (n >= 3) {
    for (let t = 9; t < secs; t += 12) {
      waves.push({ t, count: 1 + Math.floor(n / 5), hp: Math.round((5 + 2.5 * n) * scale), over: 0.6 });
    }
  }
  return waves;
}

/** Tower hit points for level n with a layout of the given power (tuned with the balance bot). */
export const towerHp = (n: number, power = 2) => Math.round(105 * Math.pow(1.2, n - 1) * power);

/** Fills in a level's tower and waves from its gate layout. */
function finish(n: number, length: number, rows: GateRowSpec[]): LevelSpec {
  const gates = withMotion(n, rows);
  const power = bestMultiplier(gates);
  return { length, gates, towerHp: towerHp(n, power), waves: levelWaves(n, power) };
}

/** Hand-tuned opening levels (1-based index = level number). */
const HANDMADE: LevelSpec[] = [
  // 1: learn that ×2 beats +3
  finish(1, 16, [{ z: 5, panels: halves(P('mul', 2), P('add', 3)) }]),
  // 2: first bad gates
  finish(2, 16, [
    { z: 4, panels: halves(P('add', 5), P('div', 2)) },
    { z: 8, panels: halves(P('sub', 10), P('mul', 2)) },
  ]),
  // 3: three-way choice, first brutes
  finish(3, 17, [
    {
      z: 5,
      panels: [
        { kind: 'add', n: 4, x0: -1, x1: -0.33 },
        { kind: 'mul', n: 3, x0: -0.33, x1: 0.33 },
        { kind: 'sub', n: 8, x0: 0.33, x1: 1 },
      ],
    },
    { z: 10, panels: halves(P('mul', 2), P('add', 10)) },
  ]),
];

/** Level `n` (1-based): hand-made first, then procedurally generated. */
export function levelSpec(n: number): LevelSpec {
  if (n <= HANDMADE.length) return HANDMADE[n - 1];
  return generateLevel(n, n * 7919);
}

export function generateLevel(n: number, seed: number): LevelSpec {
  const rand = mulberry32(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const length = 17 + Math.min(5, Math.floor(n / 4));
  const rows = 2 + Math.min(2, Math.floor(n / 5));
  const gates: GateRowSpec[] = [];
  for (let r = 0; r < rows; r++) {
    const z = 3.5 + (r * (length - 8)) / rows;
    const good = (): PanelSpec => (rand() < 0.55 ? P('mul', pick([2, 2, 3])) : P('add', pick([5, 8, 10, 15])));
    const bad = (): PanelSpec => (rand() < 0.5 ? P('div', 2) : P('sub', pick([5, 10, 15])));
    const layout = rand();
    if (layout < 0.55) {
      const [a, b] = rand() < 0.5 ? [good(), bad()] : [bad(), good()];
      gates.push({ z, panels: halves(a, b) });
    } else if (layout < 0.85) {
      gates.push({ z, panels: halves(good(), good()) });
    } else {
      const ps = [good(), bad(), good()];
      gates.push({
        z,
        panels: ps.map((p, i) => ({ ...p, x0: -1 + (i * 2) / 3, x1: -1 + ((i + 1) * 2) / 3 })),
      });
    }
  }
  return finish(n, length, gates);
}

/** Endless mode: a fixed gate layout; waves come from endlessWave(). */
export function endlessSpec(seed: number): LevelSpec {
  const base = generateLevel(8, seed);
  return { ...base, length: 20, towerHp: Infinity, waves: [] };
}

/** Endless wave `w` (0-based), starting at time 3 + 7w, ever larger. */
export function endlessWave(w: number): WaveSpec {
  const big = w % 4 === 3;
  return {
    t: 3 + w * 7,
    count: big ? 3 + Math.floor(w / 2) : 14 + w * 4,
    hp: big ? 6 + Math.floor(w / 2) : 1,
    over: big ? 2 : 4,
  };
}

export { full };
