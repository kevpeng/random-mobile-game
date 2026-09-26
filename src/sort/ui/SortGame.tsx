import { useSignal } from '@preact/signals';
import { BackButton } from '../../shared/BackButton';
import { Confetti } from '../../shared/Confetti';
import { haptic } from '../../shared/haptics';
import { ChevronDown, HintIcon, NewIcon, RestartIcon, UndoIcon } from '../../shared/icons';
import { ToolButton } from '../../shared/ToolButton';
import {
  bests,
  config,
  configName,
  hint,
  hintMove,
  history,
  moves,
  newBest,
  newGame,
  puzzle,
  restart,
  restoreOrStart,
  undo,
  won,
} from '../store';
import { SortMenu } from './SortMenu';
import { Tubes } from './Tubes';

function SortWin() {
  const c = puzzle.value!.config;
  const best = bests.value[`${c.colors}x${c.height}x${c.empty}`];
  return (
    <>
      <Confetti />
      <div class="win" role="dialog" aria-label="Solved">
        <div class="win__card">
          <div class="win__stats">
            <div class="win__title">Sorted</div>
            <div class="win__time">{moves.value} moves</div>
            <div class="win__meta">{newBest.value ? '★ New best' : best !== undefined ? `Best ${best}` : ''}</div>
          </div>
          <button class="btn btn--primary" onPointerDown={() => haptic.tap()} onClick={() => void newGame()}>
            Next puzzle
          </button>
        </div>
      </div>
    </>
  );
}

export function SortGame() {
  restoreOrStart();
  const menu = useSignal(false);
  const isWon = won.value;
  const c = puzzle.value?.config ?? config.value;
  return (
    <div class="app">
      <header class="top">
        <BackButton />
        <button class="chip" onPointerDown={() => haptic.tap()} onClick={() => (menu.value = true)} aria-label="Menu">
          Sort · {configName(c)} <ChevronDown />
        </button>
        <div class="timer">{moves.value}</div>
      </header>
      <main class="stage stage--sort">
        <Tubes />
        {hintMove.value === 'stuck' && <div class="toast">No way out from here — undo or restart</div>}
      </main>
      <nav class="toolbar">
        <ToolButton label="Undo" onPress={undo} disabled={isWon || !history.value.length}>
          <UndoIcon />
        </ToolButton>
        <ToolButton label="Restart" onPress={restart} disabled={isWon || !history.value.length}>
          <RestartIcon />
        </ToolButton>
        <ToolButton label="Hint" onPress={() => void hint()} disabled={isWon}>
          <HintIcon />
        </ToolButton>
        <ToolButton label="New" onPress={() => void newGame()}>
          <NewIcon />
        </ToolButton>
      </nav>
      {isWon && <SortWin />}
      {menu.value && <SortMenu onClose={() => (menu.value = false)} />}
    </div>
  );
}
