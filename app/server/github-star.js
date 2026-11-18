// SPDX-License-Identifier: AGPL-3.0-only
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { createRateLimiter, SECURITY_HEADERS } from './security.js';

const ROOT = '/api/github-star';
const REPOSITORY = 'OpenPoker4all/OpenPoker';
const TTL = 10 * 60_000;
const COOKIE = 'dangg_github_star';

export function createGitHubStarRoutes({ json, readBody, clientKey, env = process.env, fetchImpl = fetch, now = Date.now }) {
  const clientId = env.GITHUB_STAR_CLIENT_ID || '';
  const clientSecret = env.GITHUB_STAR_CLIENT_SECRET || '';
  let origin = '';
  try {
    const url = new URL(env.GITHUB_STAR_ORIGIN);
    if (url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) origin = url.origin;
  } catch { /* Unconfigured integrations stay unavailable. */ }
  const configured = Boolean(clientId && clientSecret && origin);
  const pending = new Map();
  const limiter = createRateLimiter({ limit: 5, windowMs: TTL, maxKeys: 1000 });
  const cookie = (value, age) => `${COOKIE}=${value}; Path=${ROOT}; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
  const callback = `${origin}${ROOT}/callback`;
  const request = (url, options) => fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10_000) });

  function result(res, status, heading, message) {
    res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" });
    // Only fixed application strings are rendered; OAuth response text is never reflected.
    res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${heading} · DanGG</title><style>body{margin:0;background:#100b12;color:#fff;font:18px system-ui;min-height:100dvh;display:grid;place-items:center}main{max-width:420px;padding:28px;text-align:center}.star{color:#ffd54a;font-size:72px}a{display:inline-block;background:#ffd54a;color:#201500;padding:14px 24px;border-radius:12px;text-decoration:none;font-weight:700}p{line-height:1.5}</style><main><div class="star" aria-hidden="true">★</div><h1>${heading}</h1><p>${message}</p><a href="/">Back to DanGG</a></main></html>`);
  }

  return async function handleGitHubStar(req, res, url) {
    // Keep the consent cookie and callback on one host before the app is opened.
    if (configured && ['GET', 'HEAD'].includes(req.method) && String(req.headers.accept || '').includes('text/html') && req.headers.host === `www.${new URL(origin).host}`) {
      res.writeHead(308, { ...SECURITY_HEADERS, location: `${origin}${url.pathname}${url.search}`, 'cache-control': 'no-store' });
      res.end(); return true;
    }
    if (!url.pathname.startsWith(`${ROOT}/`)) return false;
    if (url.pathname === `${ROOT}/start`) {
      if (req.method !== 'POST') { json(res, 405, { error: 'Use POST to authorize a star.' }); return true; }
      if (!configured) { json(res, 503, { error: 'GitHub authorization is not available yet. You can still star OpenPoker directly on GitHub.' }); return true; }
      if (req.headers.origin !== origin || !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
        json(res, 403, { error: 'Open this request from DanGG.' }); return true;
      }
      const key = clientKey(req) || req.socket?.remoteAddress || 'unknown';
      if (limiter.isBlocked(key, now())) { json(res, 429, { error: 'Please wait before trying GitHub authorization again.' }); return true; }
      limiter.record(key, now());
      const body = await readBody(req);
      if (body.consent !== true) { json(res, 400, { error: 'Choose Yes before authorizing a star.' }); return true; }
      for (const [state, entry] of pending) if (entry.expires <= now()) pending.delete(state);
      if (pending.size >= 1000) { json(res, 503, { error: 'GitHub authorization is busy. Please try again shortly.' }); return true; }
      const state = randomBytes(32).toString('hex');
      const binding = randomBytes(32).toString('hex');
      const verifier = randomBytes(32).toString('base64url');
      pending.set(state, { binding, verifier, expires: now() + TTL });
      const authorization = new URL('https://github.com/login/oauth/authorize');
      authorization.search = new URLSearchParams({ client_id: clientId, redirect_uri: callback, state,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' }).toString();
      res.setHeader('set-cookie', cookie(binding, TTL / 1000));
      json(res, 200, { url: authorization.href });
      return true;
    }
    if (url.pathname !== `${ROOT}/callback`) { json(res, 404, { error: 'Not found' }); return true; }
    if (req.method !== 'GET') { json(res, 405, { error: 'Use GET for the GitHub callback.' }); return true; }
    const state = url.searchParams.get('state');
    const entry = pending.get(state);
    const binding = String(req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
    if (!configured || !entry || entry.expires <= now() || !/^[a-f0-9]{64}$/.test(binding) || !timingSafeEqual(Buffer.from(binding), Buffer.from(entry.binding))) {
      result(res, 400, 'Authorization expired', 'No star was added by this request. Return to DanGG and try again.'); return true;
    }
    pending.delete(state); // Consume before network calls so the callback cannot be replayed.
    res.setHeader('set-cookie', cookie('', 0));
    if (url.searchParams.has('error')) { result(res, 200, 'No star added', 'You declined GitHub authorization. You can continue using DanGG.'); return true; }
    const code = url.searchParams.get('code');
    if (!code || code.length > 1024) { result(res, 400, 'Authorization failed', 'No star was added. Please try again from DanGG.'); return true; }
    try {
      const exchange = await request('https://github.com/login/oauth/access_token', { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: callback, code_verifier: entry.verifier }) });
      if (!exchange.ok) throw new Error('exchange failed');
      const token = await exchange.json();
      if (typeof token.access_token !== 'string' || !token.access_token.startsWith('ghu_') || token.token_type?.toLowerCase() !== 'bearer') throw new Error('invalid GitHub App token');
      const starred = await request(`https://api.github.com/user/starred/${REPOSITORY}`, { method: 'PUT', headers: {
        accept: 'application/vnd.github+json', authorization: `Bearer ${token.access_token}`, 'X-GitHub-Api-Version': '2026-03-10', 'user-agent': 'DanGG-Star', 'content-length': '0' } });
      if (starred.status !== 204) throw new Error('star not confirmed');
      result(res, 200, 'Thank you for your star!', 'GitHub confirmed that OpenPoker is starred by the account you authorized. An existing star is kept; it is never counted twice.');
    } catch {
      result(res, 502, 'Star not confirmed', 'We could not confirm your star with GitHub. Please check the repository on GitHub or try again from DanGG.');
    }
    // Visitor access/refresh tokens are never logged, sent to the browser or persisted.
    return true;
  };
}
