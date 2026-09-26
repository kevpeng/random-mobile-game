import { generatePuzzle } from '../game/generator';

self.onmessage = (e: MessageEvent<{ id: number; size: number; seed: number }>) => {
  const { id, size, seed } = e.data;
  (self as unknown as Worker).postMessage({ id, puzzle: generatePuzzle(size, seed) });
};
