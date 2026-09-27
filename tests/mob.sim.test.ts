import { describe, expect, it } from 'vitest';
import { applyGate, endlessSpec, endlessWave, FIRE_STEP, generateLevel, levelSpec, type GateSpec, type LevelSpec } from '../src/mob/sim/levels';
import { playLevel } from '../src/mob/sim/bot';
import { autoBuy, lossCoins, winCoins } from '../src/mob/sim/economy';
import { BASE_HP, BELT_SPEED, CANNON_Z, CHAMPION_HP, NO_UPGRADES, radius, World } from '../src/mob/sim/world';

const level = (gates: GateSpec[] = [], extra: Partial<LevelSpec> = {}): LevelSpec => ({ length: 16, gates, waves: [], ...extra });
/** A world with one gate spawning at t=0 over [x0, x1], no mobs, not firing. */
function gateWorld(kind: GateSpec['kind'], n: number, x0 = -1, x1 = 0): World {
  const w = new World(level([{ t: 0, kind, n, x0, x1 }], { waves: [{ t: 60, count: 1, hp: 1, over: 0 }] }));
  w.firing = false;
  return w;
}
/** Runs until the gate has rolled past the gun. */
const rollPast = (w: World) => {
  for (let s = 0; s < 60 * 15; s++) w.step();
};

describe('the belt', () => {
  it('keeps rolling at a constant speed, even in a heavy fight', () => {
    const w = new World(level([], { waves: [{ t: 0, count: 300, hp: 1, over: 2 }] }));
    for (let s = 0; s < 60 * 4; s++) w.step();
    expect(w.belt).toBeCloseTo(BELT_SPEED * 4, 1);
  });
  it('brings gates from the far end down to the gun', () => {
    const w = gateWorld('mul', 2);
    w.step();
    const z0 = w.gates[0].z;
    for (let s = 0; s < 60; s++) w.step();
    expect(z0 - w.gates[0].z).toBeCloseTo(BELT_SPEED, 1);
  });
});

describe('gun gates', () => {
  it('×/÷ change bullets per shot, +/− change fire rate', () => {
    const g = { perShot: 3, fireRate: 4 };
    expect(applyGate(g, { kind: 'mul', n: 2 })).toEqual({ perShot: 6, fireRate: 4 });
    expect(applyGate(g, { kind: 'div', n: 2 })).toEqual({ perShot: 2, fireRate: 4 });
    expect(applyGate(g, { kind: 'add', n: 2 })).toEqual({ perShot: 3, fireRate: 4 + 2 * FIRE_STEP });
    expect(applyGate(g, { kind: 'sub', n: 2 })).toEqual({ perShot: 3, fireRate: 4 - 2 * FIRE_STEP });
    expect(applyGate({ perShot: 1, fireRate: 4 }, { kind: 'div', n: 2 }).perShot).toBe(1);
  });
  for (const [kind, n, field, want] of [
    ['mul', 3, 'perShot', 3],
    ['div', 2, 'perShot', 1],
    ['add', 4, 'fireRate', 4 + 4 * FIRE_STEP],
    ['sub', 2, 'fireRate', 4 - 2 * FIRE_STEP],
  ] as const) {
    it(`steering into a ${kind}${n} gate sets ${field} to ${want}`, () => {
      const w = gateWorld(kind, n);
      w.targetX = w.cannonX = -0.5;
      rollPast(w);
      expect(w[field]).toBe(want);
    });
  }
  it('a gate you miss does nothing (and rolls away)', () => {
    const w = gateWorld('mul', 3);
    w.targetX = w.cannonX = 0.5;
    rollPast(w);
    expect(w.perShot).toBe(1);
    expect(w.gates).toHaveLength(0);
  });
  it('bullets fly through gates unchanged', () => {
    const w = new World(level([{ t: 0, kind: 'mul', n: 3, x0: -1, x1: 1 }], { waves: [{ t: 60, count: 1, hp: 1, over: 0 }] }));
    w.cannonX = w.targetX = 0;
    for (let s = 0; s < 60 * 2; s++) w.step(); // gate still far off; bullets pass it
    let total = 0;
    for (let i = 0; i < w.players.n; i++) total += w.players.hp[i];
    expect(w.perShot).toBe(1);
    expect(total).toBeLessThanOrEqual(w.shots * CHAMPION_HP);
    expect(w.players.n).toBeLessThanOrEqual(w.shots);
  });
  it('more bullets per shot means more units per shot (big counts fold into bigger bullets)', () => {
    const w = new World(level([], { waves: [{ t: 60, count: 1, hp: 1, over: 0 }] }));
    w.perShot = 40;
    w.fireRate = 1;
    for (let s = 0; s < 61; s++) w.step();
    let total = 0;
    for (let i = 0; i < w.players.n; i++) total += w.players.hp[i];
    expect(total).toBe(40);
    expect(w.players.n).toBe(12);
  });
});

describe('mobs and waves', () => {
  it('bullets trade 1:1 with mobs', () => {
    const w = new World(level([], { waves: [{ t: 60, count: 1, hp: 1, over: 0 }] }));
    w.firing = false;
    for (let i = 0; i < 5; i++) w.players.add(0, 8, 1);
    for (let i = 0; i < 3; i++) w.enemies.add(0, 8.02, 1);
    w.step();
    expect(w.enemies.n).toBe(0);
    expect(w.players.n).toBe(2);
    expect(w.kills).toBe(3);
  });
  it('mobs reaching the gun line hurt the base; at zero it is lost', () => {
    const w = new World(level([], { waves: [{ t: 60, count: 1, hp: 1, over: 0 }] }));
    w.firing = false;
    w.enemies.add(0, 0.62, 3);
    w.step();
    expect(w.baseHp).toBe(BASE_HP - 3);
    w.enemies.add(0, 0.62, BASE_HP);
    w.step();
    expect(w.state).toBe('lost');
  });
  it('clearing every wave wins', () => {
    const w = new World(level([], { waves: [{ t: 0.5, count: 5, hp: 1, over: 1 }] }));
    for (let s = 0; s < 60 * 20 && w.state === 'playing'; s++) w.step();
    expect(w.state).toBe('won');
    expect(w.kills).toBe(5);
    expect(w.wavesStarted).toBe(1);
  });
  it('champion bullets are bigger', () => expect(radius(CHAMPION_HP)).toBeGreaterThan(radius(1)));
});

describe('levels', () => {
  it('is deterministic for a seed', () => {
    const run = () => {
      const w = new World(levelSpec(5), { fire: 2, shot: 1, champ: 1, boost: 0 }, 42);
      for (let s = 0; s < 60 * 20; s++) {
        w.targetX = Math.sin(s / 40) * 0.6;
        w.step();
      }
      return [w.players.n, w.enemies.n, w.kills, w.perShot, w.fireRate, w.baseHp, w.state];
    };
    expect(run()).toEqual(run());
  });
  it('generated levels are well formed: gates and waves on their own clocks', () => {
    for (let n = 1; n <= 40; n++) {
      const l = levelSpec(n);
      expect(l.waves.length).toBeGreaterThan(0);
      expect(l.gates.length).toBeGreaterThan(3);
      for (const g of l.gates) {
        expect(g.x0).toBeGreaterThanOrEqual(-1);
        expect(g.x1).toBeLessThanOrEqual(1.0001);
        expect(g.x1).toBeGreaterThan(g.x0);
      }
    }
    expect(generateLevel(9, 1)).toEqual(generateLevel(9, 1));
  });
  it('endless keeps sending bigger waves and more gates', () => {
    const counts = Array.from({ length: 12 }, (_, w) => endlessWave(w)).filter((_, w) => w % 4 !== 3);
    for (let i = 1; i < counts.length; i++) expect(counts[i].count).toBeGreaterThan(counts[i - 1].count);
    const w = new World(endlessSpec(), NO_UPGRADES, 3);
    for (let s = 0; s < 60 * 20 && w.state === 'playing'; s++) w.step();
    expect(w.kills + w.enemies.n).toBeGreaterThan(0);
    expect(w.gates.length).toBeGreaterThan(0);
  });
  it('the gun sits at the bottom', () => expect(CANNON_Z).toBeLessThan(1));
});

describe('performance', () => {
  it('60 s with 2000+ units stays fast', () => {
    const w = new World(level([], { waves: [{ t: 0, count: 1200, hp: 1, over: 60 }] }));
    for (let i = 0; i < 2200; i++) w.players.add(-0.9 + (i % 90) * 0.02, 1 + (i / 90) * 0.5, 1);
    const t0 = performance.now();
    for (let s = 0; s < 60 * 60; s++) {
      w.step();
      if (w.players.n < 2000) for (let i = 0; i < 20; i++) w.players.add(-0.9 + Math.random() * 1.8, 1, 1);
    }
    expect(performance.now() - t0).toBeLessThan(6000);
  });
});

describe('balance', () => {
  it('a player who steers well can beat levels 1–15 in order, buying upgrades as they go', () => {
    let up = { ...NO_UPGRADES };
    let coins = 0;
    for (let n = 1; n <= 15; n++) {
      let tries = 0;
      let w: World;
      do {
        tries++;
        w = playLevel(new World(levelSpec(n), up, n * 100 + tries), 200);
        coins += w.state === 'won' ? winCoins(n, w.baseHp) : lossCoins(n, w.wavesStarted / Math.max(1, w.wavesTotal));
        ({ upgrades: up, coins } = autoBuy(up, coins));
      } while (w.state !== 'won' && tries < 3);
      expect(w.state, `level ${n}`).toBe('won');
    }
  }, 60_000);
});
