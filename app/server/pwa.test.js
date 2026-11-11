import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the installable app shell is wired up for phones', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/#/');
  assert.equal(manifest.theme_color, '#0a0f0c');
  assert.ok(manifest.name && manifest.short_name);

  const sizes = manifest.icons.map((icon) => icon.sizes);
  assert.ok(sizes.includes('192x192'), 'Android needs a 192px icon');
  assert.ok(sizes.includes('512x512'), 'the install prompt needs a 512px icon');
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    const file = path.join(root, 'public', icon.src.replace(/^\//, ''));
    assert.ok(fs.existsSync(file), `${icon.src} exists`);
    assert.ok(fs.statSync(file).size > 1000, `${icon.src} is a real image`);
  }

  // A fetch handler is required for the manifest to become installable.
  const sw = read('public/sw.js');
  assert.match(sw, /addEventListener\('fetch'/);
  assert.match(sw, /addEventListener\('install'/);
  assert.ok(sw.includes("url.pathname.startsWith('/api/')"), 'API requests bypass the cache');

  const html = read('index.html');
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" href="\/pwa\/apple-touch-icon\.png"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="theme-color"/);
});
