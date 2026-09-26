import { useEffect, useRef } from 'preact/hooks';

const COLORS = ['#bba3e2', '#ffc992', '#96beff', '#b3dfa0', '#ff7b60', '#e6f388', '#dfa0bf', '#a3d2d8'];

/** One short confetti burst on a canvas; removed from the DOM by its parent. */
export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d');
    if (!ctx || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = (canvas.width = innerWidth * dpr);
    const h = (canvas.height = innerHeight * dpr);
    const parts = Array.from({ length: 140 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.2,
      y: h * 0.45,
      vx: (Math.random() - 0.5) * 22 * dpr,
      vy: (-Math.random() * 22 - 8) * dpr,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      s: (5 + Math.random() * 6) * dpr,
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = Math.max(0, 1 - t / 1800);
      for (const p of parts) {
        p.vy += 0.9 * dpr;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      }
      if (t < 1800) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} class="confetti" aria-hidden="true" />;
}
