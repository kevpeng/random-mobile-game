import type { Upgrades } from './world';

export type UpgradeKey = keyof Upgrades;

export const UPGRADES: { key: UpgradeKey; name: string; blurb: string; base: number; max: number }[] = [
  { key: 'troops', name: 'Bigger crowd', blurb: '+5 troops at the start', base: 30, max: 12 },
  { key: 'rally', name: 'Rally', blurb: 'Recruits join as you run', base: 50, max: 6 },
  { key: 'boost', name: 'Head start', blurb: 'Free multiplier at the start line', base: 120, max: 3 },
];

export function upgradeCost(key: UpgradeKey, level: number): number {
  const u = UPGRADES.find((u) => u.key === key)!;
  return Math.round(u.base * Math.pow(1.6, level));
}

export const canUpgrade = (u: Upgrades, key: UpgradeKey) => u[key] < UPGRADES.find((x) => x.key === key)!.max;

/** Coins for beating level `n`; a bonus for troops left over. */
export const winCoins = (n: number, troopsLeft: number) => 20 + 8 * n + Math.min(60, Math.floor(troopsLeft / 2));

/** Consolation for a loss: a share of the damage dealt, so progress never stalls. */
export const lossCoins = (n: number, towerDamageShare: number) => Math.floor((10 + 4 * n) * towerDamageShare);

/** Spends coins on the cheapest affordable upgrades (used by the balance bot). */
export function autoBuy(u: Upgrades, coins: number): { upgrades: Upgrades; coins: number } {
  const next = { ...u };
  for (;;) {
    const options = UPGRADES.filter((x) => canUpgrade(next, x.key))
      .map((x) => ({ key: x.key, cost: upgradeCost(x.key, next[x.key]) }))
      .sort((a, b) => a.cost - b.cost);
    const best = options[0];
    if (!best || best.cost > coins) return { upgrades: next, coins };
    coins -= best.cost;
    next[best.key]++;
  }
}
