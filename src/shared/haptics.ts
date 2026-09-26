import { shared } from './settings';

/**
 * iOS Safari has no navigator.vibrate, but toggling a native
 * <input type="checkbox" switch> (iOS 18+) plays the system tick haptic.
 * WebKit only allows that during a user activation, which for touch means
 * touchend, not pointerdown. So on iOS a haptic call only *requests* a tick,
 * and one document-level touchend listener plays it when the finger lifts.
 * Game state still updates on pointerdown, so moves stay instant.
 *
 * Elsewhere we use navigator.vibrate patterns directly.
 */
let label: HTMLLabelElement | null = null;
let pending = false;

function iosSwitch(): HTMLLabelElement {
  if (!label) {
    label = document.createElement('label');
    label.ariaHidden = 'true';
    label.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
  }
  return label;
}

const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

function pulse(count: number, gap = 70): void {
  if (!shared.value.haptics) return;
  if (canVibrate) {
    const pattern: number[] = [];
    for (let i = 0; i < count; i++) pattern.push(12, gap);
    navigator.vibrate(pattern);
    return;
  }
  // iOS plays at most one tick per activation, so every pattern becomes one tick.
  pending = true;
}

/** Installs the touchend listener that plays requested ticks on iOS. */
export function initHaptics(): void {
  if (canVibrate) return;
  document.addEventListener(
    'touchend',
    () => {
      if (!pending) return;
      pending = false;
      iosSwitch().click();
    },
    { capture: true, passive: true },
  );
}

export const haptic = {
  tap: () => pulse(1),
  conflict: () => pulse(2, 90),
  success: () => pulse(2, 60),
  win: () => pulse(4, 110),
};
