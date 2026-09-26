import { bests, elapsedMs, hintsUsed, newBest, newGame, puzzle } from '../state/store';
import { Confetti } from './Confetti';
import { formatTime } from './format';
import { haptic } from './haptics';

export function WinOverlay() {
  const p = puzzle.value!;
  const best = bests.value[p.size];
  const hints = hintsUsed.value;
  return (
    <>
      <Confetti />
      <div class="win" role="dialog" aria-label="Solved">
        <div class="win__card">
          <div class="win__stats">
            <div class="win__title">Solved</div>
            <div class="win__time">{formatTime(elapsedMs())}</div>
            <div class="win__meta">
              {newBest.value ? '★ New best' : best !== undefined ? `Best ${formatTime(best)}` : ''}
              {hints ? ` · ${hints} hint${hints > 1 ? 's' : ''}` : ''}
            </div>
          </div>
          <button class="btn btn--primary" onPointerDown={() => haptic.tap()} onClick={() => void newGame()}>
            Next puzzle
          </button>
        </div>
      </div>
    </>
  );
}
