// Table artwork: seat status badges, the quick-control dock and the skin stylesheet.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { seatStatusArt, dockItems, ART } from '../src/game/tableArt.ts';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('a seat shows one status badge, the most important first', () => {
  assert.equal(seatStatusArt({}), null);
  assert.equal(seatStatusArt({ sittingOut: true }), ART.badge.sitout);
  assert.equal(seatStatusArt({ sittingOut: true, disconnected: true }), ART.badge.offline, 'offline beats sitting out');
  assert.equal(seatStatusArt({ allIn: true, inHand: true }), ART.badge.allin);
  assert.equal(seatStatusArt({ allIn: true, inHand: true, winAmount: 50 }), ART.badge.winner, 'winning beats all-in');
  assert.equal(seatStatusArt({ allIn: true, inHand: true, folded: true }), null, 'a folded hand is not all-in');
});

test('the dock offers sit-out controls only to a seated cash player', () => {
  assert.deepEqual(dockItems({ seated: false, cash: true, straddleAllowed: true }), []);
  const cash = dockItems({ seated: true, cash: true, straddleAllowed: false });
  assert.deepEqual(cash.map((i) => i.key), ['sitoutHand', 'sitoutBB', 'addChips', 'history']);
  const tourney = dockItems({ seated: true, cash: false, straddleAllowed: false });
  assert.deepEqual(tourney.map((i) => i.key), ['sitoutHand', 'history']);
  const straddle = dockItems({ seated: true, cash: true, straddleAllowed: true });
  assert.equal(straddle[0].key, 'straddle');
});

test('every artwork path points at a file that exists', () => {
  const paths = [...Object.values(ART.badge), ...Object.values(ART.icon)];
  for (const p of paths) assert.ok(fs.existsSync(path.join(root, 'public', p)), p);
  const css = read('src/table-art.css');
  for (const [, url] of css.matchAll(/url\('(\/assets\/table\/ui\/[^']+)'\)/g)) {
    assert.ok(fs.existsSync(path.join(root, 'public', url)), url);
  }
});

test('the skin stylesheet loads last and the table uses the dock and badges', () => {
  const main = read('src/main.tsx');
  assert.ok(main.indexOf("./table-art.css") > main.indexOf("./table-options.css"));
  const page = read('src/pages/TablePage.tsx');
  assert.match(page, /<SeatDock/);
  assert.match(page, /seatStatusArt\(p\)/);
});
