/**
 * iOS Safari ignores `user-scalable=no`, and `touch-action: manipulation`
 * doesn't stop every double-tap zoom. Cancelling the second touchend of a quick
 * double tap does. That also cancels the browser's click for that tap, so we
 * click the button or label ourselves to keep fast repeated taps working.
 */
export function preventZoom(): void {
  let lastEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = e.timeStamp;
      if (now - lastEnd < 350 && e.cancelable) {
        e.preventDefault();
        const target = e.target instanceof Element ? e.target.closest<HTMLElement>('button, label') : null;
        if (target && !(target as HTMLButtonElement).disabled) target.click();
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
