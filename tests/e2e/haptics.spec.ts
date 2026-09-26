import { expect, test, type Page } from '@playwright/test';

// Force the iOS path (no navigator.vibrate) and count taps on the hidden switch.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    delete (Navigator.prototype as { vibrate?: unknown }).vibrate;
    (window as unknown as { ticks: number }).ticks = 0;
    document.addEventListener(
      'click',
      (e) => {
        if ((e.target as Element).matches?.('input[switch]')) (window as unknown as { ticks: number }).ticks++;
      },
      true,
    );
  });
});

const ticks = (page: Page) => page.evaluate(() => (window as unknown as { ticks: number }).ticks);

test('iOS path plays one tick per finger-lift, and respects the setting', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => 'vibrate' in navigator)).toBe(false);
  await page.locator('.game-card', { hasText: 'Queens' }).tap();
  await expect(page.locator('.cell')).toHaveCount(64);
  const base = await ticks(page);

  await page.locator('.cell[data-i="0"]').tap();
  await expect(page.locator('.cell[data-i="0"] .x')).toHaveCount(1);
  await expect.poll(() => ticks(page)).toBe(base + 1);

  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect.poll(() => ticks(page)).toBe(base + 2);

  // Turn haptics off: no more ticks.
  await page.getByRole('button', { name: 'Menu' }).tap();
  await page.locator('label.toggle', { hasText: 'Haptics' }).tap();
  const afterToggle = await ticks(page);
  await page.locator('.sheet-backdrop').tap({ position: { x: 10, y: 10 } });
  await page.locator('.cell[data-i="1"]').tap();
  await expect(page.locator('.cell[data-i="1"] .x')).toHaveCount(1);
  await page.waitForTimeout(200);
  expect(await ticks(page)).toBe(afterToggle);
});

test('iOS path ticks in Sort too', async ({ page }) => {
  await page.goto('/');
  await page.locator('.game-card', { hasText: 'Sort' }).tap();
  await expect(page.locator('.tube').first()).toBeVisible();
  const base = await ticks(page);
  await page.locator('[data-tube="0"]').tap();
  await expect.poll(() => ticks(page)).toBe(base + 1);
  await page.locator('[data-tube="0"]').tap();
  await expect.poll(() => ticks(page)).toBe(base + 2);
});
