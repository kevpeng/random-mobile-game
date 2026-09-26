import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { haptic } from '../../shared/haptics';
import { sound } from '../../shared/sound';
import { isComplete, moveCount, topRun } from '../game';
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
const MOTION = { lift: 120, rise: 90, slide: 150, drop: 120, glide: 110 };
/** Finger travel (px) before a press on a tube becomes a drag. */
const DRAG_SLOP = 8;

interface DragState {
  pointerId: number;
  src: number;
  ids: number[]; // the lifted run, top first
  startX: number;
  startY: number;
  grabX: number; // finger offset from the top ball's corner
  grabY: number;
  active: boolean;
  at: Map<number, { x: number; y: number }>; // current dragged positions
}
const FLIGHT_SCALE = 1.06;
const EASE = {
  out: 'cubic-bezier(.2,.8,.3,1)',
  inOut: 'cubic-bezier(.45,0,.25,1)',
  drop: 'cubic-bezier(.4,0,.6,1)',
};

/** Runs a move animation with the ball drawn above resting balls until it lands. */
function fly(el: HTMLElement, frames: Keyframe[], duration: number): void {
  el.style.zIndex = '2';
  const anim = el.animate(frames, { duration, easing: 'linear' });
  const settle = () => {
    if (!el.getAnimations().length) el.style.zIndex = '';
  };
  anim.onfinish = settle;
  anim.oncancel = settle;
}

export function Tubes() {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const pieceEls = useRef(new Map<number, HTMLElement>());
  const lastPos = useRef(new Map<number, Pos>());
  const lastPuzzle = useRef<unknown>(null);
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  /** Set when the next layout change comes from releasing a drag. */
  const fromDrag = useRef(false);
  const [hover, setHover] = useState<number | null>(null);
  const impl = useRef({ move: (_: PointerEvent) => {}, end: (_: PointerEvent) => {} });
  const listeners = useRef({
    move: (e: PointerEvent) => impl.current.move(e),
    end: (e: PointerEvent) => impl.current.end(e),
  }).current;
  const removeListeners = () => {
    window.removeEventListener('pointermove', listeners.move);
    window.removeEventListener('pointerup', listeners.end);
    window.removeEventListener('pointercancel', listeners.end);
  };
  useLayoutEffect(() => removeListeners, []);

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
    const released = fromDrag.current;
    fromDrag.current = false;
    for (const [id, to] of pos) {
      const el = pieceEls.current.get(id);
      const from = lastPos.current.get(id);
      lastPos.current.set(id, to);
      if (!el || !from || fresh || (from.x === to.x && from.y === to.y)) continue;
      const running = el.getAnimations();
      const start = running.length ? getComputedStyle(el).transform : tr(from.x, from.y);
      running.forEach((a) => a.cancel());
      const end = tr(to.x, to.y);
      el.style.transform = end; // the drag may have set it directly

      if (released) {
        // From wherever the finger let go: glide to just above the tube, drop in.
        const above = `${tr(to.x, railY(to.stack, to.k))} scale(${FLIGHT_SCALE})`;
        const total = MOTION.glide + MOTION.drop;
        fly(
          el,
          [
            { transform: start, easing: EASE.inOut, offset: 0 },
            { transform: above, easing: EASE.drop, offset: MOTION.glide / total },
            { transform: end, offset: 1 },
          ],
          total,
        );
        continue;
      }

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
      fly(el, frames, total);
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
    if (r === 'blocked') shake(i);
  };

  const shake = (i: number) => {
    const el = wrap.current?.querySelector<HTMLElement>(`[data-tube="${i}"]`);
    el?.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }],
      { duration: 220, easing: 'ease-out' },
    );
  };

  // --- drag and drop ------------------------------------------------------------
  // A press behaves exactly like a tap (it lifts the run, or drops a lifted run
  // onto this tube). If the finger then moves, the lifted run follows it, and
  // letting go over a tube drops it there.

  /** Tube under a point in board coordinates, with forgiving edges. */
  const tubeAt = (x: number, y: number): number => {
    if (!L) return -1;
    const pad = 6;
    let best = -1;
    let bestDist = Infinity;
    L.tubes.forEach((t, s) => {
      const top = t.y - L.head;
      if (y < top - pad || y > t.y + L.tubeH + pad) return;
      const cx = t.x + L.tubeW / 2;
      const dist = Math.abs(x - cx);
      if (dist <= L.tubeW / 2 + 8 && dist < bestDist) {
        best = s;
        bestDist = dist;
      }
    });
    return best;
  };

  const local = (e: PointerEvent) => {
    const r = board.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPress = (e: PointerEvent, s: number) => {
    e.preventDefault();
    if (drag.current) return;
    onTap(s);
    // Only a press that leaves this tube lifted can turn into a drag.
    if (selected.value !== s || !L) return;
    const ids = stacks.value[s].slice(-topRun(colorStacks.value[s])).reverse();
    const pt = local(e);
    drag.current = {
      pointerId: e.pointerId,
      src: s,
      ids,
      startX: pt.x,
      startY: pt.y,
      // Keep the lifted run exactly where it is relative to the finger: no jump.
      grabX: pt.x - xOf(s),
      grabY: pt.y - railY(s, 0),
      active: false,
      at: new Map(),
    };
    window.addEventListener('pointermove', listeners.move);
    window.addEventListener('pointerup', listeners.end);
    window.addEventListener('pointercancel', listeners.end);
  };

  const onDragMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId || !L) return;
    const pt = local(e);
    if (!d.active) {
      if (Math.hypot(pt.x - d.startX, pt.y - d.startY) < DRAG_SLOP) return;
      d.active = true;
    }
    d.ids.forEach((id, k) => {
      const el = pieceEls.current.get(id);
      if (!el) return;
      el.getAnimations().forEach((a) => a.cancel());
      const x = pt.x - d.grabX;
      const y = pt.y - d.grabY + k * L.step;
      d.at.set(id, { x, y });
      el.style.zIndex = '3';
      el.style.transform = `translate(${x}px, ${y}px) scale(${FLIGHT_SCALE})`;
    });
    const t = tubeAt(pt.x, pt.y);
    const target = t >= 0 && t !== d.src && moveCount(colorStacks.value, d.src, t, cap) > 0 ? t : null;
    setHover(target);
  };

  // Window listeners must be the same functions on add and remove, but the
  // handlers close over this render's layout, so route through a ref.
  impl.current = { move: onDragMove, end: (e: PointerEvent) => onDragEnd(e) };

  const onDragEnd = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    removeListeners();
    setHover(null);
    if (!d.active) return; // it was a tap; already handled on press

    // Animate from where the balls are now.
    for (const [id, at] of d.at) {
      const prev = lastPos.current.get(id);
      if (prev) lastPos.current.set(id, { ...prev, ...at });
      const el = pieceEls.current.get(id);
      if (el) el.style.zIndex = '';
    }
    fromDrag.current = true;
    const pt = local(e);
    const t = e.type === 'pointerup' ? tubeAt(pt.x, pt.y) : -1;
    if (t >= 0 && t !== d.src && moveCount(colorStacks.value, d.src, t, cap) > 0) {
      onTap(t); // same move (and feedback) as tapping the target
    } else {
      selected.value = null; // back into the source tube
      if (t >= 0 && t !== d.src) {
        haptic.conflict();
        shake(t);
      } else {
        haptic.tap();
      }
    }
  };

  return (
    <div class="tubes-wrap" ref={wrap}>
      {L && p && (
        <div
          ref={board}
          class={`tubes${won.value ? ' tubes--won' : ''}`}
          style={{ width: L.width, height: L.height }}
        >
          {st.map((_, s) => {
            const t = L.tubes[s];
            const done = isComplete(cs[s], cap);
            const hinted = hm && hm !== 'stuck' && (hm[0] === s || hm[1] === s);
            return (
              <div
                key={s}
                data-tube={s}
                class={`tube${done ? ' tube--done' : ''}${sel === s ? ' tube--sel' : ''}${hinted ? ' tube--hint' : ''}${hover === s ? ' tube--target' : ''}`}
                style={{
                  left: t.x,
                  top: t.y - L.head,
                  width: L.tubeW,
                  height: L.head + L.tubeH,
                  '--head': `${L.head}px`,
                  '--done': done ? `var(--c${cs[s][0]})` : 'transparent',
                }}
                onPointerDown={(e) => onPress(e, s)}
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
