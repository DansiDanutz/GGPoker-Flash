// Phone Poker and Casino menus: every row draws a 3D icon that ships as a WebP.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { menuIconSrc } from '../src/lib/menuIcons.ts';
import { MOBILE_GAMES } from '../src/lib/mobileLobby.ts';
import { CASINO_GAMES } from '../src/components/mobile/casinoGames.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../public');

test('menuIconSrc points at the menu WebP for a badge name', () => {
  assert.equal(menuIconSrc('holdem'), '/assets/menu/holdem.webp');
});

test('every Poker and Casino menu row has its 3D icon on disk', () => {
  const names = [...MOBILE_GAMES.map((g) => g.icon), ...CASINO_GAMES.map((g) => g.badge)];
  for (const name of names) {
    assert.ok(fs.existsSync(path.join(PUBLIC, menuIconSrc(name))), `${name}: ${menuIconSrc(name)} is missing`);
  }
});
