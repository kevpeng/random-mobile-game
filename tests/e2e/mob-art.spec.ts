import { expect, test, type Page } from '@playwright/test';

// Loads the sprite art and captures reference screenshots (test-results/art-*.png) for review.
type Hook = { world: () => any; run: (s: number) => void; artReady: () => boolean };
const mob = <T,>(page: Page, fn: (m: Hook) => T) =>
  page.evaluate((src) => new Function('m', `return (${src})(m)`)((window as any).__mob), fn.toString()) as Promise<T>;

async function play(page: Page, scheme: string) {
  await page.goto('/?mobtest');
  await page.screenshot({ path: `test-results/art-home-${scheme}.png` });
  await page.locator('.game-card', { hasText: 'Mob' }).click();
  await expect(page.getByRole('dialog', { name: 'Mob' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!(window as any).__mob?.artReady())).toBe(true);
}

test('sprite art loads and renders (light)', async ({ page }) => {
  test.setTimeout(120_000); // thousands of sprites are slow on headless software GL
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await play(page, 'light');
  await page.screenshot({ path: 'test-results/art-menu.png' });
  await page.getByRole('button', { name: 'Play level 1' }).click();
  await page.waitForTimeout(4500);
  await page.screenshot({ path: 'test-results/art-play.png' });

  // A big fight: thousands of units on screen at once.
  await mob(page, (m) => {
    const w = m.world();
    for (let i = 0; i < 2400; i++) w.players.add(-0.9 + Math.random() * 1.8, 1 + Math.random() * 4, i % 40 ? 1 : 10);
    for (let i = 0; i < 1400; i++) w.enemies.add(-0.9 + Math.random() * 1.8, 5 + Math.random() * 4, i % 30 ? 1 : 12);
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/art-crowd.png' });
  const fps = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const tick = () => (++n < 15 ? requestAnimationFrame(tick) : resolve((n * 1000) / (performance.now() - t0)));
        requestAnimationFrame(tick);
      }),
  );
  console.log(`crowd fps (headless, software GL): ${fps.toFixed(1)}`);

  // A powered-up gun and a gate rolling in.
  await mob(page, (m) => {
    const w = m.world();
    w.players.n = 0;
    w.enemies.n = 0;
    w.perShot = 12;
    w.fireRate = 8;
    m.run(2);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/art-volley.png' });
  expect(errors).toEqual([]);
});

test('sprite art renders (dark) and the shop shows icons', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await play(page, 'dark');
  await page.getByRole('button', { name: 'Play level 1' }).click();
  await page.waitForTimeout(4500);
  await page.screenshot({ path: 'test-results/art-dark.png' });
  await mob(page, (m) => m.world().enemies.add(0, 0.62, 25));
  await page.getByRole('dialog', { name: 'Base overrun' }).getByRole('button', { name: 'Upgrades' }).click();
  const shop = page.getByRole('dialog', { name: 'Upgrades' });
  await expect(shop.locator('.mob__upicon')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/art-shop-dark.png' });
});
