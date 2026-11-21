import test from 'node:test';
import assert from 'node:assert/strict';
import { blackjackTotal, baccaratTotal, finishBaccarat } from './casino-scores.js';

const cards = (...values) => values.map(v => ({ v }));
test('blackjack scores natural, soft, hard and multiple-ace hands', () => {
  for (const [hand, total] of [[[14,13],21], [[14,6],17], [[14,6,9],16], [[14,14,9],21], [[14,14,13,10],22]]) {
    assert.equal(blackjackTotal(cards(...hand)), total);
  }
});
test('baccarat counts aces as one and takes the last digit', () => {
  for (const [hand, total] of [[[14,13],1], [[14,9],0], [[14,14,8],0], [[10,11,12],0]]) {
    assert.equal(baccaratTotal(cards(...hand)), total);
  }
});

test('Punto Banco handles naturals, standing players and every banker third-card decision', () => {
  const rank = value => value === 0 ? 10 : value === 1 ? 14 : value;
  const drawOn = ['0123456789','0123456789','0123456789','012345679','234567','4567','67',''];
  for (let p = 0; p <= 9; p++) for (let b = 0; b <= 9; b++) for (let third = 0; third <= 9; third++) {
    const player = cards(10,rank(p)), banker = cards(10,rank(b));
    finishBaccarat(player, banker, cards(2,rank(third)));
    const natural = p >= 8 || b >= 8;
    assert.equal(player.length, !natural && p <= 5 ? 3 : 2);
    const bankerDraws = !natural && (p >= 6 ? b <= 5 : drawOn[b].includes(String(third)));
    assert.equal(banker.length, bankerDraws ? 3 : 2);
  }
});
