/**
 * iOS Safari ignores `user-scalable=no`, and neither `touch-action` nor
 * cancelling only the second tap reliably stops double-tap zoom. So we take
 * over touch entirely: every touchstart is cancelled, which leaves iOS no
 * gesture to zoom, scroll or long-press on. Pointer events (used by the Queens
 * board and Sort tubes) still fire as normal.
 *
 * Cancelling touchstart also cancels the browser's click, so we make our own:
 * when a touch lifts without having moved, we click the tapped button, label
 * or element. Scrollable areas (the menu sheet) are left alone so they can
 * scroll; there only a quick second tap is cancelled and re-clicked.
 *
 * Because :active styles depend on the native touch, pressed elements get an
 * `is-pressed` class while a finger is down.
 */
const SCROLLABLE = '.sheet';
const DOUBLE_TAP_MS = 500;
const MOVE_SLOP = 10;

function clickTarget(target: EventTarget | null): void {
  // The target can be an SVG icon inside a button, so match on Element.
  const el = target instanceof Element ? target : null;
  const t = el?.closest('button, label') ?? el;
  if (t instanceof HTMLElement) {
    if (!(t as HTMLButtonElement).disabled) t.click();
  } else {
    t?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }
}

export function preventZoom(): void {
  let start: { x: number; y: number; target: EventTarget | null; owned: boolean } | null = null;
  let lastEnd = -Infinity;
  let pressed: Element | null = null;

  const release = () => {
    pressed?.classList.remove('is-pressed');
    pressed = null;
  };

  document.addEventListener(
    'touchstart',
    (e) => {
      const el = e.target instanceof Element ? e.target : null;
      const inScroller = !!el?.closest(SCROLLABLE);
      const quick = e.timeStamp - lastEnd < DOUBLE_TAP_MS;
      // Own the touch unless it's a single finger in a scroller (so it can scroll).
      const owned = e.touches.length > 1 || !inScroller || quick;
      if (owned && e.cancelable) e.preventDefault();
      const t = e.touches[0];
      start = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY, target: e.target, owned } : null;
      release();
      pressed = el?.closest('button, label, .game-card') ?? null;
      pressed?.classList.add('is-pressed');
    },
    { passive: false, capture: true },
  );

  document.addEventListener(
    'touchmove',
    (e) => {
      const t = e.touches[0];
      if (start && t && Math.hypot(t.clientX - start.x, t.clientY - start.y) > MOVE_SLOP) {
        release();
        if (!start.owned) start = null; // it's a scroll
      }
    },
    { passive: true, capture: true },
  );

  document.addEventListener(
    'touchend',
    (e) => {
      const s = start;
      start = null;
      release();
      const t = e.changedTouches[0];
      const still = s && t && Math.hypot(t.clientX - s.x, t.clientY - s.y) <= MOVE_SLOP;
      // Owned touches (everything outside scrollers, plus quick second taps inside
      // them) never get a native click, so a tap that didn't move gets ours.
      if (s?.owned) {
        if (e.cancelable) e.preventDefault();
        if (still) clickTarget(s.target);
      }
      lastEnd = e.timeStamp;
    },
    { passive: false, capture: true },
  );

  document.addEventListener('touchcancel', () => {
    start = null;
    release();
  });

  for (const type of ['dblclick', 'gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }

  snapBackZoom();
}

/**
 * Last resort: if the page gets zoomed anyway, re-apply the viewport so iOS
 * snaps back to 1×. Changing the meta content makes Safari re-evaluate it.
 */
function snapBackZoom(): void {
  const vv = window.visualViewport;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!vv || !meta) return;
  const base = meta.content;
  let pending = false;
  vv.addEventListener('resize', () => {
    if (vv.scale <= 1.01 || pending) return;
    pending = true;
    meta.content = base.replace('maximum-scale=1', 'maximum-scale=1.0');
    requestAnimationFrame(() => {
      meta.content = base;
      pending = false;
    });
  });
}
