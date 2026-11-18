// The boot placeholder and React loader show the same static advert without a manufactured delay.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test("Android's splash uses the loading screen's colour, not a green-black", () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.background_color, '#070507');
  assert.equal(manifest.theme_color, '#070507');
  assert.match(read('index.html'), /<meta name="theme-color" content="#070507" \/>/);
});

test('the boot page and React loader share the same DanGG advert', () => {
  assert.match(read('index.html'), /\/assets\/brand\/og-card\.jpg/);
  assert.match(read('src/components/splash/LoadingScreen.tsx'), /\/assets\/brand\/og-card\.jpg/);
});

test('the boot advert has the same accessible campaign and loading content', () => {
  const html = read('index.html');
  assert.match(html, /Cash Table · Tournaments · Spin &amp; Go/);
  assert.match(html, /Created by DansiDanutz · Powered by OpenPoker/);
  assert.match(html, /<progress class="boot-progress" aria-label="Loading DanGG"><\/progress>/);
});

test('the boot placeholder is static and does not hold startup on a timer', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /setTimeout|setInterval|animation:/);
});
