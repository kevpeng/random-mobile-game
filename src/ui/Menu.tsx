import { bests, newGame, puzzle, settings, type Settings } from '../state/store';
import { formatTime } from './format';
import { haptic } from './haptics';

const SIZES = [5, 6, 7, 8, 9, 10];

function Toggle(props: { k: 'autoX' | 'haptics' | 'sound'; label: string; hint: string }) {
  const on = settings.value[props.k];
  return (
    <label class="toggle">
      <span>
        {props.label}
        <small>{props.hint}</small>
      </span>
      <input
        type="checkbox"
        {...{ switch: true }}
        checked={on}
        onChange={() => (settings.value = { ...settings.value, [props.k]: !on } as Settings)}
      />
    </label>
  );
}

export function Menu(props: { onClose: () => void }) {
  const current = puzzle.value?.size;
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
              <small>{bests.value[s] !== undefined ? formatTime(bests.value[s]) : '—'}</small>
            </button>
          ))}
        </div>
        <h2>Settings</h2>
        <Toggle k="autoX" label="Auto-✕" hint="Dim cells a queen rules out" />
        <Toggle k="haptics" label="Haptics" hint="Taps you can feel" />
        <Toggle k="sound" label="Sound" hint="Soft clicks" />
        <h2>How to play</h2>
        <p class="rules">
          Place one crown in every row, column and colour region. Crowns can't touch each other — not even
          diagonally. Tap once for ✕, twice for a crown. Drag to mark many ✕s at once.
        </p>
      </div>
    </div>
  );
}
