import { haptic } from './haptics';
import { ChevronLeft } from './icons';
import { route } from './settings';

export function BackButton() {
  return (
    <button
      class="back"
      aria-label="Back"
      title="Home (Esc)"
      onPointerDown={() => haptic.tap()}
      onClick={() => (route.value = 'home')}
    >
      <ChevronLeft />
      <span class="back__label">Home</span>
    </button>
  );
}
