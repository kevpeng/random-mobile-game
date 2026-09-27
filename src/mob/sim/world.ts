import { mulberry32 } from '../../shared/rng';
import { endlessWave, gateShift, type GateKind, type GateMotion, type LevelSpec, type WaveSpec } from './levels';
import { Pool } from './pool';

export const STEP = 1 / 60;
export const UNIT_SPEED = 3.4;
export const ENEMY_SPEED = 1.25;
export const CANNON_Z = 0.35;
/** Enemies reaching this depth hit your base. */
export const LOSE_Z = 0.6;
/** Hits your base can take before the level is lost. */
export const BASE_HP = 20;
/** How fast enemies drift sideways toward your cannon (lane widths per second). */
const ENEMY_HOMING = 0.22;
export const CHAMPION_HP = 10;
export const MAX_PLAYERS = 2500;
export const MAX_ENEMIES = 1500;
const CELL = 0.25;
const SEEK_RANGE = 1.1;
/**
 * Half-width of the enemy tower (lane units, centred on x = 0). Units only hit
 * the tower if they arrive inside this footprint; the rest walk on past it.
 */
export const TOWER_HALF = 0.5;
/** Units that miss the tower are removed once they are this far past its line. */
const PAST_TOWER = 0.8;
/** Seconds a + gate needs to recharge after adding its units. */
export const ADD_COOLDOWN = 1;

/** Visual & collision radius for a unit with `hp` hit points. */
export const radius = (hp: number) => 0.05 * (1 + 0.45 * Math.log2(Math.max(1, hp)));

export interface Upgrades {
  fire: number; // fire rate level
  shot: number; // extra units per shot
  champ: number; // champion frequency level
  boost: number; // free ×(1+boost) gate near the cannon
}
export const NO_UPGRADES: Upgrades = { fire: 0, shot: 0, champ: 0, boost: 0 };

export function stats(u: Upgrades) {
  return {
    fireRate: 4 + 0.8 * u.fire, // shots per second
    perShot: 1 + u.shot,
    championEvery: Math.max(6, 24 - 3 * u.champ),
  };
}

export interface Gate {
  id: number;
  bit: number;
  /** Index of the gate row this panel belongs to (panels in a row move together). */
  row: number;
  /** Current position (moves over time for rows with motion; see gateShift). */
  z: number;
  x0: number;
  x1: number;
  /** Position at t = 0 (the layout's rest position). */
  bz: number;
  bx0: number;
  bx1: number;
  /** z at the previous step, for crossing tests against a moving gate. */
  pz: number;
  move?: GateMotion;
  kind: GateKind;
  n: number;
  counter: number; // ÷ gates: units seen
  remaining: number; // − gates: units left to absorb
  broken: boolean;
  /** Visual: seconds since last triggered. */
  flash: number;
  /** + gates: seconds until it can fire again (0 = ready). */
  cool: number;
}

export type MobEvent =
  | { type: 'gate'; gate: number; gain: number; x: number; z: number }
  | { type: 'kill'; x: number; z: number; big: boolean }
  | { type: 'tower'; dmg: number }
  | { type: 'base'; dmg: number }
  | { type: 'break'; gate: number }
  | { type: 'shot'; champion: boolean };

interface Spawn {
  t: number;
  x: number;
  hp: number;
}

export class World {
  readonly players = new Pool(MAX_PLAYERS);
  readonly enemies = new Pool(MAX_ENEMIES);
  readonly gates: Gate[];
  readonly length: number;
  readonly endless: boolean;
  readonly towerMax: number;
  towerHp: number;
  baseHp = BASE_HP;
  cannonX = 0;
  targetX = 0;
  /** The cannon auto-fires; tests can switch it off. */
  firing = true;
  time = 0;
  shots = 0;
  kills = 0;
  state: 'playing' | 'won' | 'lost' = 'playing';
  events: MobEvent[] = [];
  /** Visual: seconds since the tower was last hit. */
  towerFlash = 9;

  private rand: () => number;
  private fireAcc = 0;
  private stats: ReturnType<typeof stats>;
  private spawns: Spawn[] = [];
  private nextSpawn = 0;
  private endlessWaveNo = 0;
  // Collision grid over enemies (linked lists per cell).
  private cols = Math.ceil(2 / CELL);
  private rows: number;
  private head: Int32Array;
  private next = new Int32Array(MAX_ENEMIES);

  constructor(spec: LevelSpec, upgrades: Upgrades = NO_UPGRADES, seed = 1) {
    this.rand = mulberry32(seed);
    this.stats = stats(upgrades);
    this.length = spec.length;
    this.endless = !Number.isFinite(spec.towerHp);
    this.towerMax = this.towerHp = spec.towerHp;
    const rows = [...spec.gates];
    if (upgrades.boost > 0) {
      rows.unshift({ z: 1.4, panels: [{ kind: 'mul', n: 1 + upgrades.boost, x0: -1, x1: 1 }] });
    }
    this.gates = rows
      .flatMap((r, row) => r.panels.map((p) => ({ kind: p.kind, n: p.n, x0: p.x0, x1: p.x1, z: r.z, row, move: r.move })))
      .slice(0, 32)
      .map((p, id) => ({
        ...p,
        id,
        bit: 1 << id,
        bz: p.z,
        bx0: p.x0,
        bx1: p.x1,
        pz: p.z,
        counter: 0,
        cool: 0,
        remaining: p.kind === 'sub' ? p.n : 0,
        broken: false,
        flash: 9,
      }));
    this.placeGates();
    for (const g of this.gates) g.pz = g.z;
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

  /** Moves every gate to its position at the current sim time (a pure function of time and params). */
  private placeGates(): void {
    for (const g of this.gates) {
      g.pz = g.z;
      if (!g.move) continue;
      const { dx, dz } = gateShift(g.move, this.time);
      g.x0 = g.bx0 + dx;
      g.x1 = g.bx1 + dx;
      g.z = g.bz + dz;
    }
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
    for (const g of this.gates) {
      g.flash += dt;
      g.cool = Math.max(0, g.cool - dt);
    }
    this.placeGates();

    // Cannon: glide toward the finger, fire on a fixed cadence.
    this.cannonX += (this.targetX - this.cannonX) * Math.min(1, dt * 18);
    if (this.firing) this.fireAcc += dt * this.stats.fireRate;
    while (this.fireAcc >= 1) {
      this.fireAcc -= 1;
      this.fire();
    }

    this.spawnEnemies();
    this.movePlayers(dt);
    this.moveEnemies(dt);
    if (this.state !== 'playing') return;
    this.collide();
  }

  private fire(): void {
    const s = this.stats;
    this.shots++;
    const champion = this.shots % s.championEvery === 0;
    if (champion) {
      this.players.add(this.cannonX, CANNON_Z, CHAMPION_HP);
    } else {
      for (let k = 0; k < s.perShot; k++) {
        const off = (k - (s.perShot - 1) / 2) * 0.06;
        this.players.add(clampX(this.cannonX + off), CANNON_Z, 1, (this.rand() - 0.5) * 0.3);
      }
    }
    this.emit({ type: 'shot', champion });
  }

  private spawnEnemies(): void {
    if (this.endless) {
      const w = endlessWave(this.endlessWaveNo);
      if (this.time >= w.t - 0.5) {
        this.schedule(w);
        this.endlessWaveNo++;
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
    const reach = this.length - 0.45;
    // Backwards, so removals (swap with last) only move already-processed units
    // or this step's fresh clones, which don't move until next step.
    units: for (let i = p.n - 1; i >= 0; i--) {
      const z0 = p.z[i];
      const z1 = z0 + UNIT_SPEED * dt;
      p.z[i] = z1;
      p.vx[i] *= 0.92;
      p.x[i] = clampX(p.x[i] + p.vx[i] * dt);
      p.age[i] += dt;

      // Gates crossed this step.
      for (const g of this.gates) {
        // Crossed if it was in front of the gate last step and is at/behind it now.
        if (g.broken || p.gates[i] & g.bit || z0 >= g.pz || z1 < g.z) continue;
        if (p.x[i] < g.x0 || p.x[i] > g.x1) continue;
        p.gates[i] |= g.bit;
        if (!this.applyGate(g, i)) continue units; // unit was destroyed
      }

      // Units keep going straight; only those arriving inside the tower's
      // footprint hit it. The rest walk on past and leave the field.
      if (p.z[i] >= reach) {
        if (this.endless) {
          p.remove(i);
        } else if (Math.abs(p.x[i]) <= TOWER_HALF) {
          this.towerHp -= p.hp[i];
          this.towerFlash = 0;
          this.emit({ type: 'tower', dmg: p.hp[i] });
          p.remove(i);
        } else if (p.z[i] >= this.length + PAST_TOWER) {
          p.remove(i);
        }
      }
    }
    if (!this.endless && this.towerHp <= 0) {
      this.towerHp = 0;
      this.state = 'won';
    }
  }

  /** Applies gate `g` to player `i`. Returns false if the unit was destroyed. */
  private applyGate(g: Gate, i: number): boolean {
    const p = this.players;
    g.flash = 0;
    switch (g.kind) {
      case 'mul':
      case 'add': {
        // ×N multiplies every unit; +N adds N units once, then recharges.
        if (g.kind === 'add') {
          if (g.cool > 0) return true;
          g.cool = ADD_COOLDOWN;
        }
        const clones = g.kind === 'mul' ? g.n - 1 : g.n;
        const hp = g.kind === 'mul' ? p.hp[i] : 1;
        let merged = 0;
        for (let k = 0; k < clones; k++) {
          const x = clampX(p.x[i] + (this.rand() - 0.5) * 0.16, g.x0 + 0.02, g.x1 - 0.02);
          if (p.add(x, p.z[i] - this.rand() * 0.06, hp, (this.rand() - 0.5) * 0.6, p.gates[i]) < 0) merged += hp;
        }
        // Past the cap, extra clones fold into this unit (it grows into a champion).
        p.hp[i] += merged;
        this.emit({ type: 'gate', gate: g.id, gain: clones * hp, x: p.x[i], z: g.z });
        return true;
      }
      case 'div': {
        g.counter++;
        if (g.counter % g.n === 0) return true;
        p.remove(i);
        return false;
      }
      case 'sub': {
        const absorb = Math.min(g.remaining, p.hp[i]);
        g.remaining -= absorb;
        p.hp[i] -= absorb;
        if (g.remaining <= 0) {
          g.broken = true;
          this.emit({ type: 'break', gate: g.id });
        }
        if (p.hp[i] <= 0) {
          p.remove(i);
          return false;
        }
        return true;
      }
    }
  }

  private moveEnemies(dt: number): void {
    const e = this.enemies;
    for (let i = e.n - 1; i >= 0; i--) {
      e.z[i] -= ENEMY_SPEED * dt;
      // Drift toward the cannon, so the crowds meet head-on.
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
      // Mob behaviour: veer toward the nearest enemy a little way ahead.
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

  /** True once every scheduled enemy has spawned and none are left (levels only). */
  get cleared(): boolean {
    return !this.endless && this.nextSpawn >= this.spawns.length && this.enemies.n === 0;
  }
}

function clampX(x: number, lo = -0.97, hi = 0.97): number {
  return x < lo ? lo : x > hi ? hi : x;
}
