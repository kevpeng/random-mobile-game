/**
 * iOS Safari ignores `user-scalable=no`, and `touch-action: manipulation`
 * doesn't stop every double-tap zoom. Cancelling the second touchend of a quick
 * double tap does. That also cancels the browser's click for that tap, so we
 * click the tapped button, label or element ourselves to keep fast repeated taps working.
 */
export function preventZoom(): void {
  let lastEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = e.timeStamp;
      if (now - lastEnd < 350 && e.cancelable) {
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
      lastEnd = now;
    },
    { passive: false },
  );
  // Pinch-zoom (Safari-only gesture events).
  for (const type of ['gesturestart', 'gesturechange']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
}
