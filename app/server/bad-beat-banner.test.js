import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badBeatRows } from '../src/game/badBeat.ts';

test('badBeatRows: winner, opponent, then the rest of players as one shared row', () => {
  const rows = badBeatRows({ total: 10000, shares: [
    { id: '1', nick: 'Ann', seat: 0, role: 'winner', amount: 5000 },
    { id: '2', nick: 'Bob', seat: 1, role: 'opponent', amount: 2500 },
    { id: '3', nick: 'Cy', seat: 2, role: 'table', amount: 1250 },
    { id: '4', nick: 'Di', seat: 3, role: 'table', amount: 1250 },
  ] });
  assert.deepEqual(rows, [
    { label: 'Bad Beat Winner', names: 'Ann', amount: 5000 },
    { label: 'Bad Beat Opponent', names: 'Bob', amount: 2500 },
    { label: 'Rest of Players (2 Players Share)', names: 'Cy, Di', amount: 2500 },
  ]);
});

test('badBeatRows: heads-up has no rest row; a single rest player says (1 Player)', () => {
  const hu = badBeatRows({ total: 100, shares: [
    { id: '1', nick: 'A', seat: 0, role: 'winner', amount: 75 }, { id: '2', nick: 'B', seat: 1, role: 'opponent', amount: 25 },
  ] });
  assert.equal(hu.length, 2);
  const one = badBeatRows({ total: 100, shares: [{ id: '3', nick: 'C', seat: 2, role: 'table', amount: 25 }] });
  assert.equal(one[0].label, 'Rest of Players (1 Player)');
});
