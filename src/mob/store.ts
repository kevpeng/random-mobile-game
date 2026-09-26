import { effect, signal } from '@preact/signals';
import { load, save } from '../shared/storage';
import { canUpgrade, upgradeCost, type UpgradeKey } from './sim/economy';
import { NO_UPGRADES, type Upgrades } from './sim/world';

export interface Progress {
  level: number;
  coins: number;
  upgrades: Upgrades;
  endlessBest: number;
}

const KEY = 'mob:progress:v1';

export const progress = signal<Progress>(
  load(KEY, { level: 1, coins: 0, upgrades: { ...NO_UPGRADES }, endlessBest: 0 }),
);
effect(() => save(KEY, progress.value));

export function addCoins(n: number): void {
  progress.value = { ...progress.value, coins: progress.value.coins + n };
}

export function buy(key: UpgradeKey): boolean {
  const p = progress.value;
  const cost = upgradeCost(key, p.upgrades[key]);
  if (!canUpgrade(p.upgrades, key) || p.coins < cost) return false;
  progress.value = { ...p, coins: p.coins - cost, upgrades: { ...p.upgrades, [key]: p.upgrades[key] + 1 } };
  return true;
}

export function levelUp(): void {
  progress.value = { ...progress.value, level: progress.value.level + 1 };
}

/** Records an endless score; returns true if it's a new best. */
export function recordEndless(score: number): boolean {
  if (score <= progress.value.endlessBest) return false;
  progress.value = { ...progress.value, endlessBest: score };
  return true;
}
