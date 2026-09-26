import { useSignal } from '@preact/signals';
import { BackButton } from '../../shared/BackButton';
import { Confetti } from '../../shared/Confetti';
import { haptic } from '../../shared/haptics';
import { ChevronDown, HintIcon, NewIcon, RestartIcon, UndoIcon } from '../../shared/icons';
import { formatTime } from '../../shared/format';
import { TimerView } from '../../shared/TimerView';
import { ToolButton } from '../../shared/ToolButton';
import {
  bests,
  bestTimes,
  config,
  configKey,
  configName,
  hint,
  hintMove,
  history,
  moves,
  newBest,
  newGame,
  outOfMoves,
  puzzle,
  restart,
  restoreOrStart,
  timer,
  undo,
  won,
} from '../store';
import { SortMenu } from './SortMenu';
import { Tubes } from './Tubes';

const plural = (n: number) => `${n} move${n === 1 ? '' : 's'}`;

function SortWin() {
  const k = configKey(puzzle.value!.config);
  const rec = newBest.value;
  const bestTime = bestTimes.value[k];
  const bestMoves = bests.value[k];
  const meta = [plural(moves.value)];
  if (rec.time && rec.moves) meta.push('★ New best');
  else if (rec.time) meta.push('★ Best time');
  else if (rec.moves) meta.push('★ Fewest moves');
  else if (bestTime !== undefined) meta.push(`Best ${formatTime(bestTime)} / ${bestMoves}`);
  return (
    <>
      <Confetti />
      <div class="win" role="dialog" aria-label="Solved">
        <div class="win__card">
          <div class="win__stats">
            <div class="win__title">Sorted</div>
            <div class="win__time">{formatTime(timer.elapsed())}</div>
            <div class="win__meta">{meta.join(' · ')}</div>
          </div>
          <button class="btn btn--primary" onPointerDown={() => haptic.tap()} onClick={() => void newGame()}>
            Next puzzle
          </button>
        </div>
      </div>
    </>
  );
}

function OutOfMoves() {
  const canUndo = history.value.length > 0;
  return (
    <div class="win fail" role="dialog" aria-label="Out of moves">
      <div class="win__card">
        <div class="win__stats">
          <div class="win__title">No moves left</div>
          <div class="win__time">Stuck</div>
          <div class="win__meta">
            {formatTime(timer.elapsed())} · {plural(moves.value)}
          </div>
        </div>
        <div class="fail__actions">
          {canUndo && (
            <button class="btn btn--primary" onPointerDown={() => haptic.tap()} onClick={undo}>
              Undo
            </button>
          )}
          <button
            class={`btn ${canUndo ? 'btn--ghost' : 'btn--primary'}`}
            onPointerDown={() => haptic.tap()}
            onClick={restart}
          >
            Restart
          </button>
        </div>
      </div>
    </div>
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
        <TimerView timer={timer} sub={plural(moves.value)} />
      </header>
      <main class="stage stage--sort">
        <Tubes />
        {hintMove.value === 'stuck' && !outOfMoves.value && <div class="toast">No way out from here — undo or restart</div>}
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
      {outOfMoves.value && <OutOfMoves />}
      {menu.value && <SortMenu onClose={() => (menu.value = false)} />}
    </div>
  );
}
