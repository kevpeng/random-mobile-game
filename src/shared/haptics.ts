import { shared } from './settings';

/**
 * iOS Safari has no navigator.vibrate, but toggling a native
 * <input type="checkbox" switch> (iOS 18+) plays the system tick haptic.
 * We keep a hidden one and click its label. Elsewhere we fall back to
 * navigator.vibrate, and on anything else this silently does nothing.
 */
let label: HTMLLabelElement | null = null;

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
  const l = iosSwitch();
  l.click();
  for (let i = 1; i < count; i++) setTimeout(() => l.click(), i * gap);
}

export const haptic = {
  tap: () => pulse(1),
  conflict: () => pulse(2, 90),
  win: () => pulse(4, 110),
};
