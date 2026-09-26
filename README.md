# Puzzles

Snappy, installable mobile games:

- **Queens** — place one crown in every row, column and colour region, with no two crowns touching (diagonals included).
- **Mob** — multiply your army through gates and topple the enemy tower.
- **Sort** — sort coloured balls so each tube holds one colour. Presets from Easy to Expert, or a custom number of colours (3–12) and tube height (3–6).

Play: https://kevpeng.github.io/random-mobile-game/ — on iPhone, open in Safari → Share → **Add to Home Screen** for full-screen, offline play.

## Queens controls

- Tap: empty → ✕ → crown → empty
- Drag: paint ✕s (drag starting on a ✕ or crown erases ✕s instead)
- Undo / Clear / Hint (+10s) / New; board size and settings live under the size chip
- **Hard mode** (menu): no ✕ marks at all — a tap places or removes a crown. Best times are kept separately.

## Sort controls

- Tap a tube to lift its top run of balls, tap another tube to drop them onto the same colour or into an empty tube
- Or drag: press a tube and drag its top run onto another tube (valid targets light up); letting go anywhere else puts it back
- Undo / Restart / Hint (solver-backed; tells you if you're stuck) / New

## Mob

A Mob Control-style shooter on a faux-3D lane (WebGL2, no libraries). Your cannon auto-fires; **drag anywhere** to steer it.

- Units fly straight and pass through gates: **×N** multiplies every unit, **+N** adds N units then recharges for a second, **÷N** and **−N** (absorbs N, then breaks) hurt.
- The enemy tower releases bursts that march at your base; your units fight them 1:1 and survivors damage the tower. Champions (every Nth shot) are big 10-hp units.
- Beat levels for coins and buy upgrades (fire rate, units per shot, champions, a free head-start gate). **Endless** mode sends ever-bigger waves; your best is saved.
- Levels 1–3 are hand-made, the rest are generated; tower health and enemy pressure scale with the best straight-line path through each layout. A test plays levels 1–15 with a simple bot to keep them winnable.

## Timers and haptics

Both games have a timer that starts on your first move, pauses while the app or game is in the background, and stops when you win (Sort also stops it on the out-of-moves screen). Best times are kept per board size / difficulty.

Haptics on iPhone need **iOS 18+** with **Settings → Sounds & Haptics → System Haptics** on. Safari only allows one light tick per tap, played during the tap's click (or as the finger lifts after a drag); Android gets full vibration patterns. On iPhone, the menu has a **Haptics check** row to see which timing your device accepts.

The build id (commit · time) is shown at the bottom of the home screen, so you can tell whether your phone has picked up the latest deploy.

## Development

```sh
npm install
npm run dev        # dev server, reachable from your phone on the LAN
npm test           # solver / generator / rules unit tests
npm run build
npm run e2e        # Playwright smoke test in iPhone emulation
```

Queens puzzles are generated on device: a random non-touching queen layout, regions grown from each queen, then repaired until the solver finds exactly one solution. Sort deals are random shuffles kept only if a depth-first solver can finish them. Both generators run in Web Workers and the next puzzle is always pre-generated.

Deploys to GitHub Pages from `main` via `.github/workflows/deploy.yml` (repo Settings → Pages → Source: **GitHub Actions**).
