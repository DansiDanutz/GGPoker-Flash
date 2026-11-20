import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('every app startup clears the legacy password, and login cannot read or replace it', () => {
  const entry = source('../src/main.tsx').split('createRoot(document')[0];
  const retained = new Map([['ggpoker.rememberPassword', 'fixture'], ['ggpoker.rememberLogin', 'player']]);
  const session = new Map([['ggpoker.pendingLogin', '1']]);
  runInNewContext(entry.replace(/^import .*;$/gm, ''), {
    localStorage: { removeItem: key => retained.delete(key) },
    sessionStorage: { removeItem: key => session.delete(key) },
  });
  assert.deepEqual([...retained], [['ggpoker.rememberLogin', 'player']]);
  assert.equal(session.size, 0);
  assert.doesNotMatch(source('../src/pages/Login.tsx'), /rememberPassword|pendingLogin/);
});

test('review renders an image without creating an HTML document', () => {
  const admin = source('../src/pages/Admin.tsx');
  assert.doesNotMatch(admin, /document\.write/);
  assert.match(admin, /<img[^>]+src=\{verificationImage\.url\}/);
});

test('document validation accepts raster data and rejects unsupported or malformed input', async () => {
  const { validVerificationImage } = await import('./verification-image.js');
  for (const type of ['png', 'jpeg', 'webp']) assert.ok(validVerificationImage('data:image/' + type + ';base64,YQ=='));
  for (const url of [null, '', 'https://example.org/id.png', 'data:image/svg+xml;base64,YQ==', 'data:image/png;base64,', 'data:image/png;base64,YQ== extra', 'data:image/png;base64,' + 'A'.repeat(7 * 1024 * 1024)]) assert.equal(validVerificationImage(url), false);
});
