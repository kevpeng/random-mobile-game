import { shared } from './settings';

let ctx: AudioContext | null = null;

function blip(freq: number, dur = 0.05, when = 0, gain = 0.08): void {
  if (!shared.value.sound) return;
  ctx ??= new AudioContext();
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur);
}

export const sound = {
  mark: () => blip(520, 0.035, 0, 0.05),
  queen: () => blip(760, 0.07),
  conflict: () => {
    blip(220, 0.08);
    blip(180, 0.1, 0.07);
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.16, i * 0.09, 0.07)),
};
