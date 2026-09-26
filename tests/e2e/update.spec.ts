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
  await expect(page.locator('.game-card')).toHaveCount(3);
  let loads = 0;
  page.on('load', () => loads++);
  await page.getByRole('button', { name: 'Force refresh' }).click();
  await expect.poll(() => loads).toBe(1);
  // Reloaded from the network (the fresh service worker re-caches it) and still works.
  await expect(page.locator('.game-card')).toHaveCount(3);
});

test('force refresh keeps the saved copy when the live site is broken', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.game-card')).toHaveCount(3);
  // Wait for the service worker to cache the app.
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).length), { timeout: 15_000 }).toBeGreaterThan(0);
  // The server now serves the raw source (what GitHub's branch deploy publishes).
  await page.route('**/index.html*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><div id="app"></div><script type="module" src="/src/main.tsx"></script>',
    }),
  );
  await page.route('**/version.json*', (route) => route.fulfill({ status: 404, body: 'Not Found' }));
  let loads = 0;
  page.on('load', () => loads++);
  await page.getByRole('button', { name: 'Force refresh' }).click();
  await expect(page.locator('.home__version')).toContainText('live site is broken');
  await page.waitForTimeout(1000);
  expect(loads).toBe(0);
  expect(await page.evaluate(async () => (await caches.keys()).length)).toBeGreaterThan(0);
  await expect(page.locator('.game-card')).toHaveCount(3);
});
