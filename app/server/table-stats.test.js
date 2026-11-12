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

import { playerHud, HUD_WINDOW } from './table-stats.js';

const row = (id, pot, players, actions, board = 'As Kd 7c 2h 9s') => ({
  hand_no: id, pot, board, players: JSON.stringify(players), actions: JSON.stringify(actions),
});

test('playerHud: room-scoped VPIP, PFR, hands and wins for one nick', () => {
  const rows = [
    row(3, 400, [{ nick: 'v', cards: ['Qh', 'Qd'], win: 400, showed: true }, { nick: 'h', cards: ['2c', '3c'], win: 0 }],
      [{ nick: 'v', action: 'raise', amount: 60, street: 'preflop' }, { nick: 'h', action: 'call', amount: 60, street: 'preflop' }]),
    row(2, 100, [{ nick: 'v', cards: ['8h', '7d'], win: 0 }, { nick: 'h', cards: ['Ac', 'Ad'], win: 100 }],
      [{ nick: 'h', action: 'raise', amount: 60, street: 'preflop' }, { nick: 'v', action: 'call', amount: 60, street: 'preflop' }]),
    row(1, 30, [{ nick: 'v', cards: ['9h', '4d'], win: 0 }, { nick: 'h', cards: ['Kc', 'Qd'], win: 30 }],
      [{ nick: 'v', action: 'fold', street: 'preflop' }]),
    row(0, 30, [{ nick: 'other', cards: ['9h', '4d'] }], []),
  ];
  const hud = playerHud(rows, 'v');
  assert.equal(hud.hands, 3);
  assert.equal(hud.vpip, 67);
  assert.equal(hud.pfr, 33);
  assert.equal(hud.wins, 1);
});

test('playerHud: recent hands reveal cards only when the player showed them', () => {
  const rows = [
    row(5, 400, [{ nick: 'v', cards: ['Qh', 'Qd'], win: 400, showed: true }], []),
    row(4, 100, [{ nick: 'v', cards: ['8h', '7d'], win: 0, showed: false }], []),
  ];
  const { recent } = playerHud(rows, 'v');
  assert.deepEqual(recent.map((r) => r.cards), [['Qh', 'Qd'], null]);
  assert.deepEqual(recent[0], { handNo: 5, pot: 400, won: 400, board: ['As', 'Kd', '7c', '2h', '9s'], cards: ['Qh', 'Qd'] });
});

test('playerHud: unknown player gives an empty HUD; window is bounded', () => {
  assert.deepEqual(playerHud([], 'v'), { hands: 0, vpip: 0, pfr: 0, wins: 0, recent: [] });
  assert.ok(HUD_WINDOW >= 20 && HUD_WINDOW <= 200);
});

import { seatVpips } from './table-stats.js';

// Native seat badge: the number beside each avatar is the player's VPIP % at this table
// (live captures: 38 -> 60 for a straddling hero, 100 for a player who entered every pot).
test('seatVpips: VPIP for every requested nick in one pass, 0 without hands', () => {
  const rows = [
    row(2, 100, [{ nick: 'v', cards: ['8h', '7d'] }, { nick: 'h', cards: ['Ac', 'Ad'] }],
      [{ nick: 'h', action: 'raise', street: 'preflop' }, { nick: 'v', action: 'call', street: 'preflop' }]),
    row(1, 30, [{ nick: 'v', cards: ['9h', '4d'] }, { nick: 'h', cards: ['Kc', 'Qd'] }],
      [{ nick: 'v', action: 'fold', street: 'preflop' }, { nick: 'h', action: 'check', street: 'preflop' }]),
  ];
  assert.deepEqual(seatVpips(rows, ['v', 'h', 'new']), { v: 50, h: 50, new: 0 });
});
