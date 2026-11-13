import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { homeShowsTables } from '../src/lib/homeContent.ts';

test('mobile navigation keeps five top-level destinations', () => {
  const source = fs.readFileSync(path.resolve(import.meta.dirname, '../src/components/MobileNav.tsx'), 'utf8');
  const labels = [...source.matchAll(/label: '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(labels, ['Lobby', 'Events', 'Cashier', 'Rewards', 'My Page']);
});

test('Home stays a discovery surface; game tabs own the table list', () => {
  assert.equal(homeShowsTables('home'), false);
  assert.equal(homeShowsTables('holdem'), true);
  assert.equal(homeShowsTables('rush'), true);
});
