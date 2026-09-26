# Puzzles

Snappy, installable mobile puzzle games:

- **Queens** — place one crown in every row, column and colour region, with no two crowns touching (diagonals included).
- **Sort** — sort coloured balls so each tube holds one colour. Presets from Easy to Expert, or a custom number of colours (3–12) and tube height (3–6).

Play: https://kevpeng.github.io/random-mobile-game/ — on iPhone, open in Safari → Share → **Add to Home Screen** for full-screen, offline play.

## Queens controls

- Tap: empty → ✕ → crown → empty
- Drag: paint ✕s (drag starting on a ✕ or crown erases ✕s instead)
- Undo / Clear / Hint (+10s) / New; board size and settings live under the size chip

## Sort controls

- Tap a tube to lift its top run of balls, tap another tube to drop them onto the same colour or into an empty tube
- Undo / Restart / Hint (solver-backed; tells you if you're stuck) / New

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
