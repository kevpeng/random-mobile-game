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

type Pos = { x: number; y: number; stack: number };

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

  // Target position of every piece.
  const pos = new Map<number, Pos>();
  if (L) {
    st.forEach((ids, s) => {
      const t = L.tubes[s];
      const lifted = sel === s ? topRun(cs[s]) : 0;
      const liftBy = lifted ? t.y + L.tubeH - L.pad - ids.length * L.step - (t.y - L.d - L.tubeW * 0.1) : 0;
      ids.forEach((id, j) => {
        const y = t.y + L.tubeH - L.pad - (j + 1) * L.step + (L.step - L.d) / 2;
        pos.set(id, {
          x: t.x + (L.tubeW - L.d) / 2,
          y: j >= ids.length - lifted ? y - liftBy : y,
          stack: s,
        });
      });
    });
  }

  // Animate pieces from where they were to where they are now (FLIP with WAAPI).
  useLayoutEffect(() => {
    if (!L) return;
    const fresh = lastPuzzle.current !== p;
    lastPuzzle.current = p;
    let order = 0;
    for (const [id, to] of pos) {
      const el = pieceEls.current.get(id);
      const from = lastPos.current.get(id);
      lastPos.current.set(id, to);
      if (!el || !from || fresh || (from.x === to.x && from.y === to.y)) continue;
      const running = el.getAnimations();
      const start = running.length ? getComputedStyle(el).transform : `translate(${from.x}px, ${from.y}px)`;
      running.forEach((a) => a.cancel());
      const end = `translate(${to.x}px, ${to.y}px)`;
      if (from.stack !== to.stack) {
        // Arc: rise over the destination tube, then drop in.
        const peak = Math.min(from.y, L.tubes[to.stack].y - L.d - L.tubeW * 0.1) - order * 2;
        el.animate(
          [
            { transform: start },
            { transform: `translate(${to.x}px, ${peak}px)`, offset: 0.55 },
            { transform: end },
          ],
          { duration: 300, delay: order * 28, easing: 'cubic-bezier(.3,.7,.35,1)', fill: 'backwards' },
        );
        order++;
      } else {
        el.animate([{ transform: start }, { transform: end }], {
          duration: 170,
          easing: 'cubic-bezier(.34,1.45,.64,1)',
        });
      }
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
