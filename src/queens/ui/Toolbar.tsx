import { clearBoard, hint, history, marks, newGame, undo, won } from '../state/store';
import { ToolButton } from '../../shared/ToolButton';
import { ClearIcon, HintIcon, NewIcon, UndoIcon } from '../../shared/icons';

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
