import { generatePuzzle } from '../game/generator';
import { randomSeed } from '../../shared/rng';
import type { Puzzle } from '../game/types';

/**
 * Generates puzzles in a Web Worker and keeps one ready per size, so
 * "New game" never waits on generation.
 */
let worker: Worker | null = null;
try {
  worker = new Worker(new URL('../worker/gen.worker.ts', import.meta.url), { type: 'module' });
} catch {
  worker = null;
}

let nextId = 0;
const pending = new Map<number, (p: Puzzle) => void>();
worker?.addEventListener('message', (e: MessageEvent<{ id: number; puzzle: Puzzle }>) => {
  pending.get(e.data.id)?.(e.data.puzzle);
  pending.delete(e.data.id);
});

function generate(size: number): Promise<Puzzle> {
  const seed = randomSeed();
  if (!worker) return Promise.resolve(generatePuzzle(size, seed));
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker!.postMessage({ id, size, seed });
  });
}

const ready = new Map<number, Promise<Puzzle>>();

export function prefetch(size: number): void {
  if (!ready.has(size)) ready.set(size, generate(size));
}

export function takePuzzle(size: number): Promise<Puzzle> {
  prefetch(size);
  const p = ready.get(size)!;
  ready.delete(size);
  p.then(() => prefetch(size));
  return p;
}
