import { gateLabel, isGood } from '../sim/levels';
import { CROWD_SHOWN, CROWD_SPACING } from '../sim/levels';
import { CROWD_Z, type World } from '../sim/world';
import { GATE_H, type Renderer } from './renderer';

export interface Floater {
  text: string;
  x: number; // sim coords
  z: number;
  age: number;
  good: boolean;
}

/** 2D canvas over the WebGL view: gate labels, tower health, floating numbers. */
export class Overlay {
  private ctx: CanvasRenderingContext2D;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(w: number, h: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(w: World, r: Renderer, floaters: Floater[]): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    for (const g of w.gates) {
      if (g.broken || g.passed || g.z > w.length + 1) continue;
      const p = r.toScreen((g.x0 + g.x1) / 2, GATE_H * 0.55, g.z);
      if (!p) continue;
      const size = Math.max(12, Math.min(34, p.scale * 190));
      ctx.font = `800 ${size}px -apple-system, system-ui, sans-serif`;
      const label = gateLabel(g.kind, g.n);
      ctx.lineWidth = size * 0.18;
      ctx.strokeStyle = isGood(g.kind) ? 'rgba(8,60,90,0.85)' : 'rgba(110,10,30,0.85)';
      ctx.strokeText(label, p.x, p.y);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, p.x, p.y);
    }

    // Enemy squads: how many troops each one will cost.
    for (const s of w.squads) {
      if (s.left <= 0 || s.z > w.length + 1 || s.z + s.depth < CROWD_Z - 0.5) continue;
      const p = r.toScreen(s.x, 0.55, s.z + s.depth);
      if (p) bubble(ctx, String(s.left), p.x, p.y, Math.max(11, Math.min(20, p.scale * 110)), '#e11d48');
    }

    // Your crowd: the troop count it carries.
    if (w.troops > 0) {
      const back = CROWD_SPACING * Math.sqrt(Math.min(w.troops, CROWD_SHOWN)) * 0.9; // formation's far edge
      const p = r.toScreen(w.crowdX, 0, CROWD_Z + back);
      // Just above the back row's heads (sprites stand ~30 px tall on a phone).
      if (p) bubble(ctx, String(w.troops), p.x, p.y - 44, 20, '#2563eb');
    }

    if (!w.endless) {
      const top = r.towerTop;
      if (top) {
        const bw = Math.max(70, top.scale * 330), bh = 8;
        const frac = w.towerHp / w.towerMax;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        roundRect(ctx, top.x - bw / 2, top.y - bh / 2, bw, bh, 4);
        ctx.fillStyle = '#ef4444';
        roundRect(ctx, top.x - bw / 2, top.y - bh / 2, bw * frac, bh, 4);
        ctx.font = '700 12px -apple-system, system-ui, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 3;
        const t = String(Math.ceil(w.towerHp));
        ctx.strokeText(t, top.x, top.y - 14);
        ctx.fillText(t, top.x, top.y - 14);
      }
    }

    for (const f of floaters) {
      const p = r.toScreen(f.x, 0.9 + f.age * 1.2, f.z);
      if (!p) continue;
      ctx.globalAlpha = Math.max(0, 1 - f.age / 0.9);
      const size = Math.max(12, Math.min(26, p.scale * 150));
      ctx.font = `800 ${size}px -apple-system, system-ui, sans-serif`;
      ctx.lineWidth = size * 0.2;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.strokeText(f.text, p.x, p.y);
      ctx.fillStyle = f.good ? '#a5f3fc' : '#fecdd3';
      ctx.fillText(f.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }
}

/** A pill with a number in it, centred on (x, y). */
function bubble(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, bg: string): void {
  ctx.font = `800 ${size}px -apple-system, system-ui, sans-serif`;
  const w = Math.max(size * 1.6, ctx.measureText(text).width + size * 0.9), h = size * 1.35;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x, y + size * 0.04);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  if (w <= 0) return;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2));
  ctx.fill();
}
