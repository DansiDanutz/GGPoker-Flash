import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tableCount,
  seatPlayers,
  totalChips,
  nextBalancingMove,
  applyMove,
  balanceAll,
  tablesToBreak,
  breakTables,
} from './tournament.js';

const field = (n, stack = 1000) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, stack }));

test('tableCount rounds up and never returns zero for a non-empty field', () => {
  assert.equal(tableCount(0, 6), 0);
  assert.equal(tableCount(1, 6), 1);
  assert.equal(tableCount(6, 6), 1);
  assert.equal(tableCount(7, 6), 2);
  assert.equal(tableCount(37, 6), 7);
});

test('seatPlayers spreads a field so table sizes differ by at most one', () => {
  const tables = seatPlayers(field(37), 6);
  const sizes = tables.map((t) => t.players.length);
  assert.equal(tables.length, 7);
  assert.equal(Math.max(...sizes) - Math.min(...sizes) <= 1, true);
  assert.equal(sizes.reduce((a, b) => a + b, 0), 37);
});

test('seatPlayers never exceeds table capacity', () => {
  for (const n of [1, 5, 6, 7, 12, 13, 100]) {
    for (const t of seatPlayers(field(n), 6)) assert.ok(t.players.length <= 6, `${n} players`);
  }
});

test('balancing picks a move only when tables differ by two or more', () => {
  const even = [
    { id: 'a', players: field(5) },
    { id: 'b', players: field(5) },
  ];
  assert.equal(nextBalancingMove(even), null);

  const uneven = [
    { id: 'a', players: field(6) },
    { id: 'b', players: field(3) },
  ];
  const move = nextBalancingMove(uneven);
  assert.equal(move.from, 'a');
  assert.equal(move.to, 'b');
});

test('a balancing move preserves every chip and leaves the source one lighter', () => {
  const tables = [
    { id: 'a', players: field(6, 1500) },
    { id: 'b', players: field(3, 800) },
  ];
  const before = totalChips(tables);
  const after = applyMove(tables, nextBalancingMove(tables));
  assert.equal(totalChips(after), before);
  assert.equal(after.find((t) => t.id === 'a').players.length, 5);
  assert.equal(after.find((t) => t.id === 'b').players.length, 4);
});

test('balanceAll settles a badly split field into near-equal tables', () => {
  const tables = [
    { id: 'a', players: field(9) },
    { id: 'b', players: field(2) },
    { id: 'c', players: field(1) },
  ];
  const { tables: balanced, moves } = balanceAll(tables);
  const sizes = balanced.map((t) => t.players.length);
  assert.equal(Math.max(...sizes) - Math.min(...sizes) <= 1, true);
  assert.equal(totalChips(balanced), totalChips(tables));
  assert.ok(moves.length > 0);
});

test('tablesToBreak ignores the single remaining table and full tables', () => {
  assert.deepEqual(tablesToBreak([{ id: 'only', players: field(2) }]), []);
  assert.deepEqual(
    tablesToBreak([
      { id: 'a', players: field(5) },
      { id: 'b', players: field(2) },
    ]),
    ['b'],
  );
});

test('breaking a table moves everyone and conserves chips', () => {
  const tables = [
    { id: 'a', players: field(4) },
    { id: 'b', players: field(2) },
  ];
  const before = totalChips(tables);
  const { tables: after, broken, moves } = breakTables(tables, ['b'], 6);
  assert.deepEqual(broken, ['b']);
  assert.equal(moves.length, 2);
  assert.equal(after.length, 1);
  assert.equal(after[0].players.length, 6);
  assert.equal(totalChips(after), before);
});

test('a table is not broken when the surviving tables have no room', () => {
  const tables = [
    { id: 'a', players: field(6) },
    { id: 'b', players: field(1) },
  ];
  const { tables: after, broken } = breakTables(tables, ['b'], 6);
  assert.deepEqual(broken, []);
  assert.equal(after.length, 2);
  assert.equal(totalChips(after), totalChips(tables));
});
