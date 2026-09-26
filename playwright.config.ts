import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    ...devices['iPhone 15'],
    browserName: 'chromium',
    baseURL: 'http://localhost:4173/',
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: 'BASE=/ npm run build && npx vite preview --port 4173',
    env: { BASE: '/' },
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
