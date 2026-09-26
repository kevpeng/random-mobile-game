# Queens

A snappy, installable take on the Queens puzzle: place one crown in every row, column and colour region, with no two crowns touching (diagonals included).

Play: https://kevpeng.github.io/random-mobile-game/ — on iPhone, open in Safari → Share → **Add to Home Screen** for full-screen, offline play.

## Controls

- Tap: empty → ✕ → crown → empty
- Drag: paint ✕s (drag starting on a ✕ or crown erases ✕s instead)
- Undo / Clear / Hint (+10s) / New; board size and settings live under the size chip

## Development

```sh
npm install
npm run dev        # dev server, reachable from your phone on the LAN
npm test           # solver / generator / rules unit tests
npm run build
npm run e2e        # Playwright smoke test in iPhone emulation
```

Puzzles are generated on device: a random non-touching queen layout, regions grown from each queen, then repaired until the solver finds exactly one solution. Generation runs in a Web Worker and the next puzzle is always pre-generated.

Deploys to GitHub Pages from `main` via `.github/workflows/deploy.yml` (repo Settings → Pages → Source: **GitHub Actions**).
