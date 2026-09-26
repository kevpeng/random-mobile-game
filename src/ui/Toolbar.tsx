import type { ComponentChildren } from 'preact';
import { clearBoard, hint, history, marks, newGame, undo, won } from '../state/store';
import { haptic } from './haptics';
import { ClearIcon, HintIcon, NewIcon, UndoIcon } from './icons';

function ToolButton(props: { label: string; onPress: () => void; disabled?: boolean; children: ComponentChildren }) {
  return (
    <button
      class="tool"
      disabled={props.disabled}
      // Fire on pointerdown-release via click, but haptic at touch start for snappiness.
      onPointerDown={() => !props.disabled && haptic.tap()}
      onClick={props.onPress}
    >
      {props.children}
      <span>{props.label}</span>
    </button>
  );
}

export function Toolbar() {
  const isWon = won.value;
  const empty = marks.value.every((m) => m === 0);
  return (
    <nav class="toolbar">
      <ToolButton label="Undo" onPress={undo} disabled={isWon || !history.value.length}>
        <UndoIcon />
      </ToolButton>
      <ToolButton label="Clear" onPress={clearBoard} disabled={isWon || empty}>
        <ClearIcon />
      </ToolButton>
      <ToolButton label="Hint" onPress={() => hint()} disabled={isWon}>
        <HintIcon />
      </ToolButton>
      <ToolButton label="New" onPress={() => void newGame()}>
        <NewIcon />
      </ToolButton>
    </nav>
  );
}
