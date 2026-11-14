// Art 7a–7g: the last Home cards are wordless, so each draws its name as live text.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const FORYOU = ['foryou-freebie', 'foryou-ocean', 'foryou-live-series'];
const CASINO = ['casino-olympus-gold', 'casino-disco-cat', 'casino-robo-rush', 'casino-clover-cash'];

test('every new card uses its webp art and the file exists', () => {
  const feed = read('src/components/home/HomeFeed.tsx');
  for (const name of [...FORYOU, ...CASINO]) {
    assert.match(feed, new RegExp(`${name}\\.webp`), name);
    assert.ok(fs.existsSync(path.join(root, `public/assets/ui/creatives/${name}.webp`)), name);
  }
  assert.doesNotMatch(feed, /(foryou|casino)-[a-z-]+\.png/);
});

test('For You and Casino cards draw their names as live text', () => {
  const feed = read('src/components/home/HomeFeed.tsx');
  for (const title of ['Daily Freebie', 'DanGG Rewards', 'Live Series', 'Olympus Gold', 'Disco Cat', 'Robo Rush', 'Clover Cash']) {
    assert.ok(feed.includes(title), title);
  }
  assert.match(feed, /hf-casino-label/);
});

test('the account hub thumbnails use the new art too', () => {
  assert.doesNotMatch(read('src/lib/accountHub.ts'), /foryou-[a-z-]+\.png/);
});
