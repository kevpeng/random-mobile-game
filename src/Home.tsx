import { MobCardArt } from './mob/ui/art';
import { haptic } from './shared/haptics';
import { route, type Route } from './shared/settings';
import { checkForUpdate, forceRefresh, liveCommit, updateStatus, type UpdateStatus } from './shared/update';

function QueensArt() {
  const regions = [0, 0, 1, 1, 0, 2, 2, 1, 3, 3, 2, 1, 3, 3, 2, 2];
  return (
    <div class="art art--queens">
      {regions.map((r, i) => (
        <span key={i} style={{ background: `var(--r${[0, 1, 2, 3][r]})` }}>
          {i === 1 || i === 7 || i === 8 || i === 14 ? '♛' : ''}
        </span>
      ))}
    </div>
  );
}

function SortArt() {
  const tubes = [[0, 1, 0], [1, 2, 2], [2, 0, 1], []];
  return (
    <div class="art art--sort">
      {tubes.map((t, i) => (
        <div key={i} class="art__tube">
          {t.map((c, j) => (
            <i key={j} style={{ background: `var(--c${c * 3})` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

const GAMES: { id: Route; name: string; blurb: string; Art: () => preact.JSX.Element }[] = [
  { id: 'queens', name: 'Queens', blurb: 'One crown per row, column and colour.', Art: QueensArt },
  { id: 'sort', name: 'Sort', blurb: 'Stack every colour into its own tube.', Art: SortArt },
  { id: 'mob', name: 'Mob', blurb: 'Multiply your army and topple the tower.', Art: MobCardArt },
];

const STATUS_TEXT: Record<UpdateStatus, string> = {
  idle: '',
  checking: 'Checking for updates…',
  latest: 'Up to date',
  updating: 'Updating…',
  offline: 'Offline — showing the saved version',
  unknown: "Couldn't read the live version",
};

function UpdateBar() {
  const status = updateStatus.value;
  const live = liveCommit.value;
  const text = status === 'updating' && live ? `Updating to ${live}…` : STATUS_TEXT[status];
  return (
    <div class="home__version">
      <p>
        Build {__APP_VERSION__}
        {text && <span> · {text}</span>}
      </p>
      <div class="home__update">
        <button onPointerDown={() => haptic.tap()} onClick={() => void checkForUpdate()} disabled={status === 'checking' || status === 'updating'}>
          Check for updates
        </button>
        <button onPointerDown={() => haptic.tap()} onClick={() => void forceRefresh()}>
          Force refresh
        </button>
      </div>
    </div>
  );
}

export function Home() {
  return (
    <div class="app home">
      <h1 class="home__title">Puzzles</h1>
      <div class="home__list">
        {GAMES.map(({ id, name, blurb, Art }) => (
          <button key={id} class="game-card" onPointerDown={() => haptic.tap()} onClick={() => (route.value = id)}>
            <Art />
            <div>
              <b>{name}</b>
              <small>{blurb}</small>
            </div>
          </button>
        ))}
      </div>
      <UpdateBar />
    </div>
  );
}
