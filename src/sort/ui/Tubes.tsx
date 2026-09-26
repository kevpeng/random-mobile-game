import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { haptic } from '../../shared/haptics';
import { sound } from '../../shared/sound';
import { isComplete, topRun } from '../game';
import { colorStacks, hintMove, puzzle, selected, stacks, tapStack, won } from '../store';

interface Layout {
  tubeW: number;
  tubeH: number;
  d: number; // piece diameter
  step: number; // vertical distance between piece slots
  pad: number;
  head: number; // headroom above each tube for lifted pieces
  tubes: { x: number; y: number }[]; // top-left of each tube body
  width: number;
  height: number;
}

function computeLayout(n: number, cap: number, W: number, H: number): Layout {
  const rows = n <= 6 ? 1 : 2;
  const cols = Math.ceil(n / rows);
  const gapX = 10, gapY = 18;
  // Solve for tube width limited by both the available width and height.
  const byW = (W - gapX * (cols - 1)) / cols;
  // Height of one row as a function of tube width w: head(0.95w) + tube(cap*0.86w + 0.3w)
  const rowPerW = 0.95 + cap * 0.86 + 0.3;
  const byH = (H - gapY * (rows - 1)) / rows / rowPerW;
  const tubeW = Math.max(28, Math.min(byW, byH, 76));
  const d = tubeW * 0.78;
  const step = tubeW * 0.86;
  const pad = tubeW * 0.15;
  const head = tubeW * 0.95;
  const tubeH = cap * step + pad * 2;
  const rowH = head + tubeH;
  const tubes: Layout['tubes'] = [];
  const width = cols * tubeW + (cols - 1) * gapX;
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const inRow = r === rows - 1 ? n - cols * (rows - 1) : cols;
    const rowW = inRow * tubeW + (inRow - 1) * gapX;
    const c = i % cols;
    tubes.push({ x: (width - rowW) / 2 + c * (tubeW + gapX), y: r * (rowH + gapY) + head });
  }
  return { tubeW, tubeH, d, step, pad, head, tubes, width, height: rows * rowH + (rows - 1) * gapY };
}

type Pos = { x: number; y: number; stack: number; k: number; up: boolean };

/** Motion timings (ms) — fixed, so every move feels the same. */
const MOTION = { lift: 120, rise: 90, slide: 150, drop: 120 };
const FLIGHT_SCALE = 1.06;
const EASE = {
  out: 'cubic-bezier(.2,.8,.3,1)',
  inOut: 'cubic-bezier(.45,0,.25,1)',
  drop: 'cubic-bezier(.4,0,.6,1)',
};

export function Tubes() {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const pieceEls = useRef(new Map<number, HTMLElement>());
  const lastPos = useRef(new Map<number, Pos>());
  const lastPuzzle = useRef<unknown>(null);

  useLayoutEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const p = puzzle.value;
  const st = stacks.value;
  const cs = colorStacks.value;
  const sel = selected.value;
  const hm = hintMove.value;
  const cap = p?.config.height ?? 4;
  const L = p && size.w ? computeLayout(st.length, cap, size.w, size.h) : null;

  // Geometry helpers. Lifted balls hang at a fixed "rail" height above their tube.
  const xOf = (s: number) => L!.tubes[s].x + (L!.tubeW - L!.d) / 2;
  const restY = (s: number, j: number) =>
    L!.tubes[s].y + L!.tubeH - L!.pad - (j + 1) * L!.step + (L!.step - L!.d) / 2;
  const railY = (s: number, k: number) => L!.tubes[s].y - L!.d - L!.tubeW * 0.12 + k * L!.step;

  // Target position of every piece; k = its index from the top of its stack.
  const pos = new Map<number, Pos>();
  if (L) {
    st.forEach((ids, s) => {
      const lifted = sel === s ? topRun(cs[s]) : 0;
      ids.forEach((id, j) => {
        const k = ids.length - 1 - j;
        const up = k < lifted;
        pos.set(id, { x: xOf(s), y: up ? railY(s, k) : restY(s, j), stack: s, k, up });
      });
    });
  }

  // Animate pieces from where they were to where they are now (FLIP with WAAPI).
  // Every move uses the same path and timing: rise to the rail (if not already
  // there), slide straight across, drop straight in. A run moves as one unit.
  useLayoutEffect(() => {
    if (!L) return;
    const fresh = lastPuzzle.current !== p;
    lastPuzzle.current = p;
    const tr = (x: number, y: number) => `translate(${x}px, ${y}px)`;
    for (const [id, to] of pos) {
      const el = pieceEls.current.get(id);
      const from = lastPos.current.get(id);
      lastPos.current.set(id, to);
      if (!el || !from || fresh || (from.x === to.x && from.y === to.y)) continue;
      const running = el.getAnimations();
      const start = running.length ? getComputedStyle(el).transform : tr(from.x, from.y);
      running.forEach((a) => a.cancel());
      const end = tr(to.x, to.y);

      if (from.stack === to.stack) {
        // Lift or set down in place.
        el.animate([{ transform: start }, { transform: end }], {
          duration: MOTION.lift,
          easing: to.up ? EASE.out : EASE.inOut,
        });
        continue;
      }
      // Slide along the higher of the two rails (matters when crossing rows):
      // straight up, straight across, straight down.
      const rail = Math.min(railY(from.stack, to.k), railY(to.stack, to.k));
      // Slightly larger while in flight, so passing over other tubes reads as "above".
      const railFrom = `${tr(from.x, rail)} scale(${FLIGHT_SCALE})`;
      const railTo = `${tr(to.x, rail)} scale(${FLIGHT_SCALE})`;
      const rise = from.up && Math.abs(from.y - rail) < 0.5 ? 0 : MOTION.rise;
      const total = rise + MOTION.slide + MOTION.drop;
      const frames: Keyframe[] = [];
      if (rise) {
        frames.push({ transform: start, easing: EASE.out, offset: 0 });
        frames.push({ transform: railFrom, easing: EASE.inOut, offset: rise / total });
      } else {
        frames.push({ transform: start, easing: EASE.inOut, offset: 0 });
      }
      frames.push({ transform: railTo, easing: EASE.drop, offset: (rise + MOTION.slide) / total });
      frames.push({ transform: end, offset: 1 });
      el.style.zIndex = '2'; // fly above resting balls
      const anim = el.animate(frames, { duration: total, easing: 'linear' });
      const settle = () => {
        if (!el.getAnimations().length) el.style.zIndex = '';
      };
      anim.onfinish = settle;
      anim.oncancel = settle;
    }
  });

  const onTap = (i: number) => {
    const r = tapStack(i);
    switch (r) {
      case 'lift':
      case 'switch':
        haptic.tap();
        sound.mark();
        break;
      case 'drop':
        haptic.tap();
        break;
      case 'move':
        haptic.tap();
        sound.queen();
        break;
      case 'complete':
        haptic.success();
        sound.queen();
        break;
      case 'win':
        haptic.win();
        sound.win();
        break;
      case 'blocked':
        haptic.conflict();
        break;
      case 'stuck':
        haptic.conflict();
        sound.conflict();
        break;
    }
    if (r === 'blocked') {
      const el = wrap.current?.querySelector<HTMLElement>(`[data-tube="${i}"]`);
      el?.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }],
        { duration: 220, easing: 'ease-out' },
      );
    }
  };

  return (
    <div class="tubes-wrap" ref={wrap}>
      {L && p && (
        <div class={`tubes${won.value ? ' tubes--won' : ''}`} style={{ width: L.width, height: L.height }}>
          {st.map((_, s) => {
            const t = L.tubes[s];
            const done = isComplete(cs[s], cap);
            const hinted = hm && hm !== 'stuck' && (hm[0] === s || hm[1] === s);
            return (
              <div
                key={s}
                data-tube={s}
                class={`tube${done ? ' tube--done' : ''}${sel === s ? ' tube--sel' : ''}${hinted ? ' tube--hint' : ''}`}
                style={{
                  left: t.x,
                  top: t.y - L.head,
                  width: L.tubeW,
                  height: L.head + L.tubeH,
                  '--head': `${L.head}px`,
                  '--done': done ? `var(--c${cs[s][0]})` : 'transparent',
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onTap(s);
                }}
              >
                <div class="tube__body" />
              </div>
            );
          })}
          {[...pos].map(([id, q]) => (
            <div
              key={id}
              data-id={id}
              class="ball"
              ref={(el) => {
                if (el) pieceEls.current.set(id, el);
                else pieceEls.current.delete(id);
              }}
              style={{
                width: L.d,
                height: L.d,
                transform: `translate(${q.x}px, ${q.y}px)`,
                background: `var(--c${p.colors[id]})`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
