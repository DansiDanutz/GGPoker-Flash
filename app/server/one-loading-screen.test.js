// Opening the app reads as one loading screen (David, 15 Nov): Android's own splash takes the
// loading screen's dark wine colour, and the page shown before the code loads is the exact first
// frame of the animated loading screen, so nothing jumps or blinks between them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const LS_BG = 'radial-gradient(120% 80% at 50% 42%,#3a1420 0%,#1a0b12 42%,#070507 78%,#040304 100%)';
const squash = (s) => s.replace(/\s+/g, '').replace(/,\s*/g, ',');

test("Android's splash uses the loading screen's colour, not a green-black", () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.background_color, '#070507');
  assert.equal(manifest.theme_color, '#070507');
  assert.match(read('index.html'), /<meta name="theme-color" content="#070507" \/>/);
});

test('the boot page and the animated loading screen share the same background', () => {
  assert.ok(squash(read('index.html')).includes(squash(LS_BG)), 'boot page');
  assert.ok(squash(read('src/loading-screen.css')).includes(squash(LS_BG)), 'loading screen');
});

test('the boot logo sits exactly where the animated one does: a 300px stage, then the rest below', () => {
  const html = read('index.html');
  assert.match(html, /id="boot-stage" style="height:300px;/);
  assert.match(html, /id="boot-rest" style="height:197px"/);
  assert.match(html, /width:min\(72vw,320px\)/);
  assert.match(read('src/loading-screen.css'), /\.ls-stage \{[^}]*height: 300px;/);
});

test('the animated logo does not pop in again: it is already on screen from the boot page', () => {
  const logo = read('src/loading-screen.css').match(/\.ls-logo \{[^}]*\}/)[0];
  assert.doesNotMatch(logo, /ls-pop/);
});
