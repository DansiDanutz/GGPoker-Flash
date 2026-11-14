// Poker Home: carousel stepping, the Jump back in table and that every art file ships.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { HERO_SLIDES, PROMO_CARDS, stepSlide, suggestedTable } from '../src/lib/homeContent.ts';

const PUBLIC = path.resolve(import.meta.dirname, '../public');

const table = (id, over = {}) => ({ id, game: 'holdem', players: 3, seats: 6, running: true, avgPot: 10, ...over });

test('stepSlide wraps both ways', () => {
  assert.equal(stepSlide(5, 1, 6), 0);
  assert.equal(stepSlide(0, -1, 6), 5);
  assert.equal(stepSlide(2, 1, 6), 3);
  assert.equal(stepSlide(0, 1, 0), 0);
});

test('suggestedTable never offers a full or private table', () => {
  assert.equal(suggestedTable([table('full', { players: 6 }), table('priv', { private: true })]), null);
  assert.equal(suggestedTable([table('a', { players: 2 }), table('b', { players: 5 })]).id, 'b');
});

test('every hero slide and promo card points at art that ships', () => {
  for (const item of [...HERO_SLIDES, ...PROMO_CARDS]) {
    assert.ok(fs.existsSync(path.join(PUBLIC, item.art)), `${item.key}: ${item.art} is missing`);
  }
  assert.ok(HERO_SLIDES.length >= 3, 'the carousel needs neighbours on both sides');
});

test('every phone hero banner ships as WebP and carries spark hues for its live layer', () => {
  for (const slide of HERO_SLIDES) {
    assert.match(slide.artPhone, /^\/assets\/hero\/[a-z]+\.webp$/, `${slide.key}: banner should be a WebP`);
    assert.ok(fs.existsSync(path.join(PUBLIC, slide.artPhone)), `${slide.key}: ${slide.artPhone} is missing`);
    assert.ok(slide.sparkHues.length > 0, `${slide.key}: needs at least one spark hue`);
    assert.ok(slide.sparkHues.every((h) => h >= 0 && h < 360), `${slide.key}: hues are degrees 0-359`);
  }
});
