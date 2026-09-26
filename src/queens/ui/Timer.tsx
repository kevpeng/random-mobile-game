import { elapsedMs, timerTick } from '../state/store';
import { formatTime } from '../../shared/format';

export function Timer() {
  void timerTick.value; // re-render on tick
  return <div class="timer">{formatTime(elapsedMs())}</div>;
}
