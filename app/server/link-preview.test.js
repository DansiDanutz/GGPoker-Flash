// A shared dangg.live link shows a large branded card (WhatsApp, Telegram, Facebook, X).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const meta = (attr, key) => html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]+)"`))?.[1];
const IMAGE = 'https://dangg.live/assets/brand/og-card.jpg';

test('Open Graph tags describe the site with an absolute 1200x630 image', () => {
  assert.equal(meta('property', 'og:type'), 'website');
  assert.equal(meta('property', 'og:url'), 'https://dangg.live/');
  assert.equal(meta('property', 'og:site_name'), 'DanGG');
  assert.ok(meta('property', 'og:title'));
  assert.ok(meta('property', 'og:description'));
  assert.equal(meta('property', 'og:image'), IMAGE);
  assert.equal(meta('property', 'og:image:width'), '1200');
  assert.equal(meta('property', 'og:image:height'), '630');
  assert.equal(meta('property', 'og:image:type'), 'image/jpeg');
  assert.ok(meta('property', 'og:image:alt'));
});

test('X/Twitter gets the large-image card', () => {
  assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
  assert.equal(meta('name', 'twitter:image'), IMAGE);
});

test('the card image ships and stays under the 300 KB WhatsApp large-preview limit', () => {
  const file = path.join(root, 'public/assets/brand/og-card.jpg');
  const { size } = fs.statSync(file);
  assert.ok(size > 0 && size < 300 * 1024, `og-card.jpg is ${size} bytes`);
});
