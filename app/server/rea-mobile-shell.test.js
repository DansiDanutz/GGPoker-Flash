import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(import.meta.dirname, '..', file), 'utf8');

test('phone navigation is the five labelled destinations the owner asked for', () => {
  const source = read('src/components/MobileNav.tsx');
  const labels = [...source.matchAll(/label: '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(labels, ['Home', 'Casino', 'Tables', 'Rewards', 'My Page']);
  // Every destination renders a visible label as well as its icon.
  assert.match(source, /mobile-nav-label/);
  assert.doesNotMatch(source, /center/);
});

test('casino hub uses product art instead of emoji placeholders', () => {
  const source = read('src/pages/Casino.tsx');
  assert.doesNotMatch(source, /cc-emoji|emoji:/);
  assert.match(source, /casino-card-art/);
});
