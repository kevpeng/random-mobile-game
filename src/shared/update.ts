import { signal } from '@preact/signals';
import { registerSW } from 'virtual:pwa-register';

/**
 * Keeps the installed app on the latest deploy.
 *
 * The service worker serves the cached build instantly and normally only checks
 * for a new one on a fresh page load, which an iPhone home-screen app rarely
 * does. So on launch and whenever the app comes back to the foreground we ask
 * the server which build is live (version.json, never cached). If it's newer,
 * we update the service worker and reload; if that doesn't take, we clear the
 * app's caches and reload (at most once per build, so it can't loop while the
 * CDN still serves the old files).
 *
 * Caches are only ever cleared after checking that the live site is a real
 * build. If the server is serving something broken (e.g. GitHub Pages
 * publishing the raw source instead of the build), the saved copy is kept.
 */
export type UpdateStatus = 'idle' | 'checking' | 'latest' | 'updating' | 'offline' | 'unknown' | 'broken';
export const updateStatus = signal<UpdateStatus>('idle');
export const liveCommit = signal<string | null>(null);

const BASE = import.meta.env.BASE_URL;
const FOREGROUND_THROTTLE_MS = 30_000;
const RESET_KEY = 'puzzles:reset-for';

const session = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) sessionStorage.removeItem(k);
      else sessionStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

let registration: ServiceWorkerRegistration | undefined;
let lastCheck = 0;

async function fetchLiveCommit(): Promise<string | null> {
  // A unique URL skips the CDN's cache as well as the browser's.
  const res = await fetch(`${BASE}version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const data = (await res.json()) as { commit?: string };
  return data.commit ?? null;
}

/**
 * True if the server is serving a real build: index.html loads a bundled
 * script from /assets/ (not the raw /src/main.tsx) and version.json exists.
 */
export async function liveSiteHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}index.html?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return false;
    const html = await res.text();
    if (!html.includes('/assets/') || html.includes('src/main.tsx')) return false;
    return (await fetchLiveCommit()) !== null;
  } catch {
    return false;
  }
}

/** Drops every cache and service worker, then reloads from the network — but only if the live site is healthy. */
export async function forceRefresh(): Promise<void> {
  updateStatus.value = 'checking';
  if (!(await liveSiteHealthy())) {
    updateStatus.value = 'broken'; // keep the working saved copy
    return;
  }
  updateStatus.value = 'updating';
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = (await caches?.keys()) ?? [];
    await Promise.all(keys.map((k) => caches.delete(k)));
  } finally {
    location.reload();
  }
}

export async function checkForUpdate(): Promise<void> {
  if (import.meta.env.DEV) return;
  lastCheck = Date.now();
  updateStatus.value = 'checking';
  let live: string | null;
  try {
    live = await fetchLiveCommit();
  } catch {
    updateStatus.value = 'offline';
    return;
  }
  liveCommit.value = live;
  if (!live) {
    updateStatus.value = 'unknown'; // no version.json on the server
    return;
  }
  if (live === __APP_COMMIT__) {
    updateStatus.value = 'latest';
    session.set(RESET_KEY, null);
    return;
  }

  // A newer build is live. The service worker update normally reloads the page
  // itself (autoUpdate); give it a few seconds before clearing caches.
  updateStatus.value = 'updating';
  try {
    await registration?.update();
  } catch {
    /* fall through to the reset below */
  }
  setTimeout(() => {
    if (session.get(RESET_KEY) === live) return; // already tried for this build
    session.set(RESET_KEY, live);
    void forceRefresh();
  }, 6000);
}

export function initUpdates(): void {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      registration = reg;
    },
  });
  if (import.meta.env.DEV) return;
  setTimeout(() => void checkForUpdate(), 1500);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastCheck > FOREGROUND_THROTTLE_MS) void checkForUpdate();
  });
}
