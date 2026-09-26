import { expect, test, type Page } from '@playwright/test';

type Hook = { world: () => any; run: (s: number) => void; screenX: (x: number) => number };
const hook = (page: Page) => page.evaluate(() => !!(window as unknown as { __mob?: Hook }).__mob);

async function openMob(page: Page) {
  await page.goto('/?mobtest');
  await page.locator('.game-card', { hasText: 'Mob' }).click();
  await expect(page.getByRole('dialog', { name: 'Mob' })).toBeVisible();
  await expect.poll(() => hook(page)).toBe(true);
}

test('level flow: steer, win, earn coins, buy an upgrade, lose, retry', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openMob(page);
  await page.screenshot({ path: 'test-results/mob-01-menu.png' });
  await page.getByRole('button', { name: 'Play level 1' }).click();
  await expect(page.locator('.mob__count')).toBeVisible();

  // Dragging right steers the cannon right (relative drag).
  const box = (await page.locator('.mob__stage').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.7, { steps: 8 });
  await page.mouse.up();
  const target = await page.evaluate(() => (window as unknown as { __mob: Hook }).__mob.world().targetX);
  expect(target).toBeGreaterThan(0.5);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/mob-02-play.png' });

  // Fast-forward: aim down the middle and play until the tower falls.
  await page.evaluate(() => {
    const m = (window as unknown as { __mob: Hook }).__mob;
    m.world().targetX = 0;
    m.run(200);
  });
  const won = page.getByRole('dialog', { name: 'Level cleared' });
  await expect(won).toBeVisible();
  await expect(won).toContainText('+');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/mob-03-won.png' });
  const coins = Number((await page.locator('.mob__coins').textContent())!.replace(/\D/g, ''));
  expect(coins).toBeGreaterThan(30);

  // Shop: buy fire rate.
  await won.getByRole('button', { name: 'Upgrades' }).click();
  const shop = page.getByRole('dialog', { name: 'Upgrades' });
  const fire = shop.locator('.mob__upgrade', { hasText: 'Fire rate' });
  await expect(fire).toContainText('Lv 0');
  await fire.getByRole('button').click();
  await expect(fire).toContainText('Lv 1');
  await page.screenshot({ path: 'test-results/mob-04-shop.png' });
  await shop.getByRole('button', { name: 'Done' }).click();

  // Level 2, then get overrun.
  await page.getByRole('button', { name: 'Play level 2' }).click();
  await page.evaluate(() => {
    const w = (window as unknown as { __mob: Hook }).__mob.world();
    w.enemies.add(0, 0.62, 25);
  });
  const lost = page.getByRole('dialog', { name: 'Base overrun' });
  await expect(lost).toBeVisible();
  await lost.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.mob__count')).toBeVisible();
  await expect(page.locator('.mob__chip')).toHaveText('Level 2');
  expect(errors).toEqual([]);
});

test('endless mode records a best score', async ({ page }) => {
  await openMob(page);
  await page.getByRole('button', { name: /Endless/ }).click();
  await page.evaluate(() => (window as unknown as { __mob: Hook }).__mob.run(20));
  await page.evaluate(() => (window as unknown as { __mob: Hook }).__mob.world().enemies.add(0, 0.62, 25));
  const over = page.getByRole('dialog', { name: 'Endless over' });
  await expect(over).toBeVisible();
  await expect(over).toContainText('New best');
  const best = await page.evaluate(() => JSON.parse(localStorage.getItem('mob:progress:v1')!).endlessBest);
  expect(best).toBeGreaterThan(0);
  await over.getByRole('button', { name: 'Back to levels' }).click();
  await expect(page.getByRole('button', { name: new RegExp(`best ${best}`) })).toBeVisible();
});

test('dark mode renders', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openMob(page);
  await page.getByRole('button', { name: 'Play level 1' }).click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: 'test-results/mob-05-dark.png' });
});

test('steering follows the finger: drag right moves the cannon right on screen', async ({ page }) => {
  await openMob(page);
  await page.getByRole('button', { name: 'Play level 1' }).click();
  const box = (await page.locator('.mob__stage').boundingBox())!;
  const y = box.y + box.height * 0.7;
  const cannonScreenX = () =>
    page.evaluate(() => {
      const m = (window as unknown as { __mob: Hook }).__mob;
      return m.screenX(m.world().cannonX);
    });
  const drag = async (fromFrac: number, toFrac: number) => {
    await page.mouse.move(box.x + box.width * fromFrac, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * toFrac, y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400); // cannon glides to the target
  };

  // +x in the sim is drawn on the right half of the screen.
  const right = await page.evaluate(() => (window as unknown as { __mob: Hook }).__mob.screenX(0.8));
  const left = await page.evaluate(() => (window as unknown as { __mob: Hook }).__mob.screenX(-0.8));
  expect(right).toBeGreaterThan(box.width / 2);
  expect(left).toBeLessThan(box.width / 2);

  const start = await cannonScreenX();
  await drag(0.5, 0.8);
  const afterRight = await cannonScreenX();
  expect(afterRight).toBeGreaterThan(start + 40);
  await drag(0.8, 0.3);
  const afterLeft = await cannonScreenX();
  expect(afterLeft).toBeLessThan(start - 40);
});
