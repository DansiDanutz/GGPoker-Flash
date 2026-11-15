// GGPoker Short Deck (6+) ranking: flush beats full house AND three of a kind beats a straight.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bestHoldem, compareScores } from './poker.js';
import { bestHand } from '../src/game/eval.ts';

const C = (c) => ({ r: c[0], s: c[1], v: '23456789TJQKA'.indexOf(c[0]) + 2 });
const hold = (hole, board, sd) => bestHoldem(hole.map(C), board.map(C), sd);

const trips = hold(['9h', '9d'], ['9s', 'Kc', '6h', 'Ad', '7c'], true);
const straight = hold(['8h', 'Td'], ['9s', 'Jc', 'Qh', '6d', '6c'], true);

test('short deck: three of a kind beats a straight (GGPoker rule)', () => {
  assert.equal(trips.name, 'Three of a Kind');
  assert.equal(straight.name, 'Straight');
  assert.ok(compareScores(trips.score, straight.score) > 0);
});

test('short deck: the straight still beats two pair, and the flush still beats a full house', () => {
  const twoPair = hold(['Kh', 'Kd'], ['9s', '9c', '6h', 'Ad', '7c'], true);
  assert.ok(compareScores(straight.score, twoPair.score) > 0);
  const flush = hold(['Ah', '7h'], ['9h', 'Jh', '6h', 'Ks', 'Kc'], true);
  const boat = hold(['Kh', '9d'], ['Ks', 'Kc', '9h', '6d', '7c'], true);
  assert.equal(flush.name, 'Flush');
  assert.equal(boat.name, 'Full House');
  assert.ok(compareScores(flush.score, boat.score) > 0);
});

test('regular hold\'em keeps straight over three of a kind', () => {
  const t = hold(['9h', '9d'], ['9s', 'Kc', '2h', 'Ad', '7c'], false);
  const s = hold(['8h', 'Td'], ['9s', 'Jc', 'Qh', '2d', '3c'], false);
  assert.ok(compareScores(s.score, t.score) > 0);
});

test('the table\'s own hand label agrees (client evaluator)', () => {
  assert.equal(bestHand(['9h', '9d'], ['9s', 'Kc', '6h', 'Ad', '7c'], false, true)?.name, 'Three of a Kind');
  assert.equal(bestHand(['8h', 'Td'], ['9s', 'Jc', 'Qh', '6d', '6c'], false, true)?.name, 'Straight');
  const t = bestHand(['9h', '9d'], ['9s', 'Kc', '6h', 'Ad', '7c'], false, true);
  const s = bestHand(['8h', 'Td'], ['9s', 'Jc', 'Qh', '6d', '6c'], false, true);
  assert.ok(t.cat > s.cat, 'client category order matches the server');
});
