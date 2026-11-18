import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.resolve(import.meta.dirname, '..', file), 'utf8');

test('phone navigation includes the organizer directory and keeps the DanGG Home control', () => {
  const nav = read('src/lib/phoneNav.ts');
  const labels = [...nav.matchAll(/label: '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(labels, ['Poker', 'Tournaments', 'Home', 'Casino', 'Organizers', 'My Page']);
  const source = read('src/components/MobileNav.tsx');
  // Home is the raised round brand button; every item keeps an accessible label.
  assert.match(source, /center/);
  assert.match(source, /aria-label=\{item\.label\}/);
  assert.match(source, /mobile-nav-label/);
});

test('casino hub uses product art instead of emoji placeholders', () => {
  const source = read('src/pages/Casino.tsx');
  assert.doesNotMatch(source, /cc-emoji|emoji:/);
  assert.match(source, /casino-card-art/);
});
