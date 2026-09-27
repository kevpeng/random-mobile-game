import { describe, expect, it } from 'vitest';
import { endlessSpec, endlessWave, gateShift, generateLevel, levelMotion, levelSpec, type LevelSpec, type PanelSpec } from '../src/mob/sim/levels';
import { playLevel } from '../src/mob/sim/bot';
import { autoBuy, lossCoins, winCoins } from '../src/mob/sim/economy';
import { ADD_COOLDOWN, NO_UPGRADES, BASE_HP, CHAMPION_HP, MAX_PLAYERS, TOWER_HALF, World, radius } from '../src/mob/sim/world';

const lane = (panels: Omit<PanelSpec, 'x0' | 'x1'>): PanelSpec[] => [{ ...panels, x0: -1, x1: 1 }];

function world(gate?: Omit<PanelSpec, 'x0' | 'x1'>, extra: Partial<LevelSpec> = {}): World {
  const w = new World({
    length: 16,
    towerHp: 1000,
    gates: gate ? [{ z: 5, panels: lane(gate) }] : [],
    waves: [],
    ...extra,
  });
  w.targetX = w.cannonX = 0;
  w.firing = false; // only the units a test places
  return w;
}

/** Total hp of player units beyond the cannon area (ignores freshly fired shots). */
const field = (w: World) => {
  let t = 0;
  for (let i = 0; i < w.players.n; i++) if (w.players.z[i] > 2) t += w.players.hp[i];
  return t;
};

/** Places `n` 1-hp units just before the gate and runs until they've passed it. */
function through(w: World, n: number, hp = 1): void {
  for (let i = 0; i < n; i++) w.players.add(-0.5 + i * 0.01, 4.95, hp);
  for (let s = 0; s < 6; s++) w.step();
}

describe('gates', () => {
  it('×3 turns 10 units into 30', () => {
    const w = world({ kind: 'mul', n: 3 });
    through(w, 10);
    expect(field(w)).toBe(30);
  });
  it('+5 adds five units, then recharges for a second', () => {
    const w = world({ kind: 'add', n: 5 });
    through(w, 1);
    expect(field(w)).toBe(6);
    through(w, 10); // arrives while recharging: unchanged
    expect(field(w)).toBe(16);
    for (let s = 0; s < 60 * ADD_COOLDOWN; s++) w.step();
    const before = field(w);
    through(w, 1);
    expect(field(w)).toBe(before + 6);
  });
  it('÷2 halves', () => {
    const w = world({ kind: 'div', n: 2 });
    through(w, 10);
    expect(field(w)).toBe(5);
  });
  it('−10 absorbs ten units then breaks', () => {
    const w = world({ kind: 'sub', n: 10 });
    through(w, 15);
    expect(field(w)).toBe(5);
    expect(w.gates[0].broken).toBe(true);
    through(w, 4); // broken gate does nothing
    expect(field(w)).toBe(9);
  });
  it('affects each unit once — clones never re-trigger it', () => {
    const w = world({ kind: 'mul', n: 2 });
    through(w, 10);
    for (let s = 0; s < 30; s++) w.step();
    expect(field(w)).toBe(20);
  });
  it('only affects units within the panel span', () => {
    const w = new World({ length: 16, towerHp: 1000, gates: [{ z: 5, panels: [{ kind: 'mul', n: 3, x0: 0, x1: 1 }] }], waves: [] });
    w.players.add(-0.5, 4.95, 1);
    w.players.add(0.5, 4.95, 1);
    for (let s = 0; s < 6; s++) w.step();
    expect(field(w)).toBe(4); // left one untouched, right one tripled
  });
  it('past the unit cap, clones fold into bigger units (total preserved)', () => {
    const w = world({ kind: 'mul', n: 3 });
    for (let i = 0; i < MAX_PLAYERS - 5; i++) w.players.add(0, 1.2, 1); // filler behind the gate
    through(w, 5);
    expect(w.players.n).toBe(MAX_PLAYERS);
    expect(field(w)).toBe(15);
  });
});

describe('moving gates', () => {
  const gatePos = (w: World) => w.gates.map((g) => [g.x0, g.x1, g.z]);
  const runTo = (w: World, seconds: number) => {
    for (let s = 0; s < seconds * 60; s++) w.step();
    return w;
  };

  it('move deterministically: same seed and time, same positions', () => {
    const a = runTo(new World(levelSpec(9), NO_UPGRADES, 7), 7.5);
    const b = runTo(new World(levelSpec(9), NO_UPGRADES, 7), 7.5);
    expect(gatePos(a)).toEqual(gatePos(b));
    // A pure function of time and the gate's own params: a different seed, steering
    // and fighting change nothing about where the gates are.
    const c = new World(levelSpec(9), NO_UPGRADES, 12345);
    for (let s = 0; s < 7.5 * 60; s++) {
      c.targetX = Math.sin(s / 17);
      c.step();
    }
    expect(gatePos(c)).toEqual(gatePos(a));
    for (const g of a.gates) {
      const { dx, dz } = gateShift(g.move, a.time);
      expect(g.x0).toBeCloseTo(g.bx0 + dx, 12);
      expect(g.x1).toBeCloseTo(g.bx1 + dx, 12);
      expect(g.z).toBeCloseTo(g.bz + dz, 12);
    }
  });

  it('actually move, and stay inside the lane', () => {
    const w = new World(levelSpec(9), NO_UPGRADES, 1);
    const start = gatePos(w);
    runTo(w, 1);
    expect(gatePos(w)).not.toEqual(start);
    for (let s = 0; s < 60 * 30; s++) {
      w.step();
      for (const g of w.gates) {
        expect(g.x0).toBeGreaterThanOrEqual(-1 - 1e-9);
        expect(g.x1).toBeLessThanOrEqual(1 + 1e-9);
        expect(g.z).toBeLessThanOrEqual(g.bz);
        expect(g.z).toBeGreaterThan(1.5);
      }
    }
  });

  it('start still on level 1, then get gently wider and faster', () => {
    expect(levelMotion(1, 0)).toBeUndefined();
    expect(new World(levelSpec(1)).gates.every((g) => !g.move)).toBe(true);
    const m2 = levelMotion(2, 0)!, m8 = levelMotion(8, 0)!, m15 = levelMotion(15, 0)!;
    expect(m2.ax).toBeLessThan(0.1);
    expect(m8.ax).toBeGreaterThan(m2.ax);
    expect(m15.ax).toBeGreaterThan(m8.ax);
    expect(m15.period).toBeLessThan(m2.period);
    expect(m15.az).toBeGreaterThan(m2.az);
    // Endless mode uses them too.
    expect(endlessSpec(5).gates.every((r) => r.move)).toBe(true);
  });

  it('only affect units the panel covers when they arrive', () => {
    // A ×3 panel [-0.25, 0.25] slid right by 0.5 (≈ [0.25, 0.75]) while the units pass.
    const move = { ax: 0.5, az: 0, period: 1000, phase: Math.PI / 2 };
    const w = new World({ length: 16, towerHp: 1000, gates: [{ z: 5, move, panels: [{ kind: 'mul', n: 3, x0: -0.25, x1: 0.25 }] }], waves: [] });
    w.firing = false;
    w.players.add(0, 4.95, 1); // where the gate was at rest: now a gap
    w.players.add(0.5, 4.95, 1); // where it has slid to
    for (let s = 0; s < 6; s++) w.step();
    expect(field(w)).toBe(4);
  });
});

describe('combat', () => {
  it('trades 1:1', () => {
    const w = world();
    for (let i = 0; i < 5; i++) w.players.add(0, 8, 1);
    for (let i = 0; i < 3; i++) w.enemies.add(0, 8.02, 1);
    w.step();
    expect(w.enemies.n).toBe(0);
    expect(field(w)).toBe(2);
    expect(w.kills).toBe(3);
  });
  it('a champion absorbs up to 10 hits', () => {
    const w = world();
    w.players.add(0, 8, CHAMPION_HP);
    for (let i = 0; i < 4; i++) w.enemies.add(0, 8.02, 1);
    w.step();
    expect(w.enemies.n).toBe(0);
    expect(field(w)).toBe(CHAMPION_HP - 4);
    expect(radius(CHAMPION_HP)).toBeGreaterThan(radius(1));
  });
  it('big enemies take several units', () => {
    const w = world();
    for (let i = 0; i < 3; i++) w.players.add(0, 8, 1);
    w.enemies.add(0, 8.02, 5);
    w.step();
    expect(field(w)).toBe(0);
    expect(w.enemies.hp[0]).toBe(2);
  });
});

describe('win / lose', () => {
  it('units reaching the tower damage it; zero hp wins', () => {
    const w = world(undefined, { towerHp: 5 });
    for (let i = 0; i < 5; i++) w.players.add(0, 15.5, 1);
    for (let s = 0; s < 3 && w.state === 'playing'; s++) w.step();
    expect(w.towerHp).toBe(0);
    expect(w.state).toBe('won');
  });
  it('units fly straight: one fired off to the side of the tower walks past it', () => {
    const w = world(undefined, { towerHp: 5 });
    const x = TOWER_HALF + 0.3;
    w.players.add(x, 14, 3);
    let minX = x, maxX = x;
    for (let s = 0; s < 120 && w.players.n > 0; s++) {
      w.step();
      if (w.players.n) {
        minX = Math.min(minX, w.players.x[0]);
        maxX = Math.max(maxX, w.players.x[0]);
      }
    }
    expect(maxX - minX).toBeLessThan(1e-6); // no curving toward the tower
    expect(w.players.n).toBe(0); // it walked off the end
    expect(w.towerHp).toBe(5);
    expect(w.state).toBe('playing');
    // The same unit inside the footprint hits.
    w.players.add(TOWER_HALF - 0.05, 15.5, 3);
    for (let s = 0; s < 10; s++) w.step();
    expect(w.towerHp).toBe(2);
  });
  it('enemies reaching the cannon line hurt the base; at zero it is lost', () => {
    const w = world();
    w.enemies.add(0, 0.62, 3);
    w.step();
    expect(w.baseHp).toBe(BASE_HP - 3);
    expect(w.state).toBe('playing');
    w.enemies.add(0, 0.62, BASE_HP);
    w.step();
    expect(w.baseHp).toBe(0);
    expect(w.state).toBe('lost');
  });
  it('waves spawn on schedule', () => {
    const w = world(undefined, { waves: [{ t: 1, count: 4, hp: 1, over: 1 }] });
    for (let s = 0; s < 55; s++) w.step();
    expect(w.enemies.n).toBe(0);
    for (let s = 0; s < 70; s++) w.step(); // t ≈ 2.08 s
    expect(w.enemies.n + w.kills).toBe(4);
  });
  it('the cannon fires on its own and steers toward the finger', () => {
    const w = world();
    w.firing = true;
    w.targetX = 0.8;
    for (let s = 0; s < 61; s++) w.step();
    expect(w.shots).toBe(4); // 4 shots/s with no upgrades
    expect(w.cannonX).toBeGreaterThan(0.75);
  });
});

describe('levels', () => {
  it('is deterministic for a seed', () => {
    const run = () => {
      const w = new World(levelSpec(5), { fire: 2, shot: 1, champ: 1, boost: 1 }, 42);
      for (let s = 0; s < 60 * 20; s++) {
        w.targetX = Math.sin(s / 40) * 0.6;
        w.step();
      }
      return [w.players.n, w.enemies.n, w.kills, w.towerHp, w.state];
    };
    expect(run()).toEqual(run());
  });
  it('generated levels are well formed', () => {
    for (let n = 1; n <= 60; n++) {
      const l = levelSpec(n);
      expect(l.towerHp).toBeGreaterThan(0);
      for (const r of l.gates) {
        expect(r.z).toBeGreaterThan(1.5);
        expect(r.z).toBeLessThan(l.length - 2);
        for (const p of r.panels) expect(p.x1).toBeGreaterThan(p.x0);
      }
    }
    expect(generateLevel(9, 1)).toEqual(generateLevel(9, 1));
    expect(Number.isFinite(endlessSpec(1).towerHp)).toBe(false);
  });
  it('endless mode keeps sending bigger waves', () => {
    const counts = Array.from({ length: 12 }, (_, w) => endlessWave(w)).filter((_, w) => w % 4 !== 3);
    for (let i = 1; i < counts.length; i++) expect(counts[i].count).toBeGreaterThan(counts[i - 1].count);
    // The first two waves actually arrive in a running world.
    const w = new World(endlessSpec(3), { fire: 5, shot: 3, champ: 3, boost: 2 }, 3);
    for (let s = 0; s < 60 * 15 && w.state === 'playing'; s++) w.step();
    expect(w.enemies.n + w.kills).toBe(endlessWave(0).count + endlessWave(1).count);
  });
});

describe('performance', () => {
  it('60 s with 2000+ units stays fast', () => {
    const w = new World({ length: 20, towerHp: 1e9, gates: [], waves: [{ t: 0, count: 1200, hp: 1, over: 60 }] });
    for (let i = 0; i < 2200; i++) w.players.add(-0.9 + (i % 90) * 0.02, 1 + (i / 90) * 0.5, 1);
    const t0 = performance.now();
    for (let s = 0; s < 60 * 60; s++) {
      w.step();
      if (w.players.n < 2000) for (let i = 0; i < 20; i++) w.players.add(-0.9 + Math.random() * 1.8, 1, 1);
    }
    const ms = performance.now() - t0;
    // ~3600 steps; on a phone this must fit easily inside frame budgets.
    expect(ms).toBeLessThan(6000);
  });
});

describe('balance', () => {
  it('a player who aims well can beat levels 1–15 in order, buying upgrades as they go', () => {
    let up = { ...NO_UPGRADES };
    let coins = 0;
    for (let n = 1; n <= 15; n++) {
      let tries = 0;
      let w: World;
      do {
        tries++;
        w = playLevel(new World(levelSpec(n), up, n * 100 + tries), 200);
        coins += w.state === 'won' ? winCoins(n, w.baseHp) : lossCoins(n, 1 - w.towerHp / w.towerMax);
        ({ upgrades: up, coins } = autoBuy(up, coins));
      } while (w.state !== 'won' && tries < 3);
      expect(w.state, `level ${n}`).toBe('won');
      expect(w.time, `level ${n} length`).toBeLessThan(200);
    }
  }, 60_000);
});
