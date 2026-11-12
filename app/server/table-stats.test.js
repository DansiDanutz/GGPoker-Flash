import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeHands, STATS_WINDOW } from './table-stats.js';

const hand = (pot, players, actions) => ({
  pot,
  players: JSON.stringify(players),
  actions: JSON.stringify(actions),
});
const dealt = (nick) => ({ nick, cards: ['As', 'Kd'] });

test('returns zeros when no hands were recorded', () => {
  assert.deepEqual(summarizeHands([]), { avgPot: 0, vpip: 0, hands: 0 });
});

test('averages recorded pots and rounds to whole chips', () => {
  const rows = [hand(100, [], []), hand(201, [], [])];
  assert.equal(summarizeHands(rows).avgPot, 151);
});

test('VPIP counts each dealt seat once when it calls or raises preflop', () => {
  const rows = [
    hand(60, [dealt('a'), dealt('b'), dealt('c')], [
      { nick: 'a', action: 'raise', amount: 20, street: 'preflop' },
      { nick: 'b', action: 'call', amount: 20, street: 'preflop' },
      { nick: 'a', action: 'bet', amount: 20, street: 'flop' },
      { nick: 'b', action: 'call', amount: 20, street: 'flop' },
      { nick: 'c', action: 'fold', street: 'preflop' },
    ]),
  ];
  // a and b voluntarily entered (2 of 3); repeated actions do not double count.
  assert.equal(summarizeHands(rows).vpip, 67);
});

test('VPIP ignores folds, checks, postflop-only money and undealt seats', () => {
  const rows = [
    hand(40, [dealt('a'), dealt('b'), { nick: 'sitting', cards: [] }], [
      { nick: 'a', action: 'check', street: 'preflop' },
      { nick: 'b', action: 'fold', street: 'preflop' },
      { nick: 'a', action: 'bet', amount: 10, street: 'flop' },
    ]),
  ];
  assert.equal(summarizeHands(rows).vpip, 0);
});

test('hands without action logs are skipped for VPIP but kept for AvgPot', () => {
  const rows = [
    { pot: 100, players: '[]', actions: null },
    hand(300, [dealt('a'), dealt('b')], [{ nick: 'a', action: 'all-in', amount: 50, street: 'preflop' }]),
  ];
  const s = summarizeHands(rows);
  assert.equal(s.avgPot, 200);
  assert.equal(s.vpip, 50);
  assert.equal(s.hands, 2);
});

test('malformed JSON rows do not throw', () => {
  const rows = [{ pot: 50, players: '{bad', actions: '[' }];
  assert.deepEqual(summarizeHands(rows), { avgPot: 50, vpip: 0, hands: 1 });
});

test('window is the native-like last 20 hands', () => {
  assert.equal(STATS_WINDOW, 20);
});
