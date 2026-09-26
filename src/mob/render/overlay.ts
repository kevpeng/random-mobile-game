import { gateLabel, isGood } from '../sim/levels';
import type { World } from '../sim/world';
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
      if (g.broken) continue;
      const p = r.toScreen((g.x0 + g.x1) / 2, GATE_H * 0.55, g.z);
      if (!p) continue;
      const size = Math.max(12, Math.min(34, p.scale * 190));
      ctx.font = `800 ${size}px -apple-system, system-ui, sans-serif`;
      const label = g.kind === 'sub' ? `−${Math.ceil(g.remaining)}` : gateLabel(g.kind, g.n);
      ctx.globalAlpha = g.cool > 0 ? 0.45 : 1;
      ctx.lineWidth = size * 0.18;
      ctx.strokeStyle = isGood(g.kind) ? 'rgba(8,60,90,0.85)' : 'rgba(110,10,30,0.85)';
      ctx.strokeText(label, p.x, p.y);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, p.x, p.y);
    }
    ctx.globalAlpha = 1;

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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  if (w <= 0) return;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2));
  ctx.fill();
}
