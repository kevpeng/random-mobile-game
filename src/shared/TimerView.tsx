import { useEffect } from 'preact/hooks';
import { formatTime } from './format';
import type { GameTimer } from './timer';

/** Header clock. Mounting it marks the game as on screen, so the timer only runs while visible. */
export function TimerView(props: { timer: GameTimer; sub?: string }) {
  const { timer } = props;
  useEffect(() => {
    timer.setShown(true);
    return () => timer.setShown(false);
  }, [timer]);
  void timer.tick.value; // re-render on tick
  return (
    <div class="timer" role="timer">
      {formatTime(timer.elapsed())}
      {props.sub !== undefined && <small>{props.sub}</small>}
    </div>
  );
}
