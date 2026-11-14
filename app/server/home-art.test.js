// Home 4b–4i: wordless art, so every card draws its words live and every art file exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const feed = fs.readFileSync(path.join(root, 'src/components/home/HomeFeed.tsx'), 'utf8');
const ART = ['foryou-recent', 'tourn-masters', 'tourn-weekender', 'tourn-daily',
  'feature-time-bank', 'feature-run-it-twice', 'feature-social', 'feature-hand-history'];

test('every new Home card uses its webp art', () => {
  for (const name of ART) {
    assert.match(feed, new RegExp(`${name}\\.webp`), name);
    assert.ok(fs.existsSync(path.join(root, `public/assets/ui/creatives/${name}.webp`)), name);
  }
});

test('the wordless cards draw their titles as live text', () => {
  for (const title of ['Recent game', 'Masters', 'Weekender', 'Daily Guarantees']) assert.ok(feed.includes(title), title);
  assert.match(feed, /hf-tourn-label/);
  assert.match(feed, /hf-feature-label/);
  assert.match(feed, /hf-foryou-label/);
});
