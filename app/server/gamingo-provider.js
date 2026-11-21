// SPDX-License-Identifier: AGPL-3.0-only
// Gamingo OpenAPI 1.11.0 and /docs signing guide, checked 2026-11-20.
// Sandbox-only client. It exposes no real-money/transfer/wallet operation.
import { createHash, createHmac, randomBytes } from 'node:crypto';

const ORIGIN = 'https://rgs.gamingo.partners';
function fail(message, status = 503, code = 'gamingo_provider_unavailable') {
  throw Object.assign(new Error(message), { status, code });
}
function text(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) fail(`Invalid Gamingo ${label}.`, 400, 'gamingo_invalid');
  return value;
}
const id = value => text(value, /^[A-Za-z0-9._:@-]{1,64}$/, 'identifier');

export function gamingoSignature({ secret, method, path, timestamp, nonce, body = '' }) {
  if (typeof secret !== 'string' || !secret || secret.length > 4096 || typeof body !== 'string'
    || Buffer.byteLength(body) > 65536 || !['GET', 'POST'].includes(method)
    || typeof path !== 'string' || !/^\/b2b\/v1\/[A-Za-z0-9/?=&%_.-]+$/.test(path)
    || !/^[0-9]{1,13}$/.test(String(timestamp)) || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) {
    fail('Invalid Gamingo signing input.', 400, 'gamingo_invalid');
  }
  const digest = createHash('sha256').update(body).digest('hex');
  const key = createHash('sha256').update(secret).digest();
  return createHmac('sha256', key).update(['RGS-HMAC-SHA256', method, path, String(timestamp), nonce, digest].join('\n')).digest('hex');
}

export function createGamingoSandboxProvider({ operatorId, keyId, secret, aggregatorId,
  fetchImpl = fetch, now = Date.now, nonce = () => randomBytes(24).toString('hex') }) {
  operatorId = id(operatorId);
  keyId = text(keyId, /^(key|agk)_[a-f0-9]{16}$/, 'key ID');
  if (aggregatorId != null) aggregatorId = id(aggregatorId);
  if (keyId.startsWith('agk_') !== (aggregatorId != null)) fail('Aggregator credentials must name their aggregator.', 400, 'gamingo_invalid');
  if (typeof secret !== 'string' || !secret || secret.length > 4096) fail('Gamingo server-side secret required.', 400, 'gamingo_invalid');

  async function request(path) {
    const method = 'GET', body = '';
    const timestamp = String(Math.floor(now() / 1000)), requestNonce = nonce();
    const signature = gamingoSignature({ secret, method, path, timestamp, nonce: requestNonce, body });
    let response, data;
    try {
      response = await fetchImpl(ORIGIN + path, { method, redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { 'X-Operator-Id': operatorId, 'X-Key-Id': keyId, 'X-Timestamp': timestamp,
          'X-Nonce': requestNonce, 'X-Signature': signature,
          ...(aggregatorId == null ? {} : { 'X-Aggregator-Id': aggregatorId }),
        },
      });
      // Never include a provider response, request headers or launch token in errors.
      if (!response.ok) fail('Gamingo refused the sandbox request. Check credentials, IP permissions and scopes.');
      data = await response.json();
    } catch { fail('Gamingo sandbox request failed. No OpenPoker balance was changed.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('Invalid Gamingo sandbox response.');
    return data;
  }

  async function games(jurisdiction) {
    const filter = jurisdiction == null ? '' : '?jurisdiction=' + text(jurisdiction, /^[a-z0-9_-]{1,32}$/, 'jurisdiction');
    const result = await request('/b2b/v1/games' + filter);
    // Never launch with production keys merely because the caller requested a preview.
    if (result.sandbox !== true || result.test_operator !== true || !Array.isArray(result.games)) {
      fail('A verified Gamingo sandbox test operator is required.', 409, 'gamingo_sandbox_required');
    }
    return result;
  }

  return { games };
}
