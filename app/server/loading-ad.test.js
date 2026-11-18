// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/components/splash/LoadingScreen.tsx'), 'utf8');
const store = fs.readFileSync(path.join(root, 'src/lib/store.tsx'), 'utf8');

test('startup shows the supplied OpenPoker poster and real connection progress', () => {
  assert.ok(fs.existsSync(path.join(root, 'public/assets/brand/openpoker-intro.png')));
  assert.match(source, /\/assets\/brand\/openpoker-intro\.png/);
  assert.match(source, /DansiDanutz/);
  assert.match(source, /<progress[^>]+aria-label="Connecting to DanGG"/);
  assert.match(source, /INTRO_READ_MS = 3500/);
  assert.match(source, /cancelAnimationFrame/);
});

test('authentication stays independent of the visual introduction timer', () => {
  assert.match(store, /const splashDone = !loading/);
  assert.doesNotMatch(store, /setSplashDone|2100/);
  assert.match(store, /await refreshUser\(3\);\s*setLoading\(false\)/);
});
