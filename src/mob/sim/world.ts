import { mulberry32 } from '../../shared/rng';
import {
  applyPanel,
  CROWD_SHOWN,
  CROWD_SPACING,
  crowdHalf,
  ENDLESS_STRETCH,
  endlessChunk,
  hitsSquad,
  type GateKind,
  type LevelSpec,
  type SquadSpec,
} from './levels';
import { Pool } from './pool';

export const STEP = 1 / 60;
/** How fast the track scrolls toward you (world units per second). */
export const RUN_SPEED = 2.4;
/** Screen depth your crowd runs at. */
export const CROWD_Z = 1.3;
/** Depth of track visible ahead (the camera frames 0..VIEW). */
export const VIEW = 15;
/** The crowd stops this far in front of the base and charges it. */
const SIEGE_GAP = 1.6;
/** Most troops drawn at once (the real count can be far higher). */
export const MAX_SHOWN = CROWD_SHOWN;
export const MAX_ENEMIES = 1500;
const MAX_SQUAD_SHOWN = 160;
const SPACING = CROWD_SPACING;
const LANE_W = 1.9;
const STEER = 9;
const RUNNER_SPEED = 4;
/** Runner flag in Pool.gates: a troop charging the base (not part of the formation). */
const RUNNER = 1;

/** Visual & collision radius for a unit with `hp` hit points. */
export const radius = (hp: number) => 0.05 * (1 + 0.45 * Math.log2(Math.max(1, hp)));

export interface Upgrades {
  troops: number; // bigger starting crowd
  rally: number; // recruits join while running
  boost: number; // free ×(1+boost) at the start line
}
export const NO_UPGRADES: Upgrades = { troops: 0, rally: 0, boost: 0 };

export function stats(u: Upgrades) {
  return {
    start: 10 + 5 * u.troops,
    rallyPerSec: 0.6 * u.rally,
  };
}

export interface Gate {
  id: number;
  /** Row this panel belongs to (panels in a row pass together). */
  row: number;
  /** Distance along the track. */
  d: number;
  /** Screen depth (d − distance run). */
  z: number;
  x0: number;
  x1: number;
  kind: GateKind;
  n: number;
  /** True once its row has gone past the crowd. */
  passed: boolean;
  /** The panel the crowd ran through. */
  taken: boolean;
  /** Visual: seconds since triggered. */
  flash: number;
  /** Visual: > 0 dims the panel (rows already passed, panels not taken). */
  cool: number;
  /** (unused; gates never break) */
  broken: boolean;
}

export interface Squad {
  id: number;
  d: number;
  z: number;
  x: number;
  half: number;
  hp: number;
  /** Hit points left (count × hp at the start). */
  left: number;
  /** Depth of its formation on screen. */
  depth: number;
  done: boolean;
}

export type MobEvent =
  | { type: 'gate'; gate: number; gain: number; x: number; z: number }
  | { type: 'kill'; x: number; z: number; big: boolean }
  | { type: 'tower'; dmg: number }
  | { type: 'fight'; squad: number };

export class World {
  /** Your troops as drawn: the formation (capped) plus runners charging the base. */
  readonly players = new Pool(MAX_SHOWN + 200);
  /** Enemy squads as drawn. */
  readonly enemies = new Pool(MAX_ENEMIES);
  readonly gates: Gate[] = [];
  readonly squads: Squad[] = [];
  /** Visible depth: the camera frames the lane from here to the crowd. */
  readonly length = VIEW;
  /** Distance to the base along the track. */
  readonly trackLength: number;
  readonly endless: boolean;
  readonly towerMax: number;
  towerHp: number;
  /** Screen depth of the base. */
  towerZ = Infinity;
  /** Your troop count: every gate and fight changes this. */
  troops: number;
  /** Crowd centre across the lane, and where the finger wants it. */
  crowdX = 0;
  targetX = 0;
  /** Distance run. */
  scroll = 0;
  time = 0;
  kills = 0;
  phase: 'run' | 'fight' | 'siege' = 'run';
  state: 'playing' | 'won' | 'lost' = 'playing';
  events: MobEvent[] = [];
  /** Visual: seconds since the base was last hit. */
  towerFlash = 9;

  private rand: () => number;
  private stats: ReturnType<typeof stats>;
  private rallyAcc = 0;
  private tradeAcc = 0;
  private chargeAcc = 0;
  private fighting: Squad | null = null;
  private seed: number;
  private nextStretch = 0;
  private stretchZ = 14;
  private rowCount = 0;
  private gateIds = 0;

  constructor(spec: LevelSpec, upgrades: Upgrades = NO_UPGRADES, seed = 1) {
    this.seed = seed;
    this.rand = mulberry32(seed);
    this.stats = stats({ ...NO_UPGRADES, ...upgrades });
    this.endless = !Number.isFinite(spec.length);
    this.trackLength = spec.length;
    this.towerMax = this.towerHp = spec.towerHp;
    this.troops = this.stats.start;
    const rows = [...spec.gates];
    if (upgrades.boost > 0) rows.unshift({ z: 4, panels: [{ kind: 'mul', n: 1 + upgrades.boost, x0: -1, x1: 1 }] });
    for (const r of rows) this.addRow(r.z, r.panels);
    for (const s of spec.squads) this.addSquad(s);
    this.place();
    this.layout(0);
  }

  private addRow(d: number, panels: { kind: GateKind; n: number; x0: number; x1: number }[]): void {
    const row = this.rowCount++;
    for (const p of panels) {
      this.gates.push({ id: this.gateIds++, row, d, z: d, x0: p.x0, x1: p.x1, kind: p.kind, n: p.n, passed: false, taken: false, flash: 9, cool: 0, broken: false });
    }
  }

  private addSquad(s: SquadSpec): void {
    this.squads.push({ id: this.squads.length, d: s.z, z: s.z, x: s.x, half: Math.min(s.half, 1.2), hp: s.hp, left: s.count * s.hp, depth: 0, done: false });
  }

  private emit(e: MobEvent): void {
    if (this.events.length > 2000) this.events.length = 0; // nobody is draining (headless)
    this.events.push(e);
  }

  /** Advances the simulation by one fixed step. */
  step(dt = STEP): void {
    if (this.state !== 'playing') return;
    this.time += dt;
    this.towerFlash += dt;
    for (const g of this.gates) g.flash += dt;
    this.crowdX += (this.targetX - this.crowdX) * Math.min(1, dt * STEER);
    if (this.endless) this.extendTrack();

    if (this.phase === 'run') this.run(dt);
    else if (this.phase === 'fight') this.fight(dt);
    else this.siege(dt);

    if (this.troops <= 0 && this.state === 'playing' && !(this.phase === 'siege' && this.runners() > 0)) {
      this.troops = 0;
      this.state = 'lost';
    }
    this.layout(dt);
  }

  private run(dt: number): void {
    const before = new Map(this.gates.map((g) => [g.id, g.z]));
    this.scroll += RUN_SPEED * dt;
    if (!this.endless && this.trackLength - this.scroll <= CROWD_Z + SIEGE_GAP) {
      this.scroll = this.trackLength - CROWD_Z - SIEGE_GAP;
      this.phase = 'siege';
    }
    this.place();

    // Rows reaching the crowd: the panel under the crowd's centre applies.
    for (const g of this.gates) {
      if (g.passed || before.get(g.id)! <= CROWD_Z || g.z > CROWD_Z) continue;
      const row = this.gates.filter((o) => o.row === g.row);
      const hit = row.find((o) => this.crowdX >= o.x0 && this.crowdX <= o.x1);
      for (const o of row) {
        o.passed = true;
        o.cool = o === hit ? 0 : 1;
      }
      if (hit) {
        const next = applyPanel(this.troops, hit);
        hit.taken = true;
        hit.flash = 0;
        this.emit({ type: 'gate', gate: hit.id, gain: next - this.troops, x: this.crowdX, z: CROWD_Z + 0.3 });
        this.troops = next;
      }
    }

    // Squads reaching the crowd: fight if you're in their way.
    const front = CROWD_Z + this.crowdDepth();
    for (const s of this.squads) {
      if (s.done) continue;
      if (s.z + s.depth < CROWD_Z - 1) s.done = true; // dodged: it's behind you now
      else if (s.z <= front && s.z + s.depth >= CROWD_Z - 0.2 && hitsSquad(this.crowdX, this.troops, s)) {
        this.fighting = s;
        this.phase = 'fight';
        this.emit({ type: 'fight', squad: s.id });
        break;
      }
    }

    this.rallyAcc += dt * this.stats.rallyPerSec;
    if (this.rallyAcc >= 1) {
      this.troops += Math.floor(this.rallyAcc);
      this.rallyAcc %= 1;
    }
  }

  /** Troops and squad trade 1:1 until one side is gone (or you steer out of it). */
  private fight(dt: number): void {
    const s = this.fighting!;
    if (!hitsSquad(this.crowdX, this.troops, s)) {
      this.fighting = null;
      this.phase = 'run';
      return;
    }
    this.tradeAcc += dt * (18 + 1.5 * Math.min(this.troops, s.left));
    let k = Math.min(Math.floor(this.tradeAcc), this.troops, s.left);
    this.tradeAcc -= Math.floor(this.tradeAcc);
    while (k-- > 0) {
      this.troops--;
      s.left--;
      if (s.left % s.hp === 0) {
        this.kills++;
        const x = s.x + (this.rand() - 0.5) * Math.min(s.half, 0.8);
        this.emit({ type: 'kill', x, z: s.z + 0.05, big: s.hp > 1 });
      }
    }
    if (s.left <= 0) {
      s.done = true;
      this.fighting = null;
      this.phase = 'run';
    }
  }

  /** At the base: troops stream out and hit it one by one. */
  private siege(dt: number): void {
    this.place();
    this.chargeAcc += dt * Math.max(10, this.troops * 1.2);
    // Send only as many as the base still needs; the rest stay with you.
    let needed = this.towerHp - this.runners();
    while (this.chargeAcc >= 1 && this.troops > 0 && needed-- > 0) {
      this.chargeAcc -= 1;
      this.troops--;
      const i = this.players.add(this.crowdX + (this.rand() - 0.5) * 0.3, CROWD_Z + this.crowdDepth(), 1, 0, RUNNER);
      if (i < 0) this.hitTower(1); // too many on screen: count the hit straight away
    }
    this.chargeAcc = Math.min(this.chargeAcc, 1);
    const p = this.players;
    for (let i = p.n - 1; i >= 0; i--) {
      if (p.gates[i] !== RUNNER) continue;
      p.z[i] += RUNNER_SPEED * dt;
      p.x[i] += (0 - p.x[i]) * Math.min(1, dt * 2.5);
      p.age[i] += dt;
      if (p.z[i] >= this.towerZ - 0.3) {
        p.remove(i);
        this.hitTower(1);
      }
    }
    if (this.towerHp <= 0) {
      this.towerHp = 0;
      this.state = 'won';
    }
  }

  private hitTower(dmg: number): void {
    this.towerHp -= dmg;
    this.towerFlash = 0;
    this.emit({ type: 'tower', dmg });
  }

  private runners(): number {
    let n = 0;
    for (let i = 0; i < this.players.n; i++) if (this.players.gates[i] === RUNNER) n++;
    return n;
  }

  /** Screen positions of everything on the track. */
  private place(): void {
    for (const g of this.gates) g.z = g.d - this.scroll;
    for (const s of this.squads) s.z = s.d - this.scroll;
    this.towerZ = this.trackLength - this.scroll;
  }

  private crowdDepth(): number {
    return SPACING * Math.sqrt(Math.min(this.troops, MAX_SHOWN)) * 0.9;
  }

  /** Endless: keep laying track ahead, sized to how big your crowd is now. */
  private extendTrack(): void {
    while (this.stretchZ < this.scroll + VIEW + 12) {
      const c = endlessChunk(this.seed & 0xffff, this.nextStretch++, this.stretchZ, this.troops);
      for (const r of c.gates) this.addRow(r.z, r.panels);
      for (const s of c.squads) this.addSquad(s);
      this.stretchZ += ENDLESS_STRETCH;
    }
    // Forget what's long gone.
    const gone = <T extends { z: number }>(xs: T[]) => Math.max(0, xs.findIndex((x) => x.z > -3));
    if (this.gates.length > 60) this.gates.splice(0, gone(this.gates));
    if (this.squads.length > 40) this.squads.splice(0, gone(this.squads));
  }

  /** Visual formations: your crowd around its centre, each squad across the lane it blocks. */
  private layout(dt: number): void {
    const p = this.players;
    const want = Math.min(Math.max(0, Math.floor(this.troops)), MAX_SHOWN);
    let have = 0;
    for (let i = 0; i < p.n; i++) if (p.gates[i] !== RUNNER) have++;
    for (let i = p.n - 1; i >= 0 && have > want; i--) {
      if (p.gates[i] === RUNNER) continue;
      p.remove(i);
      have--;
    }
    while (have < want && p.add(this.crowdX, CROWD_Z, 1) >= 0) have++;
    const k = Math.min(1, dt * 12);
    let slot = 0;
    for (let i = 0; i < p.n; i++) {
      if (p.gates[i] === RUNNER) continue;
      const r = SPACING * Math.sqrt(slot + 0.5), a = slot * 2.39996;
      slot++;
      const tx = this.crowdX + (r * Math.cos(a)) / LANE_W, tz = CROWD_Z + r * Math.sin(a) * 0.9;
      if (dt === 0) {
        p.x[i] = tx;
        p.z[i] = tz;
      } else {
        p.x[i] += (tx - p.x[i]) * k;
        p.z[i] += (tz - p.z[i]) * k;
      }
      p.age[i] += dt;
    }

    const e = this.enemies;
    e.clear();
    for (const s of this.squads) {
      if (s.done && s.left <= 0) continue;
      if (s.z > VIEW + 1 || s.z < -2) {
        s.depth = 0.13 * Math.ceil(Math.min(Math.ceil(s.left / s.hp), MAX_SQUAD_SHOWN) / Math.max(1, Math.floor((2 * Math.min(s.half, 0.95) * LANE_W) / 0.14)));
        continue;
      }
      const shown = Math.min(Math.ceil(s.left / s.hp), MAX_SQUAD_SHOWN);
      const gap = s.hp > 1 ? 0.24 : 0.14;
      const cols = Math.max(1, Math.floor((2 * Math.min(s.half, 0.95) * LANE_W) / gap));
      const rows = Math.ceil(shown / cols);
      s.depth = rows * gap * 0.9;
      for (let j = 0; j < shown; j++) {
        const c = j % cols, r = Math.floor(j / cols);
        const inRow = r === rows - 1 ? shown - r * cols : cols;
        const x = s.x + ((c - (inRow - 1) / 2) * gap) / LANE_W;
        const i = e.add(Math.max(-0.97, Math.min(0.97, x)), s.z + r * gap * 0.9, s.hp);
        if (i < 0) break;
        e.age[i] = this.time + j * 0.13;
      }
    }
  }

  /** Crowd half-width in lane units (for the HUD bubble and tests). */
  get crowdHalf(): number {
    return crowdHalf(this.troops);
  }
}
