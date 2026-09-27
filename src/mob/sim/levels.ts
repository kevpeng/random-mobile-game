import { mulberry32 } from '../../shared/rng';

// Crowd runner: your crowd runs up a lane (the track scrolls toward you).
// Gates and enemy squads sit at fixed distances along the track; each gate
// row changes your troop count by the panel you run through, each squad you
// run into costs troops 1:1, and at the end the crowd charges the base.

export type GateKind = 'mul' | 'add' | 'div' | 'sub';

export interface PanelSpec {
  x0: number; // lane span, within [-1, 1]
  x1: number;
  kind: GateKind;
  n: number;
}

export interface GateRowSpec {
  /** Distance along the track. */
  z: number;
  panels: PanelSpec[];
}

export interface SquadSpec {
  /** Distance along the track. */
  z: number;
  /** Lane centre and half-width it blocks (half ≥ 1 blocks the whole lane). */
  x: number;
  half: number;
  /** Enemies in the squad. */
  count: number;
  /** Hit points per enemy (brutes > 1). */
  hp: number;
}

export interface LevelSpec {
  /** Distance to the base (Infinity in endless mode). */
  length: number;
  towerHp: number;
  gates: GateRowSpec[];
  squads: SquadSpec[];
}

export const isGood = (k: GateKind) => k === 'mul' || k === 'add';
export const gateLabel = (k: GateKind, n: number) =>
  k === 'mul' ? `×${n}` : k === 'add' ? `+${n}` : k === 'div' ? `÷${n}` : `−${n}`;

/** Troops after running through a gate panel. */
export function applyPanel(troops: number, p: { kind: GateKind; n: number }): number {
  switch (p.kind) {
    case 'mul':
      return troops * p.n;
    case 'add':
      return troops + p.n;
    case 'sub':
      return Math.max(0, troops - p.n);
    case 'div':
      return Math.floor(troops / p.n);
  }
}

/** Crowd formation spacing (world units) and the most troops drawn (the count can go far higher). */
export const CROWD_SPACING = 0.062;
export const CROWD_SHOWN = 220;

/** Half-width (lane units) of a crowd of `troops`, as laid out on screen (the lane is 1.9 units per side). */
export const crowdHalf = (troops: number) => 0.04 + (CROWD_SPACING * Math.sqrt(Math.min(troops, CROWD_SHOWN))) / 1.9;

/** Whether a crowd centred at x runs into squad s. */
export const hitsSquad = (x: number, troops: number, s: { x: number; half: number }) =>
  Math.abs(x - s.x) < s.half + crowdHalf(troops);

/** Lane positions worth considering when choosing a line (none sits exactly on a panel edge). */
export const LINES = Array.from({ length: 24 }, (_, k) => -0.92 + ((k + 0.5) * 1.84) / 24);

/**
 * Troops left after holding lane position x through `squads` and then `row`
 * (either may be empty). -1 if the crowd is wiped out.
 */
export function throughSegment(troops: number, x: number, squads: SquadSpec[], row?: GateRowSpec): number {
  let t = troops;
  for (const s of squads) {
    if (!hitsSquad(x, t, s)) continue;
    t -= s.count * s.hp;
    if (t <= 0) return -1;
  }
  if (row) {
    const p = row.panels.find((p) => x >= p.x0 && x <= p.x1);
    if (p) t = applyPanel(t, p);
  }
  return t <= 0 ? -1 : t;
}

/** Best line through a segment: every effect is monotone in troops, so maximising now is optimal. */
export function bestLine(troops: number, squads: SquadSpec[], row?: GateRowSpec): { x: number; troops: number } {
  let best = { x: 0, troops: -Infinity };
  for (const x of LINES) {
    const t = throughSegment(troops, x, squads, row);
    if (t > best.troops + 1e-9 || (Math.abs(t - best.troops) < 1e-9 && Math.abs(x) < Math.abs(best.x))) best = { x, troops: t };
  }
  return best;
}

/** Troops a perfect run reaches the base with (-1 if the level can't be survived). */
export function bestFinish(spec: LevelSpec, start: number): number {
  let t = start;
  const rows = [...spec.gates].sort((a, b) => a.z - b.z);
  const squads = [...spec.squads].sort((a, b) => a.z - b.z);
  let si = 0;
  for (const row of [...rows, undefined]) {
    const upTo = row ? row.z : Infinity;
    const seg: SquadSpec[] = [];
    while (si < squads.length && squads[si].z < upTo) seg.push(squads[si++]);
    t = bestLine(t, seg, row).troops;
    if (t <= 0) return -1;
  }
  return t;
}

export const START_TROOPS = 10;
/** Share of a perfect run's troops the base needs to fall (leaves room for mistakes). */
const TOWER_SHARE = 0.6;

const halves = (a: PanelSpec, b: PanelSpec): PanelSpec[] => [
  { ...a, x0: -1, x1: 0 },
  { ...b, x0: 0, x1: 1 },
];
const P = (kind: GateKind, n: number): PanelSpec => ({ kind, n, x0: 0, x1: 0 });
const wall = (z: number, count: number, hp = 1): SquadSpec => ({ z, x: 0, half: 1.2, count, hp });

function finish(length: number, gates: GateRowSpec[], squads: SquadSpec[]): LevelSpec {
  const spec = { length, gates, squads, towerHp: 0 };
  spec.towerHp = Math.max(8, Math.round(bestFinish(spec, START_TROOPS) * TOWER_SHARE));
  return spec;
}

/** Hand-tuned opening levels (1-based index = level number). */
const HANDMADE: LevelSpec[] = [
  // 1: ×2 beats +3; then dodge the −
  finish(34, [
    { z: 10, panels: halves(P('mul', 2), P('add', 3)) },
    { z: 18, panels: halves(P('add', 10), P('sub', 10)) },
  ], [wall(25, 8)]),
  // 2: first ÷, and a squad guarding the best gate
  finish(44, [
    { z: 10, panels: halves(P('add', 5), P('div', 2)) },
    { z: 19, panels: halves(P('sub', 10), P('mul', 2)) },
    { z: 28, panels: halves(P('mul', 3), P('add', 15)) },
  ], [wall(15, 6), { z: 25, x: -0.5, half: 0.5, count: 12, hp: 1 }, wall(35, 15)]),
];

/** Level `n` (1-based): hand-made first, then procedurally generated. */
export function levelSpec(n: number): LevelSpec {
  if (n <= HANDMADE.length) return HANDMADE[n - 1];
  return generateLevel(n, n * 7919);
}

interface Chunk {
  gates: GateRowSpec[];
  squads: SquadSpec[];
}

/**
 * One stretch of track starting at `z0`: a squad, then a gate row (sometimes
 * with a squad guarding its best panel). `troops` is what a strong run would
 * have here; squad sizes scale with it (by `pressure`) so every stretch bites.
 */
function chunk(rand: () => number, z0: number, troops: number, pressure: number, n: number): Chunk & { troops: number } {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const mulN = () => (rand() < Math.min(0.35, 0.05 * n) ? 3 : 2);
  const addN = () => pick([5, 8, 10, 15, 20]) + Math.floor(n / 2) * 5;
  const good = (): PanelSpec => (rand() < 0.5 ? P('mul', mulN()) : P('add', addN()));
  const bad = (): PanelSpec => (rand() < 0.45 ? P('div', 2) : P('sub', pick([5, 10, 15, 20]) + n * 2));
  const squads: SquadSpec[] = [];
  let t = troops;

  const wallCount = Math.max(3, Math.round(t * pressure * (0.7 + rand() * 0.6)));
  if (rand() < 0.3 + 0.03 * n) {
    // A brute squad: fewer, tougher enemies.
    const hp = 3 + Math.floor(n / 3);
    squads.push(wall(z0, Math.max(1, Math.floor(wallCount / hp)), hp));
  } else squads.push(wall(z0, wallCount));
  t = bestLine(t, squads).troops;

  const z = z0 + 5;
  let panels: PanelSpec[];
  const layout = rand();
  if (layout < 0.55) panels = rand() < 0.5 ? halves(good(), bad()) : halves(bad(), good());
  else if (layout < 0.8) panels = halves(good(), good());
  else {
    const ps = [good(), bad(), good()];
    panels = ps.map((p, i) => ({ ...p, x0: -1 + (i * 2) / 3, x1: -1 + ((i + 1) * 2) / 3 }));
  }
  const row = { z, panels };
  const guard: SquadSpec[] = [];
  if (n >= 3 && rand() < 0.45) {
    // Guard the best panel: worth fighting for, or dodge to the next best.
    const top = bestLine(t, [], row);
    const p = panels.find((p) => top.x >= p.x0 && top.x <= p.x1)!;
    guard.push({ z: z - 1.6, x: (p.x0 + p.x1) / 2, half: (p.x1 - p.x0) / 2 - 0.08, count: Math.max(3, Math.round(t * pressure * 0.8)), hp: 1 });
  }
  squads.push(...guard);
  // The crowd holds one line through the whole stretch (wall, guard and row).
  t = bestLine(troops, squads, row).troops;
  return { gates: [row], squads, troops: t };
}

export function generateLevel(n: number, seed: number): LevelSpec {
  // Rarely a layout can't be survived even with perfect play; deal another.
  for (let k = 0; ; k++) {
    const spec = layLevel(n, seed + k * 104729);
    if (bestFinish(spec, START_TROOPS) > spec.towerHp) return spec;
  }
}

function layLevel(n: number, seed: number): LevelSpec {
  const rand = mulberry32(seed);
  const stretches = 3 + Math.min(4, Math.floor(n / 3));
  // Below ~0.5 the right choices (×2) still grow the crowd each stretch.
  const pressure = Math.min(0.45, 0.25 + 0.015 * n);
  const gates: GateRowSpec[] = [];
  const squads: SquadSpec[] = [];
  let t = START_TROOPS;
  let z = 10;
  // Open with a free gate row so there's something to spend on the first squad.
  gates.push({ z: 8, panels: halves(P('add', 5 + n), P('mul', 2)) });
  t = bestLine(t, [], gates[0]).troops;
  for (let k = 0; k < stretches; k++) {
    z += 4;
    const c = chunk(rand, z, t, pressure, n);
    gates.push(...c.gates);
    squads.push(...c.squads);
    t = c.troops;
    z += 5;
  }
  squads.push(wall(z + 5, Math.max(4, Math.round(t * pressure * 0.6))));
  return finish(z + 13, gates, squads);
}

/**
 * Endless mode: stretches keep coming, with squads that grow relative to the
 * crowd the longer you last. `k` is the stretch number; `troops` your current count.
 */
export function endlessChunk(seed: number, k: number, z0: number, troops: number): Chunk {
  const rand = mulberry32(seed * 31 + k * 7919);
  const pressure = Math.min(0.9, 0.3 + 0.04 * k); // past ~0.5 the crowd can't keep up
  const c = chunk(rand, z0, Math.max(troops, 10 + 6 * k), pressure, 3 + Math.floor(k / 2));
  return { gates: c.gates, squads: c.squads };
}

/** Track length of one endless stretch. */
export const ENDLESS_STRETCH = 9;

export function endlessSpec(): LevelSpec {
  return {
    length: Infinity,
    towerHp: Infinity,
    gates: [{ z: 8, panels: halves(P('add', 10), P('mul', 2)) }],
    squads: [],
  };
}
