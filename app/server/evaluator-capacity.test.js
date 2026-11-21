import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDeck, bestHoldem, bestOmaha } from './poker.js';

test('evaluation requires enough cards for the variant', () => {
  const cards = makeDeck();
  assert.throws(() => bestHoldem(cards.slice(0,2),cards.slice(2,4)), RangeError);
  assert.throws(() => bestOmaha(cards.slice(0,1),cards.slice(6,11)), RangeError);
  assert.throws(() => bestOmaha(cards.slice(0,6),cards.slice(6,8)), RangeError);
  for (const count of [4,5,6]) {
    const hole = cards.slice(0,count), board = cards.slice(6,11);
    const best = bestOmaha(hole,board);
    assert.equal(best.cards.filter(c => hole.includes(c)).length,2);
    assert.equal(best.cards.filter(c => board.includes(c)).length,3);
  }
});
