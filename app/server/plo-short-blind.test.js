import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';

const DEEP = 10_000;

// Three-handed PLO, blinds 100/200, button on seat 0: seat 1 posts the SB, seat 2 the BB.
function deal(stacks) {
  const t = new PokerTable({
    id: 'plo-short', name: 'PLO', game: 'omaha', sb: 100, bb: 200, seats: stacks.length,
    min_buyin: 1, max_buyin: 1_000_000, botIterations: 8,
  });
  t.nextHandAt = Date.now() + 1e9;
  stacks.forEach((stack, i) => t.sit({ id: i + 1, nick: `P${i + 1}` }, i, stack));
  t.nextHandAt = 0;
  t.startHand();
  return { t, p: (i) => t.seats[i].player };
}

const ok = (res) => assert.equal(res.ok, true, res.error);

test('full blinds: the opening pot raise is 3.5 big blinds', () => {
  const { t, p } = deal([DEEP, DEEP, DEEP]);
  assert.equal(t.actor, 1);
  assert.equal(t.potLimitMax(p(0)), 700);
});

test('a short small blind still allows the full-blind opening pot raise', () => {
  const { t, p } = deal([DEEP, 50, DEEP]);
  assert.equal(p(1).allIn, true);
  assert.equal(t.potLimitMax(p(0)), 700);
});

test('a short big blind still allows the full-blind opening pot raise', () => {
  const { t, p } = deal([DEEP, DEEP, 100]);
  assert.equal(p(2).allIn, true);
  assert.equal(t.potLimitMax(p(0)), 700);
  ok(t.act(1, 'raise', 701));
  assert.equal(p(0).bet, 700, 'a raise over the pot is clamped to the pot limit');
  assert.equal(t.potLimitMax(p(1)), 2300, 'the re-pot keeps the nominal blind adjustment');
});

test('both blinds short keep the full-blind cap', () => {
  const { t, p } = deal([DEEP, 50, 100]);
  assert.equal(t.potLimitMax(p(0)), 700);
});

test('after the flop the pot limit uses only the chips actually in the pot', () => {
  const { t, p } = deal([DEEP, DEEP, 100]);
  ok(t.act(1, 'raise', 700));
  ok(t.act(2, 'call'));
  assert.equal(t.street, 'flop');
  const actual = t.pot + t.totalBets();
  assert.equal(actual, 1500);
  assert.equal(t.potLimitMax(p(1)), actual);
});
