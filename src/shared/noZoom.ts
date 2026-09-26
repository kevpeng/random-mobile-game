/**
 * iOS Safari ignores `user-scalable=no`, and `touch-action` doesn't reliably
 * stop double-tap zoom either. Layers, strongest first:
 *
 * 1. On the play areas (Queens board, Sort tubes), which run purely on pointer
 *    events, cancel the second touchstart of a quick double tap. That stops the
 *    zoom gesture before iOS can recognise it; pointer events still fire.
 * 2. Everywhere, cancel the second touchend of a quick double tap. That also
 *    cancels the browser's click for the tap, so we click the tapped button,
 *    label or element ourselves to keep fast repeated taps working.
 * 3. Cancel dblclick and Safari's pinch gesture events.
 */
const WINDOW_MS = 500; // comfortably longer than iOS's double-tap window
const PLAY_AREAS = '.board, .tubes-wrap';

export function preventZoom(): void {
  let lastEnd = -Infinity;
  const quick = (e: Event) => e.timeStamp - lastEnd < WINDOW_MS;

  document.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length > 1) {
        e.preventDefault(); // multi-finger: pinch
        return;
      }
      const el = e.target instanceof Element ? e.target : null;
      if (quick(e) && e.cancelable && el?.closest(PLAY_AREAS)) e.preventDefault();
    },
    { passive: false },
  );

  document.addEventListener(
    'touchend',
    (e) => {
      if (quick(e) && e.cancelable) {
        e.preventDefault();
        // The target can be an SVG icon inside a button, so match on Element.
        const el = e.target instanceof Element ? e.target : null;
        const target = el?.closest('button, label') ?? el;
        if (target instanceof HTMLElement) {
          if (!(target as HTMLButtonElement).disabled) target.click();
        } else {
          target?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
      }
      lastEnd = e.timeStamp;
    },
    { passive: false },
  );

  for (const type of ['dblclick', 'gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
}
