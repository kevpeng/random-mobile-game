import { useSignal } from '@preact/signals';
import { restoreOrStart, puzzle, won } from '../state/store';
import { Board } from './Board';
import { haptic } from '../../shared/haptics';
import { ChevronDown } from '../../shared/icons';
import { BackButton } from '../../shared/BackButton';
import { Menu } from './Menu';
import { Timer } from './Timer';
import { Toolbar } from './Toolbar';
import { WinOverlay } from './WinOverlay';

export function QueensGame() {
  restoreOrStart();
  const menu = useSignal(false);
  const n = puzzle.value?.size ?? 8;
  return (
    <div class="app">
      <header class="top">
        <BackButton />
        <button
          class="chip"
          onPointerDown={() => haptic.tap()}
          onClick={() => (menu.value = true)}
          aria-label="Menu"
        >
          Queens · {n}×{n} <ChevronDown />
        </button>
        <Timer />
      </header>
      <main class="stage">
        <Board />
      </main>
      <Toolbar />
      {won.value && <WinOverlay />}
      {menu.value && <Menu onClose={() => (menu.value = false)} />}
    </div>
  );
}
