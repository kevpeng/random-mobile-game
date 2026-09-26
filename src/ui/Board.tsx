import { useMemo, useRef } from 'preact/hooks';
import { EMPTY, QUEEN, X } from '../game/types';
import {
  beginGesture,
  blockedCells,
  conflictCells,
  endGesture,
  marks,
  puzzle,
  setCell,
  won,
} from '../state/store';
import { haptic } from './haptics';
import { Crown, Cross } from './icons';
import { sound } from './sound';

type Mode = 'paint' | 'erase' | 'pending';

interface Drag {
  pointerId: number;
  start: number;
  last: number;
  mode: Mode;
  rect: DOMRect;
}

/** Inset shadows draw thick lines wherever a neighbour belongs to another region. */
function regionEdges(n: number, regions: number[]): string[] {
  return regions.map((g, i) => {
    const r = Math.floor(i / n), c = i % n;
    const w = 'var(--edge-w)';
    const parts: string[] = [];
    if (r > 0 && regions[i - n] !== g) parts.push(`inset 0 ${w} 0 var(--edge)`);
    if (r < n - 1 && regions[i + n] !== g) parts.push(`inset 0 calc(-1 * ${w}) 0 var(--edge)`);
    if (c > 0 && regions[i - 1] !== g) parts.push(`inset ${w} 0 0 var(--edge)`);
    if (c < n - 1 && regions[i + 1] !== g) parts.push(`inset calc(-1 * ${w}) 0 0 var(--edge)`);
    return parts.join(',') || 'none';
  });
}

export function Board() {
  const p = puzzle.value;
  const drag = useRef<Drag | null>(null);
  const edges = useMemo(() => (p ? regionEdges(p.size, p.regions) : []), [p]);
  if (!p) return <div class="board board--loading" />;

  const n = p.size;
  const m = marks.value;
  const bad = conflictCells.value;
  const auto = blockedCells.value;
  const isWon = won.value;

  const cellAt = (d: Drag, x: number, y: number): number => {
    const c = Math.floor(((x - d.rect.left) / d.rect.width) * n);
    const r = Math.floor(((y - d.rect.top) / d.rect.height) * n);
    return r < 0 || r >= n || c < 0 || c >= n ? -1 : r * n + c;
  };

  const feedback = (mark: number) => {
    haptic.tap();
    if (mark === QUEEN) sound.queen();
    else sound.mark();
  };

  const onDown = (e: PointerEvent) => {
    if (drag.current || isWon) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const d: Drag = { pointerId: e.pointerId, start: -1, last: -1, mode: 'paint', rect };
    const i = cellAt(d, e.clientX, e.clientY);
    if (i < 0) return;
    el.setPointerCapture(e.pointerId);
    d.start = d.last = i;
    beginGesture();
    const cur = marks.value[i];
    if (cur === EMPTY) {
      setCell(i, X);
      feedback(X);
    } else if (cur === QUEEN) {
      setCell(i, EMPTY);
      d.mode = 'erase';
      feedback(EMPTY);
    } else {
      // ✕: a tap turns it into a queen, a drag erases ✕s. Decide on move/up.
      d.mode = 'pending';
    }
    drag.current = d;
  };

  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    // Coalesced events keep fast swipes from skipping cells.
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ev of events.length ? events : [e]) {
      const i = cellAt(d, ev.clientX, ev.clientY);
      if (i < 0 || i === d.last) continue;
      d.last = i;
      if (d.mode === 'pending') {
        d.mode = 'erase';
        setCell(d.start, EMPTY);
      }
      const cur = marks.value[i];
      if (d.mode === 'paint' && cur === EMPTY) {
        setCell(i, X);
        feedback(X);
      } else if (d.mode === 'erase' && cur === X) {
        setCell(i, EMPTY);
        feedback(EMPTY);
      }
    }
  };

  const onUp = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    if (d.mode === 'pending' && e.type === 'pointerup') {
      setCell(d.start, QUEEN);
      feedback(QUEEN);
    }
    const result = endGesture();
    if (result === 'win') {
      haptic.win();
      sound.win();
    } else if (result === 'conflict' && d.mode === 'pending') {
      haptic.conflict();
      sound.conflict();
    }
  };

  return (
    <div
      class={`board${isWon ? ' board--won' : ''}`}
      style={{ '--n': n }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
      role="grid"
      aria-label={`${n} by ${n} Queens board`}
    >
      {m.map((mark, i) => {
        const cls =
          'cell' +
          (bad.has(i) ? ' cell--bad' : '') +
          (mark === EMPTY && auto[i] ? ' cell--auto' : '');
        return (
          <div
            key={i}
            class={cls}
            data-i={i}
            style={{ background: `var(--r${p.regions[i]})`, boxShadow: edges[i] }}
          >
            {mark === QUEEN ? (
              <span class="piece queen" style={{ '--d': `${Math.floor(i / n) * 60}ms` }} key="q">
                <Crown />
              </span>
            ) : mark === X || (mark === EMPTY && auto[i]) ? (
              <span class={`piece x${mark === X ? '' : ' x--auto'}`} key="x">
                <Cross />
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
