# Mob art: "chunky cartoon crowd"

Little round jellybean people, bold candy colours, soft top-left light, thick rounded dark
outlines. Everything is drawn to read at **10–40 px on a phone**: no thin lines, no tiny
details, strong silhouettes.

All art is hand-written SVG in `assets-src/`. In-game textures are rasterized from it by
`npm run assets:mob` (see [Regenerating](#regenerating)); UI icons use the SVGs directly.

## Palette

| Role | Light | Base | Shade | Outline |
| --- | --- | --- | --- | --- |
| Player (hp 1) | `#9fd6ff` | `#3d8bff` | `#1c4fc4` | `#10224a` |
| Champion (hp > 1) | `#86b4ff` | `#2459e0` | `#12379a` | `#0b1a3d` |
| Enemy (hp 1) | `#ffb3b3` | `#ff4d5e` | `#c42238` | `#3e0b16` |
| Brute (hp > 1) | `#ff8f8f` | `#d42a42` | `#8a1026` | `#33060f` |
| Gold (helmet, wheels, coin) | `#fff6c2` | `#ffc93c` | `#d98a12` | `#6b3d05` |
| Horns / trim cream | `#fffaf0` | `#fff6e8` | `#e6c595` | — |
| Castle walls | `#ff8a8a` | `#f0525f` | `#c7303f` | `#3e0b16` |
| Castle roofs | `#e2425a` | `#b01d38` | `#7c0f25` | `#3e0b16` |
| Good gate (× / +) | `#8ef0ff` | `#2ed3ee` | `#14a4c8` | `#0a3b52` |
| Bad gate (÷ / −) | `#ffd0de` | `#ff4f86` | `#e0306a` | `#8a1030` |
| Lane | `#f6eddb` / `#efe3cb` bands | curbs `#e6d3ad` | grooves `#e2d1b0` | — |
| Grass | `#9edb77` patches | `#8fd16a` | tufts `#6cb84c` | — |

Team rule: **blue = you, red = them**. Anything the player owns (cannon, runners, the
champion's plume) stays in blues + gold; anything hostile is red/maroon. Gates are cyan (good)
vs pink (bad) so they never read as a team colour.

**Dark mode.** Characters, cannon, castle and gates keep their colours (they're bright and
outlined, so they pop on dark). The lane and grass textures are tinted in the shader
(`laneTint`, `grassTint` in `renderer.ts`) to land on the dark palette (`#2a2a30`, `#1f2a1c`).
The UI icons sit on `--surface`, which is dark in dark mode; their own outlines keep them legible.

## Shapes and proportions

- **Runner:** one bean (head + body in one), 62 × 79 px in a 128 px frame, ~0.8 : 1 width to
  height. Stubby legs (15 × 26, fully rounded) and nub arms (18 × 24 ellipses). Feet on y = 118.
- **Players are seen from behind** (they run away from the camera): no face, just a highlight.
  **Enemies are seen from the front**: two dark dot eyes with white glints, angry brows, a frown.
- **Champion:** deeper blue, gold dome helmet with a rim band and a white plume. Drawn at 90 %
  in its frame so the plume clears the edge.
- **Brute:** wider bean (74 px), darker red, cream horns, heavy brows, toothy grimace. Also 90 %.
- **Cannon:** chubby blue barrel seen from behind and above, big round breech toward the
  camera, gold band, gold wheels on a navy carriage. Recoil frame: barrel kicked back and
  squashed, cream/gold muzzle puff.
- **Castle:** front view, keep with four cream merlons, two turrets with dark-red cone roofs
  and gold tips, arched portcullis door, pink flag. States: intact → cracked (merlon knocked
  off, cracks, chips, torn flag, tilted roof) → crumbling (jagged tops, roof gone/fallen,
  rubble, dust).

## Outline, light, gradients

- **Outline:** 12 px stroke in a 128 px frame (6 px visible outside the fill, ≈ 5 % of the
  frame), 10 px for the 256 px cannon/castle frames, round joins. Outlines are the team's
  darkest colour, never pure black.
- **How outlines are drawn:** every frame renders its parts twice — first as one group stroked
  in the outline colour (`<use href="#p0" stroke=… stroke-width="12"/>`), then the same group
  filled — so overlapping parts (legs, arms, body, horns) share one clean silhouette.
  Details (faces, highlights, cracks) go on top.
- **Light:** from the upper left, matching the ball shader (`l = (-0.45, 0.65, 0.62)`).
  Radial gradients centred at (0.34, 0.28) go light → base → shade. One soft white highlight
  ellipse (opacity 0.55–0.75) on the upper-left of each round form.
- No hard shadows inside the art; ground contact comes from the renderer's soft disc shadows.

## Frames, anchors, sizes

`public/mob/atlas.png` is 1024 × 1024 (power of two, transparent). Layout:

| Cells | Sheet | Frames |
| --- | --- | --- |
| y 0, x 0–511 / 512–1023 | player / champion | 4 × 128 px run cycle |
| y 128, x 0–511 / 512–1023 | enemy / brute | 4 × 128 px run cycle |
| y 256, x 0–511 | cannon | idle, recoil (256 px) |
| y 256, x 512 | shadow | 1 × 128 px |
| y 512, x 0–767 | tower | intact, cracked, crumbling (256 px) |

Run cycle: 0 = left stride (right leg lifted, lean left, squash), 1 = passing (up, stretch),
2 = right stride, 3 = passing. The renderer picks `floor(age × ~10 + index) mod 4`, so the crowd
doesn't march in step.

`src/mob/render/atlas.json` (generated, imported as a module) describes every frame:

- `cell` — the frame's grid cell in the atlas (px);
- `x, y, w, h` — the drawn quad, **trimmed** to the frame's opaque pixels + 1 px (saves fill
  rate with thousands of overlapping units);
- `uv` — the same rect normalized, inset half a texel so filtering never bleeds into a neighbour;
- `anchor` — the ground-contact point (feet, carriage bottom, wall base) as a fraction of `w, h`;
- `unit` — the width in px that maps to the object's reference size in the world: a unit's
  diameter (`2 × radius(hp)`, times a small readability boost), the cannon's footprint, the
  castle's walls.

Every cell keeps ≥ 4 px of empty padding around its drawing, so mipmapped sampling at phone
sizes doesn't pick up the neighbour.

Other textures (all power of two, repeating):

- `public/mob/lane.png` 256² — u spans the lane (curbs at both edges), v repeats every
  2 world units (two paving bands). Speckles are drawn tall because the lane is stretched ~2×
  across.
- `public/mob/grass.png` 256² — seamless (content stamped at the 8 neighbour offsets).
- `public/mob/gate.png` 128² — white + alpha "candy glass" with diagonal stripes, tinted cyan or
  pink per gate; repeats once per gate height across the panel.

## UI art

`assets-src/mob/ui/`: `coin.svg`, `up-fire.svg`, `up-shot.svg`, `up-champ.svg`,
`up-boost.svg` (64 × 64, shown at 18–44 px) and `mob-card.svg` (168², the home card at 84 px).
They're imported straight from `src/mob/ui/art.tsx` (Vite inlines or fingerprints them).
UI characters face the viewer (eyes + smile), unlike the in-game back view.

`assets-src/app-icon.svg` is the app icon: four candy tiles, one nod per game (crown for
Queens, a tube of balls for Sort, a blue runner and the red castle for Mob). It is copied to
`public/icon.svg` and rasterized to the PNG icons. Keep important content inside the central
80 % circle (the 512 px PNG doubles as the maskable icon).

## Regenerating

```sh
npm run assets:mob
```

`scripts/build-mob-assets.mjs` opens each SVG in Playwright's Chromium (already a dev
dependency; override the binary with `PW_CHROMIUM=…`), screenshots it with a transparent
background, and writes the atlas, the textures, `atlas.json` and the app icons. PNGs are then
re-encoded by a small zlib-only encoder in the script (per-row filter choice, deflate level 9,
transparent pixels cleared, alpha dropped for opaque images). The atlas is rounded to 64 levels
per channel and the icons to 48 (`ATLAS_LEVELS` / `ICON_LEVELS` env vars; 256 = lossless) —
invisible at game sizes and roughly halves the files. Commit the outputs.

To add or change art: edit the SVG (keep the frame grid, feet line and padding), run the
script, check `public/mob/atlas.png`, then look at it in the game
(`npx playwright test tests/e2e/mob-art.spec.ts` writes `test-results/art-*.png`).
If you add a sheet, add it to `SHEETS` in the build script and look it up by name in
`renderer.ts` (`SHEET`).
