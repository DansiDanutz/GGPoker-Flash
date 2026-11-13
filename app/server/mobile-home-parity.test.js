import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('mobile navigation keeps five top-level destinations', () => {
  const source = fs.readFileSync(path.resolve(import.meta.dirname, '../src/components/MobileNav.tsx'), 'utf8');
  const labels = [...source.matchAll(/label: '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(labels, ['Poker', 'Events', 'Home', 'Casino', 'My Page']);
});
