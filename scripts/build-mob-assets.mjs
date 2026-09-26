#!/usr/bin/env node
// Rasterizes the hand-authored SVGs in assets-src/ into the game's textures and icons.
//
//   npm run assets:mob
//
// Outputs (all committed):
//   public/mob/atlas.png      sprite atlas (units, cannon, castle, shadow)
//   public/mob/lane.png       tileable lane surface
//   public/mob/grass.png      tileable grass
//   public/mob/gate.png       gate panel "candy glass" (white + alpha, tinted in the shader)
//   src/mob/render/atlas.json frame rects (px + UVs), anchors and reference sizes
//   public/icon.svg, public/icon-192.png, public/icon-512.png, public/apple-touch-icon.png
//
// Uses Playwright's Chromium (a dev dependency already), no other tools. Set PW_CHROMIUM to
// override the browser binary.
import { chromium } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => join(root, 'assets-src', f);
const out = (f) => join(root, f);
const CHROME = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/**
 * Atlas layout (1024×1024). Each sheet is one SVG whose frames sit side by side.
 *   anchor: the feet / ground-contact point inside a frame, in frame pixels
 *   unit:   the width in frame pixels that the renderer maps to the object's reference size
 *           (a unit's diameter for characters, the object's footprint for cannon/tower)
 */
const ATLAS_SIZE = 1024;
const SHEETS = [
  { name: 'player', file: 'mob/player.svg', x: 0, y: 0, frames: 4, fw: 128, fh: 128, anchor: [64, 118], unit: 62 },
  { name: 'champion', file: 'mob/champion.svg', x: 512, y: 0, frames: 4, fw: 128, fh: 128, anchor: [64, 118], unit: 56 },
  { name: 'enemy', file: 'mob/enemy.svg', x: 0, y: 128, frames: 4, fw: 128, fh: 128, anchor: [64, 118], unit: 62 },
  { name: 'brute', file: 'mob/brute.svg', x: 512, y: 128, frames: 4, fw: 128, fh: 128, anchor: [64, 118], unit: 56 },
  { name: 'cannon', file: 'mob/cannon.svg', x: 0, y: 256, frames: 2, fw: 256, fh: 256, anchor: [128, 236], unit: 212 },
  { name: 'shadow', file: 'mob/shadow.svg', x: 512, y: 256, frames: 1, fw: 128, fh: 128, anchor: [64, 64], unit: 120 },
  { name: 'tower', file: 'mob/tower.svg', x: 0, y: 512, frames: 3, fw: 256, fh: 256, anchor: [128, 244], unit: 216 },
];
const TEXTURES = [
  { file: 'mob/lane.svg', out: 'public/mob/lane.png', size: 256, opaque: true },
  { file: 'mob/grass.svg', out: 'public/mob/grass.png', size: 256, opaque: true },
  { file: 'mob/gate.svg', out: 'public/mob/gate.png', size: 128, opaque: false },
];
/** Colour levels per channel after rounding (256 = lossless). */
const ATLAS_LEVELS = Number(process.env.ATLAS_LEVELS ?? 64);
const ICON_LEVELS = Number(process.env.ICON_LEVELS ?? 48);
const ICONS = [
  { out: 'public/icon-512.png', size: 512 },
  { out: 'public/icon-192.png', size: 192 },
  { out: 'public/apple-touch-icon.png', size: 180 },
];

// ---- PNG re-encoding -------------------------------------------------------------------------
// Chromium writes quick, lightly-compressed RGBA PNGs. We decode them (zlib only), clear the colour
// of fully transparent pixels, drop the alpha channel for opaque images, optionally round colours
// to fewer levels (`levels`, lossy but invisible at game sizes), pick the best filter per row and
// deflate at level 9. Typically 2–3× smaller.
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function decodePng(buf) {
  let pos = 8, w = 0, h = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      colorType = data[9];
      if (data[8] !== 8 || data[12] !== 0 || (colorType !== 6 && colorType !== 2)) throw new Error('unexpected PNG format');
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h * 4);
  const stride = w * bpp;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      line[i] = (line[i] + pred) & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      px[o] = line[x * bpp];
      px[o + 1] = line[x * bpp + 1];
      px[o + 2] = line[x * bpp + 2];
      px[o + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { w, h, px };
}
function encodePng({ w, h, px }, { levels = 256 } = {}) {
  let opaque = true;
  for (let i = 3; i < px.length; i += 4) if (px[i] !== 255) opaque = false;
  const bpp = opaque ? 3 : 4;
  const step = 255 / (levels - 1);
  const q = (v) => (levels >= 256 ? v : Math.round(Math.round(v / step) * step));
  const stride = w * bpp;
  const rows = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const line = Buffer.alloc(stride);
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, d = x * bpp;
      const a = px[o + 3];
      if (!opaque && a === 0) continue; // fully transparent: colour doesn't matter, keep it 0
      line[d] = q(px[o]);
      line[d + 1] = q(px[o + 1]);
      line[d + 2] = q(px[o + 2]);
      if (!opaque) line[d + 3] = a;
    }
    let best = null, bestScore = Infinity;
    for (let f = 0; f <= 4; f++) {
      const out = Buffer.alloc(stride + 1);
      out[0] = f;
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pred = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
        const v = (line[i] - pred) & 0xff;
        out[i + 1] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        best = out;
      }
    }
    rows.push(best);
    prev = line;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = opaque ? 2 : 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9, memLevel: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const optimize = (png, opts) => encodePng(decodePng(png), opts);

const dataUrl = (file) => 'data:image/svg+xml;base64,' + readFileSync(src(file)).toString('base64');

async function render(page, w, h, imgs, opaque) {
  await page.setViewportSize({ width: w, height: h });
  const tags = imgs
    .map((i) => `<img src="${i.src}" style="position:absolute;left:${i.x}px;top:${i.y}px;width:${i.w}px;height:${i.h}px">`)
    .join('');
  await page.setContent(`<!doctype html><html><body style="margin:0">${tags}</body></html>`);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  return page.screenshot({ omitBackground: !opaque, clip: { x: 0, y: 0, width: w, height: h } });
}

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ deviceScaleFactor: 1 });
mkdirSync(out('public/mob'), { recursive: true });

// ---- atlas ----
// Frames are laid out on a fixed grid (cell = fw×fh), but each frame's quad is trimmed to the
// pixels it actually covers (+1 px), so the GPU doesn't shade empty padding for every unit.
const frames = {};
const sheets = {};
const imgs = [];
for (const s of SHEETS) imgs.push({ src: dataUrl(s.file), x: s.x, y: s.y, w: s.fw * s.frames, h: s.fh });
const atlasPng = await render(page, ATLAS_SIZE, ATLAS_SIZE, imgs, false);
const { px } = decodePng(atlasPng);
const alphaAt = (x, y) => px[(y * ATLAS_SIZE + x) * 4 + 3];
for (const s of SHEETS) {
  sheets[s.name] = { frames: s.frames, first: `${s.name}_0` };
  for (let k = 0; k < s.frames; k++) {
    const cx = s.x + k * s.fw, cy = s.y;
    let x0 = cx + s.fw, y0 = cy + s.fh, x1 = cx - 1, y1 = cy - 1;
    for (let y = cy; y < cy + s.fh; y++)
      for (let x = cx; x < cx + s.fw; x++)
        if (alphaAt(x, y) > 0) {
          x0 = Math.min(x0, x); x1 = Math.max(x1, x);
          y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
    // 1 px of transparent margin (inside the cell) keeps edges soft under bilinear filtering.
    x0 = Math.max(cx, x0 - 1); y0 = Math.max(cy, y0 - 1);
    x1 = Math.min(cx + s.fw - 1, x1 + 1); y1 = Math.min(cy + s.fh - 1, y1 + 1);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    frames[`${s.name}_${k}`] = {
      cell: [cx, cy, s.fw, s.fh],
      x: x0, y: y0, w, h,
      // UVs are inset by half a texel so bilinear sampling never reaches the neighbour frame.
      uv: [(x0 + 0.5) / ATLAS_SIZE, (y0 + 0.5) / ATLAS_SIZE, (x1 + 0.5) / ATLAS_SIZE, (y1 + 0.5) / ATLAS_SIZE].map((v) => +v.toFixed(6)),
      anchor: [(cx + s.anchor[0] - x0) / w, (cy + s.anchor[1] - y0) / h].map((v) => +v.toFixed(5)),
      unit: s.unit,
    };
  }
}
writeFileSync(out('public/mob/atlas.png'), optimize(atlasPng, { levels: ATLAS_LEVELS }));
const meta = {
  $comment: 'Generated by scripts/build-mob-assets.mjs — do not edit by hand.',
  image: 'mob/atlas.png',
  width: ATLAS_SIZE,
  height: ATLAS_SIZE,
  sheets,
  frames,
  textures: Object.fromEntries(TEXTURES.map((t) => [t.file.replace(/^mob\/|\.svg$/g, ''), { image: t.out.replace(/^public\//, ''), size: t.size }])),
};
writeFileSync(out('src/mob/render/atlas.json'), JSON.stringify(meta, null, 1) + '\n');

// ---- repeating textures ----
for (const t of TEXTURES) {
  const png = await render(page, t.size, t.size, [{ src: dataUrl(t.file), x: 0, y: 0, w: t.size, h: t.size }], t.opaque);
  writeFileSync(out(t.out), optimize(png));
}

// ---- app icon ----
copyFileSync(src('app-icon.svg'), out('public/icon.svg'));
for (const i of ICONS) {
  const png = await render(page, i.size, i.size, [{ src: dataUrl('app-icon.svg'), x: 0, y: 0, w: i.size, h: i.size }], true);
  writeFileSync(out(i.out), optimize(png, { levels: ICON_LEVELS }));
}

await browser.close();
console.log('mob assets built:', Object.keys(frames).length, 'atlas frames,', TEXTURES.length, 'textures,', ICONS.length, 'icons');
