import type { ComponentChildren } from 'preact';
import { haptic } from './haptics';

export function ToolButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children: ComponentChildren;
}) {
  return (
    <button
      class="tool"
      disabled={props.disabled}
      // Haptic at touch start feels instant; the action itself runs on click.
      onPointerDown={() => !props.disabled && haptic.tap()}
      onClick={props.onPress}
    >
      {props.children}
      <span>{props.label}</span>
    </button>
  );
}
