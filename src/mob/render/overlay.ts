import { gateCaption, gateLabel, isGood } from '../sim/levels';
import { CANNON_Z, type World } from '../sim/world';
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
      const p = r.toScreen((g.x0 + g.x1) / 2, GATE_H * 0.62, g.z);
      if (!p) continue;
      const size = Math.max(12, Math.min(34, p.scale * 190));
      ctx.globalAlpha = g.cool > 0 ? 0.45 : 1;
      ctx.lineWidth = size * 0.18;
      ctx.strokeStyle = isGood(g.kind) ? 'rgba(8,60,90,0.85)' : 'rgba(110,10,30,0.85)';
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${size}px -apple-system, system-ui, sans-serif`;
      const label = gateLabel(g.kind, g.n);
      ctx.strokeText(label, p.x, p.y);
      ctx.fillText(label, p.x, p.y);
      // What it changes, small underneath.
      const cs = Math.max(8, size * 0.42);
      ctx.font = `700 ${cs}px -apple-system, system-ui, sans-serif`;
      ctx.lineWidth = cs * 0.25;
      const cap = gateCaption(g.kind);
      ctx.strokeText(cap, p.x, p.y + size * 0.72);
      ctx.fillText(cap, p.x, p.y + size * 0.72);
    }
    ctx.globalAlpha = 1;

    // The gun's current stats, just below it (above it is the bullet stream).
    const gun = r.toScreen(w.cannonX, 0, CANNON_Z);
    if (gun) {
      const rate = Number.isInteger(w.fireRate) ? String(w.fireRate) : w.fireRate.toFixed(1);
      bubble(ctx, `×${w.perShot} · ${rate}/s`, gun.x, gun.y + 20, 14, '#2563eb');
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

/** A pill with text in it, centred on (x, y). */
function bubble(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, bg: string): void {
  ctx.font = `800 ${size}px -apple-system, system-ui, sans-serif`;
  const w = ctx.measureText(text).width + size * 1.1, h = size * 1.6;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x, y + size * 0.04);
}
