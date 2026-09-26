import { bestKey, bests, newGame, puzzle, setHard, settings } from '../state/store';
import { formatTime } from '../../shared/format';
import { haptic } from '../../shared/haptics';
import { FeedbackToggles, Toggle } from '../../shared/Toggles';

const SIZES = [5, 6, 7, 8, 9, 10];

export function Menu(props: { onClose: () => void }) {
  const current = puzzle.value?.size;
  const hard = settings.value.hard;
  return (
    <div class="sheet-backdrop" onClick={props.onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Menu">
        <div class="sheet__grip" />
        <h2>Board size</h2>
        <div class="sizes">
          {SIZES.map((s) => (
            <button
              key={s}
              class={`size${s === current ? ' size--on' : ''}`}
              onPointerDown={() => haptic.tap()}
              onClick={() => {
                void newGame(s);
                props.onClose();
              }}
            >
              <b>{s}</b>
              <small>{bests.value[bestKey(s)] !== undefined ? formatTime(bests.value[bestKey(s)]) : '—'}</small>
            </button>
          ))}
        </div>
        <h2>Settings</h2>
        <Toggle
          label="Hard mode"
          hint="No ✕ marks — crowns only, all in your head"
          on={hard}
          onToggle={() => setHard(!hard)}
        />
        {!hard && (
          <Toggle
            label="Auto-✕"
            hint="Dim cells a queen rules out"
            on={settings.value.autoX}
            onToggle={() => (settings.value = { ...settings.value, autoX: !settings.value.autoX })}
          />
        )}
        <FeedbackToggles />
        <h2>How to play</h2>
        <p class="rules">
          Place one crown in every row, column and colour region. Crowns can't touch each other — not even
          diagonally. {hard
            ? 'Hard mode: tap to place or remove a crown — no ✕ marks.'
            : 'Tap once for ✕, twice for a crown. Drag to mark many ✕s at once.'}
        </p>
      </div>
    </div>
  );
}
