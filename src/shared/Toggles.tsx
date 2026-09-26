import { canVibrate, tickNow } from './haptics';
import { shared, type SharedSettings } from './settings';

export function Toggle(props: { label: string; hint: string; on: boolean; onToggle: () => void }) {
  return (
    <label class="toggle">
      <span>
        {props.label}
        <small>{props.hint}</small>
      </span>
      <input type="checkbox" {...{ switch: true }} checked={props.on} onChange={props.onToggle} />
    </label>
  );
}

function SharedToggle(props: { k: keyof SharedSettings; label: string; hint: string }) {
  return (
    <Toggle
      label={props.label}
      hint={props.hint}
      on={shared.value[props.k]}
      onToggle={() => (shared.value = { ...shared.value, [props.k]: !shared.value[props.k] })}
    />
  );
}

/**
 * iPhone-only diagnostic: each button plays a tick at a different moment of the
 * tap, to see which ones this device accepts.
 */
function HapticsCheck() {
  if (canVibrate) return null;
  return (
    <div class="hcheck">
      <span>
        Haptics check
        <small>Which buttons buzz?</small>
      </span>
      <button onPointerDown={tickNow}>Touch</button>
      <button onTouchEnd={tickNow}>Lift</button>
      <button onClick={tickNow}>Tap</button>
    </div>
  );
}

export function FeedbackToggles() {
  return (
    <>
      <SharedToggle k="haptics" label="Haptics" hint="Taps you can feel" />
      <HapticsCheck />
      <SharedToggle k="sound" label="Sound" hint="Soft clicks" />
    </>
  );
}
