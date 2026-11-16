// Art 5 and 6a–6c: wordless emblems and cash banners, so the words are live text and every file exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, 'public', f));

const EMBLEMS = ['trophy', 'crown-coin', 'cards', 'crown', 'target', 'wheel', 'mystery', 'bolt'];

test('all eight emblems exist', () => {
  for (const name of EMBLEMS) assert.ok(exists(`assets/ui/emblems/emblem-${name}.webp`), name);
});

test('the cash carousel shows the three new banners with live titles', () => {
  const hero = read('src/components/CashHero.tsx');
  for (const art of ['cash-holdem', 'cash-plo', 'cash-badbeat']) {
    assert.match(hero, new RegExp(`${art}\\.webp`), art);
    assert.ok(exists(`assets/ui/creatives/${art}.webp`), art);
  }
  for (const words of ["No-Limit Hold'em", 'Pot-Limit Omaha', 'Bad Beat Jackpot']) assert.ok(hero.includes(words), words);
  assert.match(hero, /cash-slide-copy/);
});

test('the cash carousel switches game tabs and shows the live jackpot', () => {
  assert.match(read('src/pages/Lobby.tsx'), /<CashHero[^>]*jackpot=[^>]*onGame=/);
});

test('series tabs use emblems with live labels instead of baked-text images', () => {
  const list = read('src/components/tournaments/TournamentReferenceList.tsx');
  assert.doesNotMatch(list, /series-[a-z]+\.png/);
  assert.match(list, /tref-series-label/);
  for (const name of EMBLEMS) assert.match(list, new RegExp(`'${name}'`), name);
});

test('the phone Events format tiles use emblems, not flat badges', () => {
  const events = read('src/components/mobile/MobileEvents.tsx');
  assert.doesNotMatch(events, /<GameBadge/);
  assert.match(events, /me-tile-emblem/);
});
