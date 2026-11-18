// Art 10: the game-mode row and the phone menus show 3D emblems beside live text labels.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GAME_TAB_EMBLEM, PHONE_MENU_EMBLEM } from '../src/lib/menuArt.ts';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('every menu emblem points at a file that exists', () => {
  for (const map of [GAME_TAB_EMBLEM, PHONE_MENU_EMBLEM]) {
    assert.ok(Object.isFrozen(map));
    for (const [key, url] of Object.entries(map)) assert.ok(fs.existsSync(path.join(root, 'public', url)), key);
  }
  assert.deepEqual(Object.keys(GAME_TAB_EMBLEM), ['home', 'aof', 'rush', 'holdem', 'plo', 'short', 'spin', 'battle']);
  assert.deepEqual(Object.keys(PHONE_MENU_EMBLEM), ['poker', 'events', 'casino', 'organizers', 'rewards']);
});

test('the desktop game-mode row draws its labels as text, not baked plates', () => {
  const src = read('src/components/AppHeader.tsx');
  assert.doesNotMatch(src, /assets\/chrome\/\$\{t\.img\}|plate-on/);
  assert.match(src, /GAME_TAB_EMBLEM\[t\.key\]/);
  assert.match(src, /className="mode-tab-label">\{t\.label\}/);
  assert.match(read('src/game-tabs.css'), /\.mode-tab\.active/);
});

test('the phone shortcut tiles and tab bar use the emblems with visible labels', () => {
  const home = read('src/components/mobile/MobileHome.tsx');
  assert.doesNotMatch(home, /NavGlyph name="(tables|events|casino|rewards)"/);
  for (const k of ['poker', 'events', 'casino', 'organizers', 'rewards']) assert.match(home, new RegExp(`PHONE_MENU_EMBLEM\\.${k}\\b`), k);
  const nav = read('src/components/MobileNav.tsx');
  assert.doesNotMatch(nav, /<NavGlyph/);
  assert.match(nav, /PHONE_MENU_EMBLEM/);
  assert.doesNotMatch(read('src/phone-shell.css'), /^\s*\.mobile-nav-label \{ position: absolute; width: 1px/m);
});
