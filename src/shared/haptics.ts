import { shared } from './settings';

/**
 * iOS Safari has no navigator.vibrate, but toggling a native
 * <input type="checkbox" switch> (iOS 18+) plays the system tick haptic —
 * only while handling a real user gesture. Game state updates on pointerdown
 * (so moves feel instant), but there a haptic call only *requests* a tick:
 *
 * - it's played during the tap's `click` event (the most reliable moment), or
 * - for drags, which never produce a click, when the finger lifts.
 *
 * Elsewhere we use navigator.vibrate patterns directly.
 */
export const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

let pending = false;
let pendingAt = 0;
let start: { x: number; y: number } | null = null;

/** Plays one system tick right now (must be inside a user gesture). */
export function tickNow(): void {
  // A fresh, non-rendered switch each time, as in the known-working iOS 18 approach.
  const label = document.createElement('label');
  label.ariaHidden = 'true';
  label.style.display = 'none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.appendChild(input);
  document.head.appendChild(label);
  label.click();
  label.remove();
}

function play(): void {
  if (!pending) return;
  pending = false;
  tickNow();
}

function pulse(count: number, gap = 70): void {
  if (!shared.value.haptics) return;
  if (canVibrate) {
    const pattern: number[] = [];
    for (let i = 0; i < count; i++) pattern.push(12, gap);
    navigator.vibrate(pattern);
    return;
  }
  // iOS plays at most one tick per gesture, so every pattern becomes one tick.
  pending = true;
  pendingAt = performance.now();
}

/** Installs the listeners that play requested ticks on iOS. */
export function initHaptics(): void {
  if (canVibrate) return;
  const opts = { capture: true, passive: true };
  document.addEventListener(
    'touchstart',
    (e) => {
      // pointerdown (which may request a tick) fires just before touchstart; anything
      // older came from an earlier gesture that never produced a click, so drop it.
      if (pending && performance.now() - pendingAt > 100) pending = false;
      const t = e.touches[0];
      start = t ? { x: t.clientX, y: t.clientY } : null;
    },
    opts,
  );
  document.addEventListener('click', play, opts);
  document.addEventListener(
    'touchend',
    (e) => {
      // Taps get their tick from the click that follows; drags never click.
      const t = e.changedTouches[0];
      if (start && t && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) play();
    },
    opts,
  );
}

export const haptic = {
  tap: () => pulse(1),
  conflict: () => pulse(2, 90),
  success: () => pulse(2, 60),
  win: () => pulse(4, 110),
};
