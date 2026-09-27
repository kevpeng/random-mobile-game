import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { GoBackButton } from '../../shared/GoBackButton';
import { BackButton } from '../../shared/BackButton';
import { Confetti } from '../../shared/Confetti';
import { haptic } from '../../shared/haptics';
import { sound } from '../../shared/sound';
import { ChevronDown, DeadEndIcon, HintIcon, NewIcon, RestartIcon, UndoIcon } from '../../shared/icons';
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
  previous,
  goBack,
  puzzle,
  rescueBack,
  restart,
  rewind,
  restoreOrStart,
  stuck,
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

const STUCK_COPY = {
  'no-moves': { title: 'No moves left', body: 'Every tube is blocked — nothing can move.' },
  loop: { title: 'Going in circles', body: 'The only moves left just shuffle the same balls back and forth.' },
  'dead-end': { title: 'Dead end', body: 'Moves are left, but none of them can sort the tubes from here.' },
} as const;

function DeadEnd(props: { reason: keyof typeof STUCK_COPY }) {
  const copy = STUCK_COPY[props.reason];
  const back = rescueBack.value;
  const canUndo = history.value.length > 0;
  const press = () => haptic.tap();
  useEffect(() => {
    sound.conflict();
  }, []);
  return (
    <div class="deadend" role="dialog" aria-label={copy.title}>
      <div class="deadend__card">
        <div class="deadend__icon" aria-hidden="true">
          <DeadEndIcon />
        </div>
        <h2 class="deadend__title">{copy.title}</h2>
        <p class="deadend__body">{copy.body}</p>
        <p class="deadend__stats">
          {formatTime(timer.elapsed())} · {plural(moves.value)}
        </p>
        <div class="deadend__actions">
          {back !== null && back > 1 && (
            <button class="btn btn--primary" onPointerDown={press} onClick={() => rewind(back)}>
              Back to last winnable position
              <small>{back} moves back</small>
            </button>
          )}
          {canUndo && (
            <button class={`btn ${back !== null && back > 1 ? 'btn--ghost' : 'btn--primary'}`} onPointerDown={press} onClick={undo}>
              Undo last move
            </button>
          )}
          <div class="deadend__row">
            <button class="btn btn--ghost" onPointerDown={press} onClick={restart}>
              Restart
            </button>
            <button class="btn btn--ghost" onPointerDown={press} onClick={() => void newGame()}>
              New puzzle
            </button>
          </div>
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
        {previous.value ? (
          <GoBackButton onPress={goBack} />
        ) : (
          <TimerView timer={timer} sub={plural(moves.value)} />
        )}
      </header>
      <main class="stage stage--sort">
        <Tubes />
        {hintMove.value === 'none' && !stuck.value && <div class="toast">Couldn't find a hint — try undoing a few moves</div>}
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
      {stuck.value && <DeadEnd reason={stuck.value} />}
      {menu.value && <SortMenu onClose={() => (menu.value = false)} />}
    </div>
  );
}
