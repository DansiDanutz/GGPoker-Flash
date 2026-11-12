import { APP_BUILD, APP_VERSION } from './version';

export type ServerVersion = { version: string; build: string; time?: string | null };

/** Reads the deployed identity; null means it could not be verified (offline). */
export async function readServerVersion(): Promise<ServerVersion | null> {
  try {
    const res = await fetch(`/api/version?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data.version !== 'string' || typeof data.build !== 'string') return null;
    return data as ServerVersion;
  } catch {
    return null;
  }
}

/** A build without dist/version.json reports `dev`; never lock local dev. */
export function isCurrentVersion(server: ServerVersion): boolean {
  if (server.build === 'dev' || server.version === 'dev') return true;
  return server.version === APP_VERSION && server.build === APP_BUILD;
}

export async function dropStaleCaches(): Promise<void> {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch { /* cache API unavailable */ }
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
  } catch { /* worker API unavailable */ }
}

/** Unique URL so a reload is never treated as the same document. */
export function reloadForBuild(server: ServerVersion): void {
  const url = new URL(window.location.href);
  url.searchParams.set('v', server.build);
  url.searchParams.set('u', String(Date.now()));
  window.location.replace(url.toString());
}

/**
 * Checks the deployed build and forces an update when this client is stale.
 * Returns false when the page is being replaced.
 */
export async function ensureCurrentVersion(): Promise<boolean> {
  const server = await readServerVersion();
  if (!server || isCurrentVersion(server)) return true;
  await dropStaleCaches();
  reloadForBuild(server);
  return false;
}
