import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';
const card = s => ({ r: s[0], s: s[1], v: '23456789TJQKA'.indexOf(s[0]) + 2 });
function settle(entries, bounty = 5, configure = () => {}) {
  const table = new PokerTable({ id: 'bounty-test', name: 'Bounty', game: 'holdem', seats: entries.length, sb: 1, bb: 2,
    tournament: { mode: 'BOUNTY', bounty, prizePool: 0 } });
  table.button = 0;
  entries.forEach(([bet, cards], index) => {
    table.seats[index].player = { id: index + 1, nick: `P${index + 1}`, seat: index, stack: 0, totalBet: bet, bet: 0,
      inHand: true, folded: false, cards: cards.map(card), winAmount: 0, allIn: true, isBot: false };
  });
  table.board = ['2s', '3d', '7h', '9c', 'Kd'].map(card);
  table.pot = entries.reduce((sum, [bet]) => sum + bet, 0);
  table.handNo = 1; table.street = 'river'; table.lastAggressor = 2;
  const awards = [], events = [];
  table.hooks = { onBounty: (_table, award) => awards.push(award) };
  table.emit = event => events.push(event);
  table.doShowdown();
  table.nextHandAt = 1;
  configure(table);
  table.tick(2);
  return { table, awards, events };
}
const shares = award => award.shares.map(s => [s.winnerId, s.amount]);
test('a losing last aggressor with an uncalled return gets no bounty', () => {
  const { awards } = settle([[100, ['Qh', 'Jd']], [120, ['Th', '8d']], [110, ['Ah', 'Ad']]]);
  assert.equal(awards.length, 1);
  assert.equal(awards[0].bustedId, 1);
  assert.deepEqual(shares(awards[0]), [[3, 5]]);
});
test('covering tied winners split once, odd chip clockwise from dealer', () => {
  const { table, awards, events } = settle([[100, ['Ah', 'Qd']], [100, ['As', 'Qc']], [100, ['Jh', 'Td']]]);
  assert.deepEqual(shares(awards[0]), [[2, 3], [1, 2]]);
  assert.equal(awards[0].amount, 5);
  assert.deepEqual(events.filter(e => e.type === 'bounty').map(e => e.amount), [3, 2]);
  table.tick(3);
  assert.equal(awards.length, 1);
});
test('only the tied winner who covers the loser receives the bounty', () => {
  const { awards } = settle([[50, ['Ah', 'Qd']], [100, ['As', 'Qc']], [100, ['Jh', 'Td']]]);
  assert.deepEqual(shares(awards[0]), [[2, 5]]);
});
test('a higher side-pot winner cannot take the short player bounty', () => {
  const { awards } = settle([[50, ['Ah', 'Ad']], [100, ['Qh', 'Qd']], [25, ['Jh', 'Td']], [100, ['Th', '8d']]]);
  assert.deepEqual(shares(awards.find(a => a.bustedId === 3)), [[1, 5]]);
  assert.deepEqual(shares(awards.find(a => a.bustedId === 4)), [[2, 5]]);
});
test('a one-chip bounty is never rounded up for every tied winner', () => {
  const { awards, events } = settle([[100, ['Ah', 'Qd']], [100, ['As', 'Qc']], [100, ['Jh', 'Td']]], 1);
  assert.deepEqual(shares(awards[0]), [[2, 1], [1, 0]]);
  assert.equal(events.filter(e => e.type === 'bounty').reduce((sum, e) => sum + e.amount, 0), 1);
});

test('a failed payout retries the same Mystery draw before ranking or clearing the busted seat', context => {
  const { awards } = settle([[100, ['Ah', 'Qd']], [100, ['As', 'Qc']], [100, ['Jh', 'Td']]], 50, table => {
    table.mystery = true;
    const original = table.hooks.onBounty;
    table.hooks.onBounty = () => { throw new Error('temporary payout failure'); };
    context.mock.method(Math, 'random', () => 0.2);
    assert.throws(() => table.tick(2), /temporary payout failure/);
    assert.equal(table.finished.length, 0);
    assert.equal(table.seats[2].player.id, 3);
    context.mock.method(Math, 'random', () => 0.99);
    table.hooks.onBounty = original;
  });
  assert.equal(awards[0].amount, 13, 'retry must not redraw the 500-chip tier');
  assert.deepEqual(shares(awards[0]), [[2, 7], [1, 6]]);
});

test('Cash Chip bounty notifications preserve the whole-chip amount and unit', () => {
  const { events } = settle([[100, ['Ah', 'Qd']], [100, ['As', 'Qc']], [100, ['Jh', 'Td']]], 13,
    table => { table.cfg.chip_economy = 1; });
  const messages = events.filter(e => e.type === 'bounty');
  assert.deepEqual(messages.map(e => [e.chipEconomy, e.amount]), [[true, 7], [true, 6]]);
});
