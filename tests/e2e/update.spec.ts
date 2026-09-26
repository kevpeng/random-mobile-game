import { expect, test } from '@playwright/test';

test('reports up to date when the live build matches', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.home__version')).toContainText('Up to date', { timeout: 10_000 });
});

test('a newer live build triggers one cache reset + reload, never a loop', async ({ page }) => {
  // The server claims a newer build is live (e.g. the CDN still serves old files).
  await page.route('**/version.json*', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ commit: 'newer01' }) }),
  );
  let loads = 0;
  page.on('load', () => loads++);
  await page.goto('/');
  await expect(page.locator('.home__version')).toContainText('Updating to newer01', { timeout: 10_000 });
  // After ~6s without the service worker taking over, caches are cleared and the page reloads once…
  await expect.poll(() => loads, { timeout: 15_000 }).toBe(2);
  // …and it doesn't do it again for the same build.
  await page.waitForTimeout(9000);
  expect(loads).toBe(2);
});

test('force refresh clears caches and reloads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.game-card')).toHaveCount(2);
  let loads = 0;
  page.on('load', () => loads++);
  await page.getByRole('button', { name: 'Force refresh' }).click();
  await expect.poll(() => loads).toBe(1);
  // Reloaded from the network (the fresh service worker re-caches it) and still works.
  await expect(page.locator('.game-card')).toHaveCount(2);
});
