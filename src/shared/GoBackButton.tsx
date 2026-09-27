import { haptic } from './haptics';
import { UndoIcon } from './icons';

/** Shown in place of the clock right after "New": returns to the game it replaced. */
export function GoBackButton(props: { onPress: () => void }) {
  return (
    <button
      class="goback"
      aria-label="Go back to previous puzzle"
      onPointerDown={() => haptic.tap()}
      onClick={props.onPress}
    >
      <UndoIcon />
      Go back
    </button>
  );
}
