// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createGitHubStarRoutes } from './github-star.js';
import { startServer } from './test-helpers.js';

function fixture({ configured = true, starStatus = 204, exchangeStatus = 200 } = {}) {
  let time = 1_000;
  const calls = [];
  const route = createGitHubStarRoutes({
    env: configured ? { GITHUB_STAR_CLIENT_ID: 'test-client', GITHUB_STAR_CLIENT_SECRET: 'server-secret', GITHUB_STAR_ORIGIN: 'https://dangg.test' } : {},
    now: () => time, clientKey: () => 'test-network', readBody: async req => req.body,
    json: (res, status, data) => { res.status = status; res.body = JSON.stringify(data); },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return url.includes('access_token') ? new Response(JSON.stringify({ access_token: 'ghu_visitor-secret', token_type: 'bearer' }), { status: exchangeStatus }) : new Response(null, { status: starStatus });
    },
  });
  async function call(path, { method = 'GET', body, headers = {} } = {}) {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); }, end(body) { this.body = body; } };
    await route({ method, body, headers }, res, new URL(path, 'https://dangg.test'));
    return res;
  }
  const start = (body = { consent: true }) => call('/api/github-star/start', { method: 'POST', body, headers: { origin: 'https://dangg.test', 'content-type': 'application/json' } });
  return { call, start, calls, advance: ms => { time += ms; } };
}

test('star requires configuration, explicit consent, same origin and POST', async () => {
  assert.equal((await fixture({ configured: false }).start()).status, 503);
  const f = fixture();
  assert.equal((await f.call('/api/github-star/start')).status, 405);
  assert.equal((await f.call('/api/github-star/start', { method: 'POST', body: { consent: true }, headers: { origin: 'https://evil.test', 'content-type': 'application/json' } })).status, 403);
  assert.equal((await f.start({ consent: false })).status, 400);
  assert.deepEqual(f.calls, []);
});

test('GitHub App consent uses PKCE, a browser cookie and a one-use state; only the fixed repository is starred', async () => {
  const f = fixture();
  const started = await f.start({ consent: true, repository: 'attacker/other' });
  const authorization = new URL(JSON.parse(started.body).url);
  assert.equal(authorization.origin, 'https://github.com');
  assert.equal(authorization.searchParams.get('scope'), null, 'GitHub App permissions do not request broad OAuth repo scopes');
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.match(started.headers['set-cookie'], /HttpOnly; Secure; SameSite=Lax; Max-Age=600/);
  const path = `/api/github-star/callback?state=${authorization.searchParams.get('state')}&code=valid-code`;
  assert.equal((await f.call(path)).status, 400, 'another browser cannot use the callback');
  assert.equal(f.calls.length, 0);
  const cookie = started.headers['set-cookie'].split(';')[0];
  const result = await f.call(path, { headers: { cookie } });
  assert.equal(result.status, 200);
  assert.match(result.body, /GitHub confirmed/);
  assert.doesNotMatch(result.body, /visitor-secret|server-secret|valid-code/);
  const exchange = JSON.parse(f.calls[0].options.body);
  assert.equal(createHash('sha256').update(exchange.code_verifier).digest('base64url'), authorization.searchParams.get('code_challenge'));
  assert.equal(exchange.redirect_uri, 'https://dangg.test/api/github-star/callback');
  assert.equal(f.calls[1].url, 'https://api.github.com/user/starred/OpenPoker4all/OpenPoker');
  assert.equal(f.calls[1].options.method, 'PUT');
  assert.equal(f.calls[1].options.headers.authorization, 'Bearer ghu_visitor-secret');
  assert.match(result.headers['set-cookie'], /Max-Age=0/);
  assert.equal((await f.call(path, { headers: { cookie } })).status, 400);
  assert.equal(f.calls.length, 2, 'replay makes no GitHub call');
});

test('declining GitHub consent never adds a star or reflects provider error text', async () => {
  const f = fixture(); const started = await f.start();
  const state = new URL(JSON.parse(started.body).url).searchParams.get('state');
  const result = await f.call(`/api/github-star/callback?state=${state}&error=%3Cscript%3E`, { headers: { cookie: started.headers['set-cookie'] } });
  assert.equal(result.status, 200);
  assert.match(result.body, /No star added/);
  assert.doesNotMatch(result.body, /<script>/);
  assert.equal(f.calls.length, 0);
});

test('expired consent is rejected without contacting GitHub', async () => {
  const f = fixture(); const started = await f.start();
  const state = new URL(JSON.parse(started.body).url).searchParams.get('state');
  f.advance(600_001);
  assert.equal((await f.call(`/api/github-star/callback?state=${state}&code=code`, { headers: { cookie: started.headers['set-cookie'] } })).status, 400);
  assert.equal(f.calls.length, 0);
});

test('failed exchange or star never claims success', async () => {
  for (const options of [{ exchangeStatus: 401 }, { starStatus: 403 }, { starStatus: 500 }]) {
    const f = fixture(options); const started = await f.start();
    const state = new URL(JSON.parse(started.body).url).searchParams.get('state');
    const result = await f.call(`/api/github-star/callback?state=${state}&code=code`, { headers: { cookie: started.headers['set-cookie'] } });
    assert.equal(result.status, 502);
    assert.match(result.body, /Star not confirmed/);
    assert.doesNotMatch(result.body, /GitHub confirmed|visitor-secret|server-secret/);
  }
});

test('consent attempts are rate limited', async () => {
  const f = fixture();
  for (let i = 0; i < 5; i++) assert.equal((await f.start()).status, 200);
  assert.equal((await f.start()).status, 429);
});

test('the real server exposes the unconfigured flow without granting a star', async t => {
  const server = await startServer({ env: { GITHUB_STAR_CLIENT_ID: '', GITHUB_STAR_CLIENT_SECRET: '' } });
  t.after(() => server.stop());
  const response = await server.post('/api/github-star/start', { body: { consent: true } });
  assert.equal(response.status, 503);
  assert.match(response.data.error, /not available yet/);
});


test('www document entry points canonicalize before browser-bound consent', async () => {
  const f = fixture();
  const result = await f.call('/marketplace?from=star', { headers: { host: 'www.dangg.test', accept: 'text/html' } });
  assert.equal(result.status, 308);
  assert.equal(result.headers.location, 'https://dangg.test/marketplace?from=star');
  assert.equal(f.calls.length, 0);
  assert.equal((await f.call('/marketplace', { headers: { host: 'unrelated.test', accept: 'text/html' } })).status, undefined);
  assert.equal((await f.call('/api/tables', { headers: { host: 'www.dangg.test', accept: 'application/json' } })).status, undefined);
});
