import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { BackButton } from '../../shared/BackButton';
import { Confetti } from '../../shared/Confetti';
import { haptic } from '../../shared/haptics';
import { sound } from '../../shared/sound';
import { Overlay, type Floater } from '../render/overlay';
import { LANE, Renderer } from '../render/renderer';
import { canUpgrade, lossCoins, UPGRADES, upgradeCost, winCoins } from '../sim/economy';
import { endlessSpec, levelSpec } from '../sim/levels';
import { BASE_HP, STEP, World } from '../sim/world';
import { addCoins, buy, levelUp, progress, recordEndless } from '../store';

type Screen = 'menu' | 'playing' | 'won' | 'lost' | 'over' | 'shop';
type Mode = 'level' | 'endless';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  s: number;
  c: [number, number, number];
  a: number;
}

const MAX_PARTICLES = 700;

export function MobGame() {
  const host = useRef<HTMLDivElement>(null);
  const glCanvas = useRef<HTMLCanvasElement>(null);
  const uiCanvas = useRef<HTMLCanvasElement>(null);
  const screen = useSignal<Screen>('menu');
  const mode = useSignal<Mode>('level');
  const hud = useSignal({ units: 0, base: BASE_HP, kills: 0 });
  const result = useSignal({ coins: 0, score: 0, best: false });
  const glError = useSignal<string | null>(null);
  const world = useRef<World | null>(null);

  const newWorld = (m: Mode) => {
    const p = progress.value;
    world.current =
      m === 'endless'
        ? new World(endlessSpec(Date.now() & 0xffff), p.upgrades, Date.now() & 0xffffffff)
        : new World(levelSpec(p.level), p.upgrades, (p.level * 7919) ^ (Date.now() & 0xffff));
  };

  const start = (m: Mode) => {
    mode.value = m;
    newWorld(m);
    screen.value = 'playing';
  };

  // --- render / simulation loop -----------------------------------------------
  useEffect(() => {
    let renderer: Renderer;
    try {
      renderer = new Renderer(glCanvas.current!);
    } catch (e) {
      glError.value = String((e as Error).message ?? e);
      return;
    }
    const overlay = new Overlay(uiCanvas.current!);
    const dark = matchMedia('(prefers-color-scheme: dark)');
    renderer.setDark(dark.matches);
    const onScheme = () => renderer.setDark(dark.matches);
    dark.addEventListener('change', onScheme);

    const fit = () => {
      const el = host.current!;
      renderer.resize(el.clientWidth, el.clientHeight);
      overlay.resize(el.clientWidth, el.clientHeight);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host.current!);

    if (!world.current) newWorld('level');
    const particles: Particle[] = [];
    const floaters: Floater[] = [];
    const gateGain = new Map<number, { gain: number; x: number; z: number; t: number }>();
    let shake = 0;
    let acc = 0;
    let last = performance.now();
    let hudT = 0;
    let soundT = 0;
    let raf = 0;

    const puff = (x: number, z: number, big: boolean, c: [number, number, number]) => {
      const k = big ? 10 : 3;
      for (let i = 0; i < k && particles.length < MAX_PARTICLES; i++) {
        particles.push({
          x, z, y: 0.08,
          vx: (Math.random() - 0.5) * 0.9,
          vy: 0.8 + Math.random() * 1.2,
          vz: (Math.random() - 0.5) * 0.9,
          life: 0.45, s: big ? 0.09 : 0.05, c, a: 0.9,
        });
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const w = world.current!;

      if (screen.value === 'playing' && !document.hidden) {
        acc += dt;
        let steps = 0;
        while (acc >= STEP && steps < 5) {
          w.step();
          acc -= STEP;
          steps++;
        }
        if (steps === 5) acc = 0; // don't spiral after a stall

        // Effects from simulation events.
        soundT -= dt;
        for (const e of w.events) {
          if (e.type === 'gate') {
            const g = gateGain.get(e.gate) ?? { gain: 0, x: e.x, z: e.z, t: 0 };
            g.gain += e.gain;
            g.x = e.x;
            gateGain.set(e.gate, g);
          } else if (e.type === 'kill') {
            puff(e.x, e.z, e.big, renderer.pal.enemy);
          } else if (e.type === 'tower') {
            shake = Math.min(1, shake + 0.05 * e.dmg);
          } else if (e.type === 'base') {
            shake = 1;
            haptic.conflict();
            sound.conflict();
          } else if (e.type === 'break') {
            haptic.tap();
          }
        }
        w.events.length = 0;
        // Batch gate gains into one floater per gate every quarter second.
        for (const [id, g] of gateGain) {
          g.t += dt;
          if (g.t >= 0.25 && g.gain > 0) {
            floaters.push({ text: `+${g.gain}`, x: g.x, z: g.z, age: 0, good: true });
            if (soundT <= 0) {
              sound.mark();
              soundT = 0.08;
            }
            haptic.tap();
            gateGain.delete(id);
          }
        }

        if (w.state !== 'playing') finish(w);
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const q = particles[i];
        q.life -= dt;
        if (q.life <= 0) {
          particles[i] = particles[particles.length - 1];
          particles.pop();
          continue;
        }
        q.vy -= 5 * dt;
        q.x += (q.vx * dt) / LANE;
        q.y = Math.max(0.02, q.y + q.vy * dt);
        q.z += q.vz * dt;
        q.a = q.life / 0.45;
      }
      for (let i = floaters.length - 1; i >= 0; i--) {
        floaters[i].age += dt;
        if (floaters[i].age > 0.9) floaters.splice(i, 1);
      }
      shake = Math.max(0, shake - dt * 3);

      renderer.render(w, { shake: shake * Math.sin(now / 16) * 3, particles });
      overlay.render(w, renderer, floaters);

      hudT += dt;
      if (hudT > 0.1) {
        hudT = 0;
        hud.value = { units: Math.round(w.players.total()), base: w.baseHp, kills: w.kills };
      }
    };
    raf = requestAnimationFrame(frame);

    const onVis = () => {
      last = performance.now();
    };
    document.addEventListener('visibilitychange', onVis);

    // Test hook (only when the page is opened with ?mobtest).
    if (location.search.includes('mobtest')) {
      (window as unknown as Record<string, unknown>).__mob = {
        world: () => world.current,
        run: (seconds: number) => {
          const w = world.current!;
          for (let s = 0; s < seconds * 60 && w.state === 'playing'; s++) w.step();
        },
      };
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      dark.removeEventListener('change', onScheme);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const finish = (w: World) => {
    const p = progress.value;
    if (w.endless) {
      const score = w.kills;
      const coins = Math.floor(score / 10);
      addCoins(coins);
      result.value = { coins, score, best: recordEndless(score) };
      screen.value = 'over';
      haptic.conflict();
      return;
    }
    if (w.state === 'won') {
      const coins = winCoins(p.level, w.baseHp);
      addCoins(coins);
      result.value = { coins, score: 0, best: false };
      levelUp();
      screen.value = 'won';
      haptic.win();
      sound.win();
    } else {
      const coins = lossCoins(p.level, 1 - w.towerHp / w.towerMax);
      addCoins(coins);
      result.value = { coins, score: 0, best: false };
      screen.value = 'lost';
      sound.conflict();
    }
  };

  // --- steering: relative horizontal drag anywhere on the play field ------------
  const drag = useRef<{ id: number; x: number; target: number } | null>(null);
  const onDown = (e: PointerEvent) => {
    const w = world.current;
    if (!w || screen.value !== 'playing') return;
    drag.current = { id: e.pointerId, x: e.clientX, target: w.targetX };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    const w = world.current;
    if (!d || !w || e.pointerId !== d.id) return;
    const width = host.current!.clientWidth;
    w.targetX = Math.max(-0.97, Math.min(0.97, d.target + ((e.clientX - d.x) / width) * 2.6));
  };
  const onUp = (e: PointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  const p = progress.value;
  const s = screen.value;
  const openShop = () => (screen.value = 'shop');

  return (
    <div class="mob">
      <div
        class="mob__stage"
        ref={host}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <canvas ref={glCanvas} class="mob__gl" />
        <canvas ref={uiCanvas} class="mob__ui" />
      </div>

      <header class="top mob__top">
        <BackButton />
        <div class="chip mob__chip">{mode.value === 'endless' && s !== 'menu' ? 'Endless' : `Level ${p.level}`}</div>
        <div class="mob__coins">🪙 {p.coins}</div>
      </header>

      {s === 'playing' && (
        <div class="mob__hud">
          <div class="mob__base" aria-label="Base health">
            <span style={{ width: `${(hud.value.base / BASE_HP) * 100}%` }} />
          </div>
          <div class="mob__count">
            {hud.value.units} units{mode.value === 'endless' ? ` · ${hud.value.kills} defeated` : ''}
          </div>
        </div>
      )}

      {glError.value && (
        <div class="mob__panel">
          <h2>Can't start the game</h2>
          <p>The 3D view couldn't start on this device ({glError.value}).</p>
        </div>
      )}

      {s === 'menu' && !glError.value && (
        <div class="mob__panel" role="dialog" aria-label="Mob">
          <h2>Level {p.level}</h2>
          <p>Drag to aim. Shoot through the good gates, avoid the red ones, and knock the tower down.</p>
          <button class="btn btn--primary" onClick={() => start('level')}>
            Play level {p.level}
          </button>
          <div class="mob__row">
            <button class="btn btn--ghost" onClick={() => start('endless')}>
              Endless{p.endlessBest ? ` · best ${p.endlessBest}` : ''}
            </button>
            <button class="btn btn--ghost" onClick={openShop}>
              Upgrades
            </button>
          </div>
        </div>
      )}

      {s === 'won' && (
        <>
          <Confetti />
          <div class="mob__panel" role="dialog" aria-label="Level cleared">
            <h2>Tower down!</h2>
            <p class="mob__reward">+{result.value.coins} 🪙</p>
            <button class="btn btn--primary" onClick={() => start('level')}>
              Next: level {p.level}
            </button>
            <button class="btn btn--ghost" onClick={openShop}>
              Upgrades
            </button>
          </div>
        </>
      )}

      {s === 'lost' && (
        <div class="mob__panel" role="dialog" aria-label="Base overrun">
          <h2>Base overrun</h2>
          <p>Upgrades help — try more fire rate or a head start.</p>
          {result.value.coins > 0 && <p class="mob__reward">+{result.value.coins} 🪙</p>}
          <button class="btn btn--primary" onClick={() => start('level')}>
            Try again
          </button>
          <button class="btn btn--ghost" onClick={openShop}>
            Upgrades
          </button>
        </div>
      )}

      {s === 'over' && (
        <div class="mob__panel" role="dialog" aria-label="Endless over">
          <h2>{result.value.best ? 'New best!' : 'Overrun'}</h2>
          <p class="mob__score">{result.value.score} defeated</p>
          <p>
            Best {p.endlessBest} · +{result.value.coins} 🪙
          </p>
          <button class="btn btn--primary" onClick={() => start('endless')}>
            Play again
          </button>
          <button class="btn btn--ghost" onClick={() => (screen.value = 'menu')}>
            Back to levels
          </button>
        </div>
      )}

      {s === 'shop' && (
        <div class="mob__panel mob__shop" role="dialog" aria-label="Upgrades">
          <h2>Upgrades</h2>
          <p class="mob__reward">🪙 {p.coins}</p>
          {UPGRADES.map((u) => {
            const lvl = p.upgrades[u.key];
            const maxed = !canUpgrade(p.upgrades, u.key);
            const cost = upgradeCost(u.key, lvl);
            return (
              <div class="mob__upgrade" key={u.key}>
                <span>
                  {u.name} <small>Lv {lvl}</small>
                  <small>{u.blurb}</small>
                </span>
                <button
                  class="btn btn--primary"
                  disabled={maxed || p.coins < cost}
                  onPointerDown={() => haptic.tap()}
                  onClick={() => buy(u.key) && sound.queen()}
                >
                  {maxed ? 'Max' : `🪙 ${cost}`}
                </button>
              </div>
            );
          })}
          <button
            class="btn btn--ghost"
            onClick={() => {
              newWorld('level');
              screen.value = 'menu';
            }}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
