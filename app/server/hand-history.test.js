import test from 'node:test';
import assert from 'node:assert/strict';
import { handForViewer, seatPositions } from './hand-history.js';

const seated = (id, seat, extra = {}) => ({
  id, nick: `P${id}`, seat, stack: 1000, cards: ['As', 'Kd'], folded: false, inHand: true,
  win: 0, totalBet: 100, isBot: false, showed: false, ...extra,
});

function rowWith({ players, result = {}, meta = null, actions = [], board = '2c 3d 4h 5s 9c' }) {
  return {
    id: 7, hand_no: 3, table_id: 't1', table_name: 'Table 1', game: 'holdem', board, pot: 300,
    players: JSON.stringify(players), result: JSON.stringify(result), actions: JSON.stringify(actions),
    meta: meta === null ? null : JSON.stringify(meta), hero_cards: '', created_at: '2026-01-01 00:00:00',
  };
}

// Seat 0 wins at showdown and shows; seat 1 loses and mucks (autoMuck); seat 2 folded earlier.
const showdownPlayers = () => [
  seated(1, 0, { showed: true, cards: ['Ac', 'Ad'] }),
  seated(2, 1, { showed: false, cards: ['Qc', 'Qh'] }),
  seated(3, 2, { folded: true, inHand: true, showed: false, cards: ['7s', '2d'] }),
];
const showdownResult = () => ({
  reason: 'showdown',
  winners: [{ id: 1, nick: 'P1', seat: 0, amount: 300, hand: 'Pair', cards: ['Ac', 'Ad'], pot: 300, potIndex: 0 }],
  hands: [
    { seat: 0, nick: 'P1', cards: ['Ac', 'Ad'], hand: 'Pair' },
    { seat: 1, nick: 'P2', cards: ['Qc', 'Qh'], hand: 'Pair' },
  ],
});

test('a non-owner never receives mucked opponent cards in players or result', () => {
  const view = handForViewer(rowWith({ players: showdownPlayers(), result: showdownResult() }), 3);
  assert.deepEqual(view.players.find((p) => p.seat === 1).cards, []);
  assert.deepEqual(view.result.hands.find((h) => h.seat === 1).cards, []);
  const wire = JSON.stringify(view);
  assert.equal(wire.includes('Qc'), false, 'mucked Qc must not reach a non-owner');
  assert.equal(wire.includes('Qh'), false, 'mucked Qh must not reach a non-owner');
});

test('a showdown winner who showed is visible to every viewer', () => {
  const view = handForViewer(rowWith({ players: showdownPlayers(), result: showdownResult() }), 3);
  assert.deepEqual(view.players.find((p) => p.seat === 0).cards, ['Ac', 'Ad']);
  assert.deepEqual(view.result.hands.find((h) => h.seat === 0).cards, ['Ac', 'Ad']);
  assert.deepEqual(view.result.winners[0].cards, ['Ac', 'Ad']);
});

test('the owner keeps their own mucked cards in players and result', () => {
  const view = handForViewer(rowWith({ players: showdownPlayers(), result: showdownResult() }), 2);
  assert.deepEqual(view.players.find((p) => p.seat === 1).cards, ['Qc', 'Qh']);
  assert.deepEqual(view.result.hands.find((h) => h.seat === 1).cards, ['Qc', 'Qh']);
});

test('legacy rows without the showed flag reveal only showdown winners, never mucked losers', () => {
  const legacy = showdownPlayers().map(({ showed, ...rest }) => rest);
  const view = handForViewer(rowWith({ players: legacy, result: showdownResult() }), 3);
  assert.deepEqual(view.players.find((p) => p.seat === 0).cards, ['Ac', 'Ad']);
  assert.deepEqual(view.players.find((p) => p.seat === 1).cards, []);
  assert.deepEqual(view.result.hands.find((h) => h.seat === 1).cards, []);
});

test('a folded player whose cards were never shown stays hidden from a non-owner', () => {
  const view = handForViewer(rowWith({ players: showdownPlayers(), result: showdownResult() }), 1);
  assert.deepEqual(view.players.find((p) => p.seat === 2).cards, []);
});

test('viewers who did not play the hand receive nothing', () => {
  assert.equal(handForViewer(rowWith({ players: showdownPlayers(), result: showdownResult() }), 99), null);
});

test('stored button and blinds are projected, and positions are labelled from the button', () => {
  const players = [seated(1, 0), seated(2, 1), seated(3, 2), seated(4, 3), seated(5, 4), seated(6, 5)];
  const meta = { button: 0, blinds: { sb: 50, bb: 100, ante: 0 } };
  const view = handForViewer(rowWith({ players, meta }), 1);
  assert.equal(view.button, 0);
  assert.deepEqual(view.blinds, { sb: 50, bb: 100, ante: 0 });
  assert.deepEqual(view.players.map((p) => p.position), ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO']);
});

test('older hands without stored metadata get no position or blind labels', () => {
  const view = handForViewer(rowWith({ players: [seated(1, 0), seated(2, 1), seated(3, 2)] }), 1);
  assert.equal(view.button, null);
  assert.equal(view.blinds, null);
  assert.ok(view.players.every((p) => p.position === null));
});

test('malformed stored metadata is ignored rather than trusted', () => {
  const players = [seated(1, 0), seated(2, 1)];
  const badBlinds = handForViewer(rowWith({ players, meta: { button: 1, blinds: { sb: -5, bb: 100, ante: 0 } } }), 1);
  assert.equal(badBlinds.blinds, null);
  assert.equal(badBlinds.button, 1);
  for (const meta of [{ button: 'x' }, { button: 1.5 }]) {
    const bad = handForViewer(rowWith({ players, meta }), 1);
    assert.equal(bad.button, null);
    assert.ok(bad.players.every((p) => p.position === null));
  }
});

test('seatPositions orders participants clockwise from the button with sparse seats', () => {
  const players = [seated(1, 0), seated(2, 2), seated(3, 4)];
  const labels = seatPositions(players, 4);
  assert.deepEqual([...labels.entries()], [[4, 'BTN'], [0, 'SB'], [2, 'BB']]);
});

test('seatPositions gives heads-up players BTN/SB and BB', () => {
  const labels = seatPositions([seated(1, 2), seated(2, 5)], 2);
  assert.deepEqual([...labels.entries()], [[2, 'BTN/SB'], [5, 'BB']]);
});

test('seatPositions labels four-handed and nine-handed tables and leaves larger fields unlabelled', () => {
  assert.deepEqual([...seatPositions([0, 1, 2, 3].map((s) => seated(s + 1, s)), 0).values()], ['BTN', 'SB', 'BB', 'CO']);
  const nine = Array.from({ length: 9 }, (_, s) => seated(s + 1, s));
  assert.deepEqual([...seatPositions(nine, 0).values()], ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'MP', 'HJ', 'CO']);
  const ten = Array.from({ length: 10 }, (_, s) => seated(s + 1, s));
  assert.equal(seatPositions(ten, 0).size, 0, 'ten or more dealt players have no labels rather than guessed ones');
});

test('seatPositions ignores players who sat out of the hand', () => {
  const players = [seated(1, 0), seated(2, 1, { inHand: false }), seated(3, 2)];
  assert.deepEqual([...seatPositions(players, 0).entries()], [[0, 'BTN/SB'], [2, 'BB']]);
});

test('seatPositions yields no labels without a valid button', () => {
  for (const button of [null, undefined, -1, 'x']) assert.equal(seatPositions([seated(1, 0), seated(2, 1)], button).size, 0);
});
