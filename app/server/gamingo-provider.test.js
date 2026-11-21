// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { gamingoSignature, createGamingoSandboxProvider } from './gamingo-provider.js';

const credentials = { operatorId: 'test-operator', keyId: 'key_1234567890abcdef', secret: 'test-secret-not-a-credential' };
const catalog = { sandbox: true, test_operator: true, games: [{ game_id: 'exit-wins', enabled: true, maintenance: false }] };
const reply = data => ({ ok: true, json: async () => data });

test('signing matches Gamingo’s published worked example exactly', () => {
  assert.equal(gamingoSignature({ secret: 'rgs_sk_example-secret-do-not-use', method: 'POST', path: '/b2b/v1/sessions',
    timestamp: '1763128800', nonce: 'n-7f3a9c2e5b14d0a1',
    body: '{"player_id":"p-1001","currency":"EUR","jurisdiction":"intl","game_id":"exit-wins"}' }),
  'e9e222b626c859d20ebfd341d58d31f84c7d2cad814ac1fa549668b77b880fd8');
});

test('the connector exposes only a signed catalog GET, even for an enabled game', async () => {
  const calls = [];
  const provider = createGamingoSandboxProvider({ ...credentials, fetchImpl: async (url, options) => {
    calls.push([url, options]); return reply(catalog);
  } });
  assert.deepEqual(Object.keys(provider), ['games']);
  await assert.rejects(provider.games('intl&other=bad'), { status: 400 });
  assert.deepEqual(await provider.games('intl'), catalog);
  assert.equal(calls.length, 1);
  const [[url, options]] = calls;
  assert.equal(url, 'https://rgs.gamingo.partners/b2b/v1/games?jurisdiction=intl');
  assert.equal(options.method, 'GET');
  assert.equal(options.redirect, 'error');
  assert.equal(options.body, undefined);
});

test('production or ambiguous operator responses cannot start a preview', async () => {
  for (const flags of [{ sandbox: false, test_operator: true }, { sandbox: true, test_operator: false }, {}]) {
    let calls = 0;
    const provider = createGamingoSandboxProvider({ ...credentials, fetchImpl: async () => { calls++; return reply({ ...catalog, sandbox: undefined, test_operator: undefined, ...flags }); } });
    await assert.rejects(provider.games('intl'), { code: 'gamingo_sandbox_required' });
    assert.equal(calls, 1, 'only the read-only catalogue request is sent');
  }
});

test('aggregator keys bind aggregator and target operator without sharing their secret', async () => {
  let headers;
  const provider = createGamingoSandboxProvider({ ...credentials, keyId: 'agk_1234567890abcdef', aggregatorId: 'openpoker-test',
    fetchImpl: async (_url, options) => { headers = options.headers; return reply(catalog); } });
  await provider.games('intl');
  assert.equal(headers['X-Aggregator-Id'], 'openpoker-test');
  assert.equal(headers['X-Operator-Id'], 'test-operator');
  assert.ok(!JSON.stringify(headers).includes(credentials.secret));
  assert.throws(() => createGamingoSandboxProvider({ ...credentials, keyId: 'agk_1234567890abcdef' }), { status: 400 });
  assert.throws(() => createGamingoSandboxProvider({ ...credentials, aggregatorId: 'unexpected' }), { status: 400 });
});

test('provider errors are sanitized and requests are never automatically retried', async () => {
  let calls = 0;
  const provider = createGamingoSandboxProvider({ ...credentials, fetchImpl: async () => { calls++; throw new Error(credentials.secret); } });
  await assert.rejects(provider.games('intl'), error => error.status === 503 && !error.message.includes(credentials.secret));
  assert.equal(calls, 1);
});
