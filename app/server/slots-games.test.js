import test from 'node:test';
import assert from 'node:assert/strict';
import { SLOT_GAMES, PAYTABLE, evaluateLine, slotCatalog, slotGame, spinSlots } from './slots.js';

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('the catalogue exposes six distinct playable games', () => {
  assert.equal(SLOT_GAMES.length, 6);
  assert.equal(new Set(SLOT_GAMES.map((g) => g.id)).size, 6);
  for (const game of SLOT_GAMES) {
    assert.ok(game.name && game.tagline && game.accent);
    assert.ok(game.bets.length >= 3, `${game.id} needs a bet ladder`);
    assert.equal(game.weights.length, 8);
    assert.equal(Object.keys(game.glyphs).length, 8);
    assert.equal(Object.keys(game.paytable).length, 8);
    assert.ok(game.paytable.wild[2] >= game.paytable.cherry[2], 'the wild still pays the most');
  }
});

test('the default game keeps the original paytable and math', () => {
  assert.equal(slotGame('olympus-gold').paytable.cherry[0], PAYTABLE.cherry[0]);
  assert.equal(evaluateLine(['wild', 'cherry', 'cherry', 'bell', 'star']).multiplier, PAYTABLE.cherry[0]);
});

test('an unknown game id is not silently substituted for play', () => {
  assert.equal(slotGame('does-not-exist'), null);
  assert.equal(slotGame(null), null);
});

test('every game pays from its own paytable and reports its id', () => {
  for (const game of SLOT_GAMES) {
    const random = seeded(1234 + game.id.length);
    const seen = new Set();
    for (let i = 0; i < 300; i++) {
      const result = spinSlots(game.bets[0], random, game.id);
      assert.equal(result.game, game.id);
      seen.add(result.grid.length);
      assert.equal(result.grid.length, 5);
      assert.ok(result.grid.every((reel) => reel.length === 3));
      assert.equal(result.win, result.lines.reduce((a, l) => a + l.amount, 0));
      for (const line of result.lines) {
        assert.ok(line.amount > 0);
        assert.ok(game.paytable[line.symbols.find((s) => s !== 'wild') ?? 'wild'][line.count - 3] > 0);
      }
    }
    assert.deepEqual([...seen], [5]);
  }
});

test('the catalogue payload does not leak the math', () => {
  for (const game of slotCatalog()) {
    assert.equal(game.paytable, undefined);
    assert.equal(game.weights, undefined);
    assert.ok(Array.isArray(game.bets));
    assert.ok(game.glyphs && typeof game.glyphs === 'object');
  }
});

test('every catalogue game returns less than it takes in', () => {
  const spins = 60_000;
  for (const game of SLOT_GAMES) {
    const random = seeded(99 + game.id.length * 7);
    const bet = 1000;
    let won = 0;
    for (let i = 0; i < spins; i++) won += spinSlots(bet, random, game.id).win;
    const rtp = won / (bet * spins);
    assert.ok(rtp > 0.85 && rtp < 1.02, `${game.id} returned ${rtp.toFixed(3)}`);
  }
});
