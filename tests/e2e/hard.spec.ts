import { expect, test, type Page } from '@playwright/test';

async function tapCell(page: Page, i: number) {
  const box = (await page.locator(`.cell[data-i="${i}"]`).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
}

test('hard mode: taps toggle crowns, no ✕ marks, separate best', async ({ page }) => {
  await page.goto('/');
  await page.locator('.game-card', { hasText: 'Queens' }).click();
  await expect(page.locator('.cell')).toHaveCount(64);

  // An ✕ from normal mode gets wiped when hard mode is switched on.
  await tapCell(page, 0);
  await expect(page.locator('.cell[data-i="0"] .x')).toHaveCount(1);
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.locator('label.toggle', { hasText: 'Auto-✕' })).toHaveCount(1);
  await page.locator('label.toggle', { hasText: 'Hard mode' }).click();
  await expect(page.locator('label.toggle', { hasText: 'Auto-✕' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/hard-01-menu.png' });
  await page.locator('.sheet-backdrop').click({ position: { x: 10, y: 10 } });
  await expect(page.locator('.chip')).toContainText('Hard');
  await expect(page.locator('.cell .x')).toHaveCount(0);

  // One tap = crown, and no auto-✕ around it.
  await tapCell(page, 0);
  await expect(page.locator('.cell[data-i="0"] .queen')).toHaveCount(1);
  await expect(page.locator('.cell .x')).toHaveCount(0);

  // Dragging paints nothing.
  const a = (await page.locator('.cell[data-i="56"]').boundingBox())!;
  const b = (await page.locator('.cell[data-i="63"]').boundingBox())!;
  await page.mouse.move(a.x + 5, a.y + 5);
  await page.mouse.down();
  await page.mouse.move(b.x + 5, b.y + 5, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.cell .x')).toHaveCount(0);
  await expect(page.locator('.cell .queen')).toHaveCount(2); // 0 and 56

  // Tapping a crown removes it.
  await tapCell(page, 56);
  await tapCell(page, 0);
  await expect(page.locator('.cell .queen')).toHaveCount(0);

  // Solve in hard mode; the best time is stored under the hard key.
  const { puzzle } = await page.evaluate(() => JSON.parse(localStorage.getItem('queens:game:v1')!));
  for (let r = 0; r < puzzle.size; r++) await tapCell(page, r * puzzle.size + puzzle.solution[r]);
  const win = page.getByRole('dialog', { name: 'Solved' });
  await expect(win).toBeVisible();
  await expect(win).toContainText('Hard');
  const bests = await page.evaluate(() => JSON.parse(localStorage.getItem('queens:bests:v1')!));
  expect(Object.keys(bests)).toContain('8h');
  expect(Object.keys(bests)).not.toContain('8');
});
