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

  // A big crowd running into a squad.
  await mob(page, (m) => {
    m.world().troops = 400;
    m.run(3);
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

  // Near the base: it has come into view and is crumbling.
  await mob(page, (m) => {
    const w = m.world();
    w.troops = 400;
    for (let s = 0; s < 60 * 20 && w.towerZ > 6; s++) w.step();
    w.towerHp = w.towerMax * 0.2;
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/art-crumbling.png' });
  expect(errors).toEqual([]);
});

test('sprite art renders (dark) and the shop shows icons', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await play(page, 'dark');
  await page.getByRole('button', { name: 'Play level 1' }).click();
  await page.waitForTimeout(4500);
  await page.screenshot({ path: 'test-results/art-dark.png' });
  await mob(page, (m) => {
    m.world().troops = 0;
  });
  await page.getByRole('dialog', { name: 'Out of troops' }).getByRole('button', { name: 'Upgrades' }).click();
  const shop = page.getByRole('dialog', { name: 'Upgrades' });
  await expect(shop.locator('.mob__upicon')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/art-shop-dark.png' });
});
