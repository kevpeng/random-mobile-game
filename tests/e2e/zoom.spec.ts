import { expect, test } from '@playwright/test';

test('rapid double tap on a button still fires twice and does not zoom', async ({ page }) => {
  await page.goto('/');
  await page.locator('.game-card', { hasText: 'Queens' }).tap();
  await expect(page.locator('.cell')).toHaveCount(64);
  // Three marks; a double tap on Undo must undo exactly two (not one, not three).
  for (const i of [0, 9, 18]) {
    const box = (await page.locator(`.cell[data-i="${i}"]`).boundingBox())!;
    await page.mouse.move(box.x + 5, box.y + 5);
    await page.mouse.down();
    await page.mouse.up();
  }
  await expect(page.locator('.cell .x:not(.x--auto)')).toHaveCount(3);
  const undo = page.getByRole('button', { name: 'Undo' });
  await undo.tap();
  await undo.tap(); // well within 350ms of the first
  await page.waitForTimeout(400);
  await expect(page.locator('.cell .x:not(.x--auto)')).toHaveCount(1);
  expect(await page.evaluate(() => visualViewport?.scale ?? 1)).toBe(1);
});

test('every touch outside the menu sheet is cancelled, so iOS has nothing to zoom', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { prevented: string[] }).prevented = [];
    // Registered after the app's capture listener; runs in the bubble phase.
    document.addEventListener('touchstart', (e) => {
      const el = e.target as Element;
      (window as unknown as { prevented: string[] }).prevented.push(
        `${el.closest('.sheet') ? 'sheet' : 'app'}:${e.defaultPrevented}`,
      );
    });
  });
  await page.goto('/');
  await page.locator('.game-card', { hasText: 'Queens' }).tap(); // home card → synthetic click still navigates
  await expect(page.locator('.cell')).toHaveCount(64);
  await page.waitForTimeout(600);
  await page.locator('.cell[data-i="5"]').tap();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Menu' }).tap();
  await page.waitForTimeout(600);
  await page.locator('label.toggle', { hasText: 'Sound' }).tap(); // single tap inside the sheet: native
  const log = await page.evaluate(() => (window as unknown as { prevented: string[] }).prevented);
  expect(log).toEqual(['app:true', 'app:true', 'app:true', 'sheet:false']);
  // The sheet tap still toggled the switch exactly once.
  await expect(page.locator('label.toggle', { hasText: 'Sound' }).locator('input')).toBeChecked();
});
