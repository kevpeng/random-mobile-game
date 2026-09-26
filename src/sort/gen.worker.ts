import { generateSort, solve, type SortConfig, type Stacks } from './game';

type Req =
  | { id: number; type: 'gen'; config: SortConfig; seed: number }
  | { id: number; type: 'solve'; stacks: Stacks; cap: number };

self.onmessage = (e: MessageEvent<Req>) => {
  const r = e.data;
  const result = r.type === 'gen' ? generateSort(r.config, r.seed) : solve(r.stacks, r.cap, 400_000);
  (self as unknown as Worker).postMessage({ id: r.id, result });
};
