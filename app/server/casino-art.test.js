// Art 9a–9g: the Casino table-game tiles show the new wordless art.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CASINO_ART } from '../src/lib/promoArt.ts';

const root = path.resolve(import.meta.dirname, '..');
const GAMES = ['roulette', 'blackjack', 'crash', 'baccarat', 'dragontiger', 'sicbo', 'holdem'];

test('every casino tile art path points at a file that exists', () => {
  assert.ok(Object.isFrozen(CASINO_ART));
  assert.deepEqual(Object.keys(CASINO_ART).sort(), [...GAMES].sort());
  for (const [key, url] of Object.entries(CASINO_ART)) {
    assert.ok(fs.existsSync(path.join(root, 'public', url)), key);
  }
});

test('Casino tiles no longer use the old discover art', () => {
  const src = fs.readFileSync(path.join(root, 'src/pages/Casino.tsx'), 'utf8');
  assert.doesNotMatch(src, /assets\/ui\/discover\//);
  for (const g of GAMES) assert.match(src, new RegExp(`CASINO_ART\\.${g}\\b`), g);
});

test('narrow Casino tiles keep the right-side art subject in view', () => {
  const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
  assert.match(css, /\.casino-card-art \{[^}]*object-position: 85% center/);
});
