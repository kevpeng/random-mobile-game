import { useSignal } from '@preact/signals';
import { puzzle, won } from '../state/store';
import { Board } from './Board';
import { haptic } from './haptics';
import { ChevronDown } from './icons';
import { Menu } from './Menu';
import { Timer } from './Timer';
import { Toolbar } from './Toolbar';
import { WinOverlay } from './WinOverlay';

export function App() {
  const menu = useSignal(false);
  const n = puzzle.value?.size ?? 8;
  return (
    <div class="app">
      <header class="top">
        <button
          class="chip"
          onPointerDown={() => haptic.tap()}
          onClick={() => (menu.value = true)}
          aria-label="Menu"
        >
          {n}×{n} <ChevronDown />
        </button>
        <h1>Queens</h1>
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
