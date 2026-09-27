import { describe, expect, it } from 'vitest';
import {
  applyPanel,
  bestFinish,
  endlessSpec,
  generateLevel,
  levelSpec,
  START_TROOPS,
  type GateRowSpec,
  type LevelSpec,
  type SquadSpec,
} from '../src/mob/sim/levels';
import { playLevel } from '../src/mob/sim/bot';
import { autoBuy, lossCoins, winCoins } from '../src/mob/sim/economy';
import { CROWD_Z, NO_UPGRADES, RUN_SPEED, World } from '../src/mob/sim/world';

const spec = (gates: GateRowSpec[], squads: SquadSpec[] = [], length = 30, towerHp = 1000): LevelSpec => ({ length, towerHp, gates, squads });
const halves = (a: string, b: string): GateRowSpec['panels'] => {
  const p = (s: string) => ({ kind: ({ '×': 'mul', '+': 'add', '÷': 'div', '−': 'sub' } as const)[s[0] as '×'], n: Number(s.slice(1)) });
  return [{ ...p(a), x0: -1, x1: 0 }, { ...p(b), x0: 0, x1: 1 }];
};
/** Runs until the track has scrolled `z` units (or the level ends). */
const runTo = (w: World, z: number) => {
  for (let s = 0; s < 60 * 120 && w.scroll < z && w.state === 'playing'; s++) w.step();
};

describe('gates change the troops you carry', () => {
  it('applies ×, +, −, ÷ to the count', () => {
    expect(applyPanel(10, { kind: 'mul', n: 3 })).toBe(30);
    expect(applyPanel(10, { kind: 'add', n: 5 })).toBe(15);
    expect(applyPanel(10, { kind: 'sub', n: 4 })).toBe(6);
    expect(applyPanel(10, { kind: 'sub', n: 40 })).toBe(0);
    expect(applyPanel(11, { kind: 'div', n: 2 })).toBe(5);
  });
  for (const [label, left, right, want] of [
    ['×2', '×2', '+3', 20],
    ['÷2', '÷2', '+3', 5],
    ['−4', '−4', '+3', 6],
  ] as const) {
    it(`running through ${label} on the left gives ${want}`, () => {
      const w = new World(spec([{ z: 6, panels: halves(left, right) }]));
      w.targetX = w.crowdX = -0.5;
      runTo(w, 6);
      expect(w.troops).toBe(want);
    });
  }
  it('the other side of the row gets the other panel, and each row applies once', () => {
    const w = new World(spec([{ z: 6, panels: halves('×2', '+3') }, { z: 9, panels: halves('+1', '+1') }]));
    w.targetX = w.crowdX = 0.5;
    runTo(w, 12);
    expect(w.troops).toBe(START_TROOPS + 3 + 1);
  });
  it('gates scroll toward and past the crowd at run speed', () => {
    const w = new World(spec([{ z: 6, panels: halves('×2', '+3') }]));
    const z0 = w.gates[0].z;
    for (let s = 0; s < 60; s++) w.step();
    expect(z0 - w.gates[0].z).toBeCloseTo(RUN_SPEED, 1);
    runTo(w, 10);
    expect(w.gates[0].z).toBeLessThan(CROWD_Z);
  });
});

describe('squads', () => {
  it('trade 1:1 with your troops, pausing the run while you fight', () => {
    const w = new World(spec([], [{ z: 6, x: 0, half: 1.2, count: 4, hp: 1 }]));
    for (let s = 0; s < 60 * 5 && w.phase !== 'fight'; s++) w.step();
    expect(w.phase).toBe('fight');
    const at = w.scroll;
    for (let s = 0; s < 120; s++) w.step();
    expect(w.troops).toBe(START_TROOPS - 4);
    expect(w.kills).toBe(4);
    expect(w.phase).toBe('run');
    expect(w.scroll).toBeGreaterThan(at);
  });
  it('can be dodged when they only block part of the lane', () => {
    const w = new World(spec([], [{ z: 6, x: -0.6, half: 0.35, count: 30, hp: 1 }]));
    w.targetX = w.crowdX = 0.6;
    runTo(w, 12);
    expect(w.troops).toBe(START_TROOPS);
    expect(w.state).toBe('playing');
  });
  it('wipe you out if they outnumber you', () => {
    const w = new World(spec([], [{ z: 6, x: 0, half: 1.2, count: 30, hp: 1 }]));
    runTo(w, 12);
    expect(w.state).toBe('lost');
    expect(w.troops).toBe(0);
  });
});

describe('the base', () => {
  it('the crowd stops at the base and charges: enough troops win', () => {
    const w = new World(spec([], [], 12, 8));
    for (let s = 0; s < 60 * 20 && w.state === 'playing'; s++) w.step();
    expect(w.state).toBe('won');
    expect(w.troops).toBe(START_TROOPS - 8);
  });
  it('too few troops lose', () => {
    const w = new World(spec([], [], 12, 25));
    for (let s = 0; s < 60 * 20 && w.state === 'playing'; s++) w.step();
    expect(w.state).toBe('lost');
    expect(w.towerHp).toBe(25 - START_TROOPS);
  });
});

describe('levels', () => {
  it('is deterministic for a seed', () => {
    const run = () => {
      const w = new World(levelSpec(5), NO_UPGRADES, 42);
      for (let s = 0; s < 60 * 30; s++) {
        w.targetX = Math.sin(s / 40) * 0.6;
        w.step();
      }
      return [w.troops, w.kills, w.towerHp, w.scroll, w.state];
    };
    expect(run()).toEqual(run());
  });
  it('generated levels are well formed and survivable with perfect play', () => {
    for (let n = 1; n <= 40; n++) {
      const l = levelSpec(n);
      expect(l.towerHp).toBeGreaterThan(0);
      for (const r of l.gates) {
        expect(r.z).toBeLessThan(l.length - 2);
        for (const p of r.panels) expect(p.x1).toBeGreaterThan(p.x0);
      }
      expect(bestFinish(l, START_TROOPS), `level ${n}`).toBeGreaterThan(l.towerHp);
    }
    expect(generateLevel(9, 1)).toEqual(generateLevel(9, 1));
  });
  it('endless keeps laying track and eventually overwhelms you', () => {
    const w = new World(endlessSpec(), NO_UPGRADES, 3);
    const w2 = playLevel(w, 600);
    expect(w2.state).toBe('lost');
    expect(w2.scroll).toBeGreaterThan(40);
  });
});

describe('balance', () => {
  it('a player who picks well can beat levels 1–15 in order, buying upgrades as they go', () => {
    let up = { ...NO_UPGRADES };
    let coins = 0;
    for (let n = 1; n <= 15; n++) {
      let tries = 0;
      let w: World;
      do {
        tries++;
        w = playLevel(new World(levelSpec(n), up, n * 100 + tries), 200);
        coins += w.state === 'won' ? winCoins(n, w.troops) : lossCoins(n, 1 - w.towerHp / w.towerMax);
        ({ upgrades: up, coins } = autoBuy(up, coins));
      } while (w.state !== 'won' && tries < 3);
      expect(w.state, `level ${n}`).toBe('won');
      expect(w.time, `level ${n} length`).toBeLessThan(90);
    }
  }, 60_000);
});
