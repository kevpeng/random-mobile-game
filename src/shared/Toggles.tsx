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

export function FeedbackToggles() {
  return (
    <>
      <SharedToggle k="haptics" label="Haptics" hint="Taps you can feel" />
      <SharedToggle k="sound" label="Sound" hint="Soft clicks" />
    </>
  );
}
