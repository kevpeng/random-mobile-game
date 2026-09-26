import { expect, test, type Page } from '@playwright/test';
import { applyMove, colorsOf, moveCount, solve, type SortPuzzle } from '../../src/sort/game';

async function savedPuzzle(page: Page): Promise<{ puzzle: SortPuzzle; stacks: number[][] }> {
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('sort:game:v1');
    return raw && JSON.parse(raw).puzzle;
  });
  return page.evaluate(() => JSON.parse(localStorage.getItem('sort:game:v1')!));
}

async function tapTube(page: Page, i: number) {
  const box = (await page.locator(`[data-tube="${i}"]`).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7);
  await page.mouse.down();
  await page.mouse.up();
}

test('home → sort, pick up, move, undo, solve', async ({ page }) => {
  await page.goto('/');
  await page.screenshot({ path: 'test-results/sort-00-home.png' });
  await page.locator('.game-card', { hasText: 'Sort' }).click();
  await expect(page.locator('.ball')).toHaveCount(28); // Medium: 7 colours × 4
  const { puzzle, stacks } = await savedPuzzle(page);
  const cap = puzzle.config.height;
  await page.screenshot({ path: 'test-results/sort-01-start.png' });

  // Tapping a tube lifts it; tapping again puts it back.
  await tapTube(page, 0);
  await expect(page.locator('.tube--sel')).toHaveCount(1);
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/sort-02-lifted.png' });
  await tapTube(page, 0);
  await expect(page.locator('.tube--sel')).toHaveCount(0);

  // A legal move into an empty tube, then undo.
  const empty = stacks.findIndex((s) => s.length === 0);
  await tapTube(page, 0);
  await tapTube(page, empty);
  await expect(page.locator('.timer')).toHaveText('1');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.timer')).toHaveText('2');

  // Hint highlights two tubes.
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.locator('.tube--hint')).toHaveCount(2);

  // Solve with the solver's move list.
  let cs = colorsOf(puzzle, stacks);
  const path = solve(cs, cap)!;
  for (const [f, t] of path) {
    await tapTube(page, f);
    await tapTube(page, t);
    cs = applyMove(cs, f, t, moveCount(cs, f, t, cap));
  }
  await expect(page.getByRole('dialog', { name: 'Solved' })).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/sort-03-win.png' });
  await page.getByRole('button', { name: 'Next puzzle' }).click();
  await expect(page.getByRole('dialog', { name: 'Solved' })).toHaveCount(0);
});

test('sort menu presets and back to home', async ({ page }) => {
  await page.goto('/');
  await page.locator('.game-card', { hasText: 'Sort' }).click();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/sort-04-menu.png' });
  await page.locator('.presets .size', { hasText: 'Expert' }).click();
  await expect(page.locator('.ball')).toHaveCount(60);
  await expect(page.locator('.tube')).toHaveCount(14);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/sort-05-expert.png' });
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.game-card')).toHaveCount(2);
});

test('sort dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.locator('.game-card', { hasText: 'Sort' }).click();
  await expect(page.locator('.ball').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/sort-06-dark.png' });
});
