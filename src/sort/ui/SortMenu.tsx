import { useSignal } from '@preact/signals';
import { formatTime } from '../../shared/format';
import { haptic } from '../../shared/haptics';
import { FeedbackToggles } from '../../shared/Toggles';
import { MAX_COLORS, type SortConfig } from '../game';
import { bestTimes, config, configKey, newGame, PRESETS } from '../store';

function Stepper(props: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const set = (v: number) => {
    if (v < props.min || v > props.max) return;
    haptic.tap();
    props.onChange(v);
  };
  return (
    <div class="stepper">
      <span>{props.label}</span>
      <button aria-label={`Fewer ${props.label}`} disabled={props.value <= props.min} onClick={() => set(props.value - 1)}>
        −
      </button>
      <b>{props.value}</b>
      <button aria-label={`More ${props.label}`} disabled={props.value >= props.max} onClick={() => set(props.value + 1)}>
        +
      </button>
    </div>
  );
}

export function SortMenu(props: { onClose: () => void }) {
  const custom = useSignal<SortConfig>({ ...config.value });
  const cur = config.value;
  const play = (c: SortConfig) => {
    void newGame(c);
    props.onClose();
  };
  return (
    <div class="sheet-backdrop" onClick={props.onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Menu">
        <div class="sheet__grip" />
        <h2>Difficulty</h2>
        <div class="presets">
          {PRESETS.map(({ name, config: c }) => {
            const best = bestTimes.value[configKey(c)];
            const on = c.colors === cur.colors && c.height === cur.height && c.empty === cur.empty;
            return (
              <button key={name} class={`size${on ? ' size--on' : ''}`} onPointerDown={() => haptic.tap()} onClick={() => play(c)}>
                <b>{name}</b>
                <small>
                  {c.colors} colours · {best !== undefined ? `best ${formatTime(best)}` : `${c.colors + c.empty} tubes`}
                </small>
              </button>
            );
          })}
        </div>
        <h2>Custom</h2>
        <div class="custom">
          <Stepper
            label="Colours"
            value={custom.value.colors}
            min={3}
            max={MAX_COLORS}
            onChange={(v) => (custom.value = { ...custom.value, colors: v })}
          />
          <Stepper
            label="Height"
            value={custom.value.height}
            min={3}
            max={6}
            onChange={(v) => (custom.value = { ...custom.value, height: v })}
          />
          <button class="btn btn--primary" onPointerDown={() => haptic.tap()} onClick={() => play({ ...custom.value, empty: 2 })}>
            Play {custom.value.colors}×{custom.value.height}
          </button>
        </div>
        <h2>Settings</h2>
        <FeedbackToggles />
        <h2>How to play</h2>
        <p class="rules">
          Sort the balls so every tube holds one colour. Tap a tube to pick up its top balls, then tap another tube to
          drop them — only onto the same colour or into an empty tube.
        </p>
      </div>
    </div>
  );
}
