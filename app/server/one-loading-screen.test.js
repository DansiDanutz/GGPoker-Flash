// Boot, version checks and the reading period share the supplied poster.
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

test('the boot page, version check and React loader share the supplied poster', () => {
  for (const file of ['index.html', 'src/components/VersionGate.tsx', 'src/components/splash/LoadingScreen.tsx']) {
    assert.match(read(file), /\/assets\/brand\/openpoker-intro\.png/);
  }
});

test('the boot advert has the same accessible campaign and loading content', () => {
  const html = read('index.html');
  assert.match(html, /Introducing OpenPoker, the project behind DanGG/);
  assert.match(html, /Built by DansiDanutz/);
  assert.match(html, /object-fit:contain/);
});

test('the boot placeholder is static and does not hold startup on a timer', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /setTimeout|setInterval|animation:/);
});
