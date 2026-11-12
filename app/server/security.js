// Request-level protections for the local HTTP/WebSocket server.
import path from 'node:path';

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

function hostnameOf(hostHeader) {
  const host = String(hostHeader || '').trim().toLowerCase();
  if (!host) return '';
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1);
  return host.split(':')[0];
}

/**
 * The server only listens on loopback, but a malicious web page can still reach it through
 * DNS rebinding. Rejecting foreign Host headers closes that door.
 * @param {string | undefined} hostHeader
 * @returns {boolean}
 */
export function isLocalHost(hostHeader) {
  return LOCAL_HOSTNAMES.has(hostnameOf(hostHeader));
}

/**
 * Browsers always send Origin on WebSocket upgrades; native clients send none.
 * @param {string | undefined} origin
 * @returns {boolean}
 */
export function isLocalOrigin(origin) {
  if (!origin) return true;
  try {
    return LOCAL_HOSTNAMES.has(new URL(origin).hostname.toLowerCase()) || new URL(origin).hostname === '::1';
  } catch {
    return false;
  }
}

/**
 * Resolve a URL path inside `base`, or return null when it escapes (including `base-sibling` prefixes).
 * @param {string} base
 * @param {string} rawRelative still percent-encoded
 * @returns {string | null}
 */
export function resolveInside(base, rawRelative) {
  let relative;
  try { relative = decodeURIComponent(rawRelative); } catch { return null; }
  if (relative.includes('\0')) return null;
  const candidate = path.resolve(base, '.' + path.sep + relative);
  if (candidate !== base && !candidate.startsWith(base + path.sep)) return null;
  return candidate;
}

export const SECURITY_HEADERS = Object.freeze({
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
});

export const HTML_CSP = [
  "default-src 'self'",
  // Ruffle compiles its self-hosted WebAssembly; no eval or remote script is allowed.
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws://127.0.0.1:* ws://localhost:*",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Sliding-window attempt limiter keyed by an arbitrary string (login name, socket id…).
 * @param {{ limit: number, windowMs: number }} options
 */
export function createRateLimiter({ limit, windowMs }) {
  const attempts = new Map();
  const recent = (key, now) => (attempts.get(key) || []).filter((t) => now - t < windowMs);
  return {
    isBlocked(key, now = Date.now()) {
      return recent(key, now).length >= limit;
    },
    record(key, now = Date.now()) {
      attempts.set(key, [...recent(key, now), now]);
    },
    reset(key) {
      attempts.delete(key);
    },
  };
}
