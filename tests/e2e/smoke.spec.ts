import { expect, test, type Page } from '@playwright/test';

interface Saved {
  puzzle: { size: number; solution: number[] };
}

async function saved(page: Page): Promise<Saved> {
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('queens:game:v1');
    return raw && JSON.parse(raw).puzzle;
  });
  return page.evaluate(() => JSON.parse(localStorage.getItem('queens:game:v1')!));
}

async function cellCenter(page: Page, i: number) {
  const box = (await page.locator(`.cell[data-i="${i}"]`).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function tap(page: Page, i: number) {
  const { x, y } = await cellCenter(page, i);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

test('tap cycle, drag, undo and solving a puzzle', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.cell')).toHaveCount(64);
  const { puzzle } = await saved(page);
  const n = puzzle.size;
  await page.screenshot({ path: 'test-results/01-start.png' });

  // Tap cycle: empty → ✕ → queen → empty.
  await tap(page, 0);
  await expect(page.locator('.cell[data-i="0"] .x:not(.x--auto)')).toHaveCount(1);
  await tap(page, 0);
  await expect(page.locator('.cell[data-i="0"] .queen')).toHaveCount(1);
  // Auto-✕ marks the rest of row 0.
  await expect(page.locator('.cell[data-i="1"] .x--auto')).toHaveCount(1);
  await tap(page, 0);
  await expect(page.locator('.cell[data-i="0"] .piece')).toHaveCount(0);

  // Drag across the last row paints ✕s in one gesture.
  const a = await cellCenter(page, n * (n - 1));
  const b = await cellCenter(page, n * n - 1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.cell .x:not(.x--auto)')).toHaveCount(n);
  await page.screenshot({ path: 'test-results/02-drag.png' });
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.cell .x:not(.x--auto)')).toHaveCount(0);

  // Two touching queens are flagged.
  const [c0, c1] = [puzzle.solution[0], puzzle.solution[1]];
  await tap(page, c0); await tap(page, c0);
  const wrong = c0 === 0 ? n + 1 : n + c0 - 1; // diagonal neighbour in row 1
  if (wrong % n !== c1) {
    await tap(page, wrong); await tap(page, wrong);
    await expect(page.locator('.cell--bad')).toHaveCount(2);
    await page.screenshot({ path: 'test-results/03-conflict.png' });
    await tap(page, wrong);
  }
  await expect(page.locator('.cell--bad')).toHaveCount(0);

  // Solve the rest.
  for (let r = 1; r < n; r++) {
    const i = r * n + puzzle.solution[r];
    await tap(page, i); await tap(page, i);
  }
  await expect(page.getByRole('dialog', { name: 'Solved' })).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/04-win.png' });

  await page.getByRole('button', { name: 'Next puzzle' }).click();
  await expect(page.getByRole('dialog', { name: 'Solved' })).toHaveCount(0);
  await expect(page.locator('.cell .piece')).toHaveCount(0);
});

test('menu switches size and state survives reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.screenshot({ path: 'test-results/05-menu.png' });
  await page.locator('.size', { hasText: '6' }).first().click();
  await expect(page.locator('.cell')).toHaveCount(36);
  await tap(page, 7);
  await page.reload();
  await expect(page.locator('.cell')).toHaveCount(36);
  await expect(page.locator('.cell[data-i="7"] .x')).toHaveCount(1);
});

test('dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('.cell').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/06-dark.png' });
});
