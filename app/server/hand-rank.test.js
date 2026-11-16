import test from 'node:test';
import assert from 'node:assert/strict';
import { currentHandRank, currentSeatHandRank, handDraw, sessionDuration } from '../src/game/handRank.ts';

test('preflop pair and high-card labels use only authorized hole cards', () => {
  assert.equal(currentHandRank(['Ah', 'Ad'], []).label, 'a pair of As');
  assert.equal(currentHandRank(['Ah', 'Kd'], []).label, 'A high');
  assert.equal(currentHandRank(['Ah', 'Ad', 'Kh', 'Qd'], []).label, 'a pair of As');
  assert.deepEqual(currentHandRank(['Ah', 'Ad'], []).cards.map((entry) => entry.card), ['Ah', 'Ad']);
});

test('postflop labels and best five work on flop, turn and river', () => {
  const flop = currentHandRank(['Ah', 'Ad'], ['Ac', 'Kd', '2c']);
  assert.equal(flop.label, 'three of a kind, As');
  assert.equal(flop.labelKey, '3K');
  assert.equal(flop.cards.length, 5);
  const turn = currentHandRank(['Ah', 'Kd'], ['Ac', 'Ad', '2c', '2h']);
  assert.equal(turn.label, 'a full house, As full of 2s');
  const river = currentHandRank(['Ah', 'Kd'], ['Qh', 'Jh', 'Th', '2c', '3d']);
  assert.equal(river.label, 'a straight, T to A');
  assert.equal(river.drawKey, '');
});

test('all nine informational draw labels match the reference branches', () => {
  const examples = [
    [['Ah', 'Kh'], ['Qh', 'Jh', '2c'], 'RoyalStraightFlushDraw'],
    [['8h', '9h'], ['Th', 'Jh', '2c'], 'StraightFlushDraw'],
    [['8h', '9h'], ['Tc', 'Js', '2h', '3h'], 'FlushDrawOpenEndedStraightDraw'],
    [['8h', '9h'], ['Js', '2h', '3h', 'Qc'], 'FlushDrawGutshotStraightDraw'],
    [['Ah', '3h'], ['4c', '5d', '7h', 'Kh'], 'FlushDrawDoubleGutshotStraightDraw'],
    [['Ac', '3d'], ['4h', '5s', '7c'], 'DoubleGutshotStraightDraw'],
    [['8c', '9d'], ['Th', 'Js', '2c'], 'OpenEndedStraightDraw'],
    [['Ac', '2d'], ['3h', '4s', '9c'], 'GutshotStraightDraw'],
    [['Ah', '8h'], ['2h', '4h', 'Qc'], 'FlushDraw'],
  ];
  for (const [hole, board, expected] of examples) assert.equal(handDraw(hole, board), expected, JSON.stringify([hole, board]));
  assert.equal(handDraw(['8c', '9d'], ['Th', 'Js', 'Qc']), '');
  assert.equal(handDraw(['Ah', 'Kh'], ['2h', '4h', '8h']), '');
  assert.equal(handDraw(['Ah', 'Kh'], ['Ah', 'Jh', '2c']), '');
});

test('Short Deck, Omaha and Rabbit virtual-board states preserve their rules', () => {
  const wheel = currentHandRank(['Ah', '6d'], ['7s', '8c', '9h', 'Kd', 'Qc'], true);
  assert.equal(wheel.label, 'a straight, A to 9');
  assert.equal(wheel.drawKey, '');
  const omaha = currentHandRank(['Ah', 'Ad', 'Kh', 'Qd'], ['Ac', 'Kd', '2c']);
  assert.equal(omaha.label, 'three of a kind, As');
  const before = currentSeatHandRank({ hole: ['8c', '9d'], board: ['Th', 'Js', 'Qc'] });
  assert.equal(before.drawKey, '');
  const rabbit = currentSeatHandRank({ hole: ['8c', '9d'], board: ['Th', 'Js', '2c'], rabbitCards: ['Qc', '3d'], rabbitOpened: true });
  assert.equal(rabbit.label, 'a straight, 8 to Q');
  assert.equal(rabbit.drawKey, '');
});

test('invalid or private inputs fail closed and session durations remain bounded', () => {
  assert.equal(currentHandRank(['??', 'Kh'], ['Qh', 'Jh', '2c']), null);
  assert.equal(currentHandRank(['Ah', 'Kh'], ['Ah', 'Jh', '2c']), null);
  assert.equal(handDraw(['Ah', 'Kh', '2d'], ['Qh', 'Jh', '2c']), '');
  assert.equal(sessionDuration(NaN), '-');
  assert.equal(sessionDuration(1000, 61000), '01m 00s');
  assert.equal(sessionDuration(1000, 3661000), '01h 01m');
});
