import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

test('desktop: a labelled Home button sits with the game, and Esc goes home', async ({ page }) => {
  await page.goto('/?mobtest');
  for (const game of ['Queens', 'Sort', 'Mob']) {
    await page.locator('.game-card', { hasText: game }).click();
    const back = page.getByRole('button', { name: 'Back' });
    await expect(back).toBeVisible();
    await expect(back).toContainText('Home');
    const box = (await back.boundingBox())!;
    // Within the centred 680px column, not stranded in the window's corner.
    expect(box.x).toBeGreaterThan((1280 - 680) / 2 - 1);
    await back.click();
    await expect(page.locator('.game-card')).toHaveCount(3);
  }
  await page.locator('.game-card', { hasText: 'Sort' }).click();
  await expect(page.locator('.tube').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.game-card')).toHaveCount(3);
  await page.locator('.game-card', { hasText: 'Queens' }).click();
  await page.screenshot({ path: 'test-results/desktop-queens.png' });
});
