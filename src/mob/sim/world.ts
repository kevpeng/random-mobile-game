import { mulberry32 } from '../../shared/rng';
import { applyGate, endlessGates, endlessWave, type GateKind, type GateSpec, type LevelSpec, type WaveSpec } from './levels';
import { Pool } from './pool';

export const STEP = 1 / 60;
/** How fast the ground rolls toward you, carrying gates (world units per second). */
export const BELT_SPEED = 1.4;
export const UNIT_SPEED = 3.4;
/** Mobs ride the belt and walk toward you on top of it. */
export const ENEMY_SPEED = BELT_SPEED + 0.35;
export const CANNON_Z = 0.35;
/** Mobs reaching this depth hit your base. */
export const LOSE_Z = 0.6;
/** Hits your base can take before the level is lost. */
export const BASE_HP = 20;
/** How fast mobs drift sideways toward your gun (lane widths per second). */
const ENEMY_HOMING = 0.22;
export const CHAMPION_HP = 10;
export const MAX_PLAYERS = 2500;
export const MAX_ENEMIES = 1500;
/** Past this many bullets per shot, extra bullets fold into bigger ones. */
const SPREAD_MAX = 12;
const CELL = 0.25;
const SEEK_RANGE = 1.1;

/** Visual & collision radius for a unit with `hp` hit points. */
export const radius = (hp: number) => 0.05 * (1 + 0.45 * Math.log2(Math.max(1, hp)));

export interface Upgrades {
  fire: number; // fire rate level
  shot: number; // extra bullets per shot
  champ: number; // champion frequency level
  boost: number; // head start: bullets per shot ×(1+boost)
}
export const NO_UPGRADES: Upgrades = { fire: 0, shot: 0, champ: 0, boost: 0 };

export function stats(u: Upgrades) {
  return {
    fireRate: 4 + 0.8 * u.fire, // shots per second
    perShot: (1 + u.shot) * (1 + u.boost),
    championEvery: Math.max(6, 24 - 3 * u.champ),
  };
}

export interface Gate {
  id: number;
  kind: GateKind;
  n: number;
  x0: number;
  x1: number;
  /** Depth: rides the belt from the far end toward the gun. */
  z: number;
  /** Taken by the gun (then it fades out). */
  taken: boolean;
  /** Visual: seconds since taken. */
  flash: number;
  /** Visual: > 0 dims it (it has gone past the gun untaken). */
  cool: number;
  broken: boolean;
}

export type MobEvent =
  | { type: 'gate'; gate: number; kind: GateKind; n: number; x: number; z: number }
  | { type: 'kill'; x: number; z: number; big: boolean }
  | { type: 'base'; dmg: number }
  | { type: 'shot'; champion: boolean };

interface Spawn {
  t: number;
  x: number;
  hp: number;
}

export class World {
  readonly players = new Pool(MAX_PLAYERS);
  readonly enemies = new Pool(MAX_ENEMIES);
  gates: Gate[] = [];
  readonly length: number;
  readonly endless: boolean;
  baseHp = BASE_HP;
  cannonX = 0;
  targetX = 0;
  /** The gun auto-fires; tests can switch it off. */
  firing = true;
  /** Bullets per shot and shots per second: gates change these. */
  perShot: number;
  fireRate: number;
  /** How far the belt has rolled (drives the ground texture). */
  belt = 0;
  time = 0;
  shots = 0;
  kills = 0;
  /** Waves in the level (0 in endless) and how many have started. */
  readonly wavesTotal: number;
  wavesStarted = 0;
  state: 'playing' | 'won' | 'lost' = 'playing';
  events: MobEvent[] = [];

  private rand: () => number;
  private fireAcc = 0;
  private championEvery: number;
  private spawns: Spawn[] = [];
  private nextSpawn = 0;
  private waveTimes: number[];
  private gateQueue: GateSpec[];
  private nextGate = 0;
  private gateIds = 0;
  private endlessWaveNo = 0;
  private endlessMinute = 0;
  private seed: number;
  // Collision grid over enemies (linked lists per cell).
  private cols = Math.ceil(2 / CELL);
  private rows: number;
  private head: Int32Array;
  private next = new Int32Array(MAX_ENEMIES);

  constructor(spec: LevelSpec, upgrades: Upgrades = NO_UPGRADES, seed = 1) {
    this.seed = seed;
    this.rand = mulberry32(seed);
    const s = stats({ ...NO_UPGRADES, ...upgrades });
    this.perShot = s.perShot;
    this.fireRate = s.fireRate;
    this.championEvery = s.championEvery;
    this.length = spec.length;
    this.endless = !!spec.endless;
    this.wavesTotal = spec.waves.length;
    this.waveTimes = spec.waves.map((w) => w.t).sort((a, b) => a - b);
    this.gateQueue = [...spec.gates].sort((a, b) => a.t - b.t);
    for (const w of spec.waves) this.schedule(w);
    this.rows = Math.ceil(this.length / CELL) + 2;
    this.head = new Int32Array(this.cols * this.rows);
  }

  private schedule(w: WaveSpec): void {
    for (let i = 0; i < w.count; i++) {
      const t = w.t + (w.count > 1 ? (w.over * i) / (w.count - 1) : 0);
      this.spawns.push({ t, x: -0.9 + this.rand() * 1.8, hp: w.hp });
    }
    // Keep the not-yet-spawned tail sorted by time.
    const tail = this.spawns.splice(this.nextSpawn).sort((a, b) => a.t - b.t);
    this.spawns.push(...tail);
  }

  private emit(e: MobEvent): void {
    if (this.events.length > 2000) this.events.length = 0; // nobody is draining (headless)
    this.events.push(e);
  }

  /** Advances the simulation by one fixed step. */
  step(dt = STEP): void {
    if (this.state !== 'playing') return;
    this.time += dt;
    this.belt += BELT_SPEED * dt;
    while (this.wavesStarted < this.waveTimes.length && this.waveTimes[this.wavesStarted] <= this.time) this.wavesStarted++;

    // Gun: glide toward the finger, fire on a fixed cadence.
    this.cannonX += (this.targetX - this.cannonX) * Math.min(1, dt * 18);
    if (this.firing) this.fireAcc += dt * this.fireRate;
    while (this.fireAcc >= 1) {
      this.fireAcc -= 1;
      this.fire();
    }

    this.moveGates(dt);
    this.spawnEnemies();
    this.movePlayers(dt);
    this.moveEnemies(dt);
    if (this.state !== 'playing') return;
    this.collide();
    if (!this.endless && this.nextSpawn >= this.spawns.length && this.enemies.n === 0) this.state = 'won';
  }

  private fire(): void {
    this.shots++;
    const champion = this.shots % this.championEvery === 0;
    if (champion) {
      this.players.add(this.cannonX, CANNON_Z, CHAMPION_HP * Math.max(1, Math.round(this.perShot / 4)));
    } else {
      // Up to SPREAD_MAX bullets fan out; any more make each bullet bigger.
      const k = Math.min(this.perShot, SPREAD_MAX);
      const base = Math.floor(this.perShot / k), extra = this.perShot % k;
      for (let j = 0; j < k; j++) {
        const off = (j - (k - 1) / 2) * 0.06;
        this.players.add(clampX(this.cannonX + off), CANNON_Z, base + (j < extra ? 1 : 0), (this.rand() - 0.5) * 0.3);
      }
    }
    this.emit({ type: 'shot', champion });
  }

  /** Gates appear at the far end on their own clock and ride the belt to the gun. */
  private moveGates(dt: number): void {
    if (this.endless) {
      while (this.endlessMinute * 60 <= this.time + 1) {
        this.gateQueue.push(...endlessGates(this.seed & 0xffff, this.endlessMinute++));
      }
    }
    while (this.nextGate < this.gateQueue.length && this.gateQueue[this.nextGate].t <= this.time) {
      const g = this.gateQueue[this.nextGate++];
      this.gates.push({ id: this.gateIds++, kind: g.kind, n: g.n, x0: g.x0, x1: g.x1, z: this.length - 0.4, taken: false, flash: 9, cool: 0, broken: false });
    }
    const line = CANNON_Z + 0.15;
    for (const g of this.gates) {
      const z0 = g.z;
      g.z -= BELT_SPEED * dt;
      g.flash += dt;
      if (g.taken || g.cool > 0 || z0 < line || g.z >= line) continue;
      if (this.cannonX >= g.x0 && this.cannonX <= g.x1) {
        const next = applyGate(this, g);
        this.perShot = next.perShot;
        this.fireRate = next.fireRate;
        g.taken = true;
        g.flash = 0;
        this.emit({ type: 'gate', gate: g.id, kind: g.kind, n: g.n, x: this.cannonX, z: CANNON_Z + 0.3 });
      } else g.cool = 1;
    }
    // Taken gates pop quickly; missed ones roll off the bottom.
    this.gates = this.gates.filter((g) => (g.taken ? g.flash < 0.25 : g.z > -2.5));
    for (const g of this.gates) g.broken = g.taken && g.flash >= 0.2;
  }

  private spawnEnemies(): void {
    if (this.endless) {
      const w = endlessWave(this.endlessWaveNo);
      if (this.time >= w.t - 0.5) {
        this.schedule(w);
        this.endlessWaveNo++;
        this.wavesStarted = this.endlessWaveNo;
      }
    }
    const z = this.length - 0.6;
    while (this.nextSpawn < this.spawns.length && this.spawns[this.nextSpawn].t <= this.time) {
      const s = this.spawns[this.nextSpawn++];
      this.enemies.add(s.x, z, s.hp);
    }
  }

  private movePlayers(dt: number): void {
    const p = this.players;
    const end = this.length + 0.5;
    for (let i = p.n - 1; i >= 0; i--) {
      p.z[i] += UNIT_SPEED * dt;
      p.vx[i] *= 0.92;
      p.x[i] = clampX(p.x[i] + p.vx[i] * dt);
      p.age[i] += dt;
      if (p.z[i] >= end) p.remove(i); // flew off the far end
    }
  }

  private moveEnemies(dt: number): void {
    const e = this.enemies;
    for (let i = e.n - 1; i >= 0; i--) {
      e.z[i] -= ENEMY_SPEED * dt;
      // Drift toward the gun, so the crowds meet head-on.
      const dx = this.cannonX - e.x[i];
      e.x[i] += Math.sign(dx) * Math.min(Math.abs(dx), ENEMY_HOMING * dt);
      e.age[i] += dt;
      if (e.z[i] <= LOSE_Z) {
        this.baseHp -= e.hp[i];
        this.emit({ type: 'base', dmg: e.hp[i] });
        e.remove(i);
      }
    }
    if (this.baseHp <= 0) {
      this.baseHp = 0;
      this.state = 'lost';
    }
  }

  private collide(): void {
    const { players: p, enemies: e, cols, rows, head, next } = this;
    head.fill(-1);
    const cell = (x: number, z: number) => {
      const c = Math.min(cols - 1, Math.max(0, Math.floor((x + 1) / CELL)));
      const r = Math.min(rows - 1, Math.max(0, Math.floor(z / CELL)));
      return r * cols + c;
    };
    for (let j = 0; j < e.n; j++) {
      const k = cell(e.x[j], e.z[j]);
      next[j] = head[k];
      head[k] = j;
    }
    for (let i = p.n - 1; i >= 0; i--) {
      const px = p.x[i], pz = p.z[i];
      const c0 = Math.floor((px + 1) / CELL), r0 = Math.floor(pz / CELL);
      for (let dr = -1; dr <= 1 && p.hp[i] > 0; dr++) {
        const r = r0 + dr;
        if (r < 0 || r >= rows) continue;
        for (let dc = -1; dc <= 1 && p.hp[i] > 0; dc++) {
          const c = c0 + dc;
          if (c < 0 || c >= cols) continue;
          for (let j = head[r * cols + c]; j >= 0 && p.hp[i] > 0; j = next[j]) {
            if (e.hp[j] <= 0) continue;
            const reach = radius(p.hp[i]) + radius(e.hp[j]);
            const dx = e.x[j] - px, dz = e.z[j] - pz;
            if (dx * dx + dz * dz > reach * reach) continue;
            const dmg = Math.min(p.hp[i], e.hp[j]);
            p.hp[i] -= dmg;
            e.hp[j] -= dmg;
            if (e.hp[j] <= 0) {
              this.kills++;
              this.emit({ type: 'kill', x: e.x[j], z: e.z[j], big: dmg > 1 });
            }
          }
        }
      }
      if (p.hp[i] <= 0) {
        p.remove(i);
        continue;
      }
      // Bullets veer toward the nearest mob a little way ahead.
      // Staggered across steps to keep the cost down with thousands of units.
      if ((i + this.tick) % 4 === 0) this.seek(i, c0, r0);
    }
    for (let j = e.n - 1; j >= 0; j--) if (e.hp[j] <= 0) e.remove(j);
    this.tick++;
  }

  private tick = 0;

  private seek(i: number, c0: number, r0: number): void {
    const { players: p, enemies: e, cols, rows, head, next } = this;
    let best = -1;
    let bestD = SEEK_RANGE * SEEK_RANGE;
    for (let r = r0; r <= r0 + 4 && r < rows; r++) {
      for (let c = Math.max(0, c0 - 2); c <= Math.min(cols - 1, c0 + 2); c++) {
        for (let j = head[r * cols + c]; j >= 0; j = next[j]) {
          if (e.hp[j] <= 0) continue;
          const dx = e.x[j] - p.x[i], dz = e.z[j] - p.z[i];
          const d = dx * dx + dz * dz;
          if (dz > -0.05 && d < bestD) {
            bestD = d;
            best = j;
          }
        }
      }
    }
    if (best >= 0) {
      const dx = e.x[best] - p.x[i];
      p.vx[i] = Math.max(-1.2, Math.min(1.2, dx * 5));
    }
  }
}

function clampX(x: number, lo = -0.97, hi = 0.97): number {
  return x < lo ? lo : x > hi ? hi : x;
}
