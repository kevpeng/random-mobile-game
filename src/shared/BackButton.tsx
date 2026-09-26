import { haptic } from './haptics';
import { ChevronLeft } from './icons';
import { route } from './settings';

export function BackButton() {
  return (
    <button class="back" aria-label="Back" onPointerDown={() => haptic.tap()} onClick={() => (route.value = 'home')}>
      <ChevronLeft />
    </button>
  );
}
