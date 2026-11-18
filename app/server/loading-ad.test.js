// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/components/splash/LoadingScreen.tsx'), 'utf8');
const store = fs.readFileSync(path.join(root, 'src/lib/store.tsx'), 'utf8');

test('startup loading screen is one image-led DanGG advert with real indeterminate progress', () => {
  assert.ok(fs.existsSync(path.join(root, 'public/assets/brand/og-card.jpg')));
  assert.match(source, /\/assets\/brand\/og-card\.jpg/);
  assert.match(source, /Cash Table · Tournaments · Spin &amp; Go/);
  assert.match(source, /DansiDanutz/);
  assert.match(source, /<progress[^>]+aria-label="Loading DanGG"/);
  assert.doesNotMatch(source, /setInterval|setTimeout|loadingStep|startSparks/);
});

test('startup advert follows real auth readiness without a minimum display timer', () => {
  assert.match(store, /const splashDone = !loading/);
  assert.doesNotMatch(store, /setSplashDone|2100/);
  assert.match(store, /await refreshUser\(3\);\s*setLoading\(false\)/);
});
