// Home hero 4a: wordless art, so the headline must be live text and the art must exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

test('home hero uses the wordless webp art with a live headline', () => {
  const feed = fs.readFileSync(path.join(root, 'src/components/home/HomeFeed.tsx'), 'utf8');
  assert.match(feed, /hero-november\.webp/);
  assert.match(feed, /className="hf-hero-copy"/);
  assert.match(feed, /Chip Rush/);
  assert.ok(fs.existsSync(path.join(root, 'public/assets/ui/creatives/hero-november.webp')));
});
