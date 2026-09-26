import { analyze, generateSort, lastWinnable, type SortConfig, type Stacks } from './game';

type Req =
  | { id: number; type: 'gen'; config: SortConfig; seed: number }
  | { id: number; type: 'analyze'; stacks: Stacks; cap: number }
  | { id: number; type: 'rescue'; history: Stacks[]; cap: number };

const BUDGET = 400_000;

self.onmessage = (e: MessageEvent<Req>) => {
  const r = e.data;
  const result =
    r.type === 'gen'
      ? generateSort(r.config, r.seed)
      : r.type === 'analyze'
        ? analyze(r.stacks, r.cap, BUDGET)
        : lastWinnable(r.history, r.cap, BUDGET);
  (self as unknown as Worker).postMessage({ id: r.id, result });
};
