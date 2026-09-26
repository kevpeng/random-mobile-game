/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the site from /<repo>/; override with BASE=/ for local previews.
const base = process.env.BASE ?? '/random-mobile-game/';

// Shown on the home screen so it's easy to tell which build a phone is running.
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
})();
const version = `${commit} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(version), __APP_COMMIT__: JSON.stringify(commit) },
  plugins: [
    preact(),
    {
      // version.json is never precached, so the app can always ask the server
      // which build is live (see src/shared/update.ts).
      name: 'version-json',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ commit, version }) });
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Puzzles',
        short_name: 'Puzzles',
        description: 'Queens and colour sort puzzles.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f3ee',
        theme_color: '#f6f3ee',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // A new service worker takes over immediately instead of waiting for every tab to close.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'] },
});
