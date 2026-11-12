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
  nextTableIndex,
  nextFlightIndex,
  tournamentTableIds,
  flightTableId,
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

test('nextTableIndex fills a table before opening the next one', () => {
  assert.equal(nextTableIndex([], 6, 4), 1);
  assert.equal(nextTableIndex([1], 6, 4), 1);
  assert.equal(nextTableIndex([6], 6, 4), 2);
  assert.equal(nextTableIndex([6, 2], 6, 4), 2);
  assert.equal(nextTableIndex([6, 6], 6, 4), 3);
});

test('nextTableIndex never exceeds the flight cap', () => {
  assert.equal(nextTableIndex([6, 6], 6, 2), null);
  assert.throws(() => nextTableIndex([], 0, 3), /seats/);
  assert.throws(() => nextTableIndex([], 6, 0), /maxTables/);
});

test('tournamentTableIds keeps the legacy id first and covers every flight', () => {
  const ids = tournamentTableIds('abc', 3);
  assert.equal(ids[0], 'tourney-abc');
  assert.deepEqual(ids.slice(1), ['tourney-abc-1', 'tourney-abc-2', 'tourney-abc-3']);
  assert.equal(new Set(ids).size, ids.length);
});

test('flightTableId keeps flight 1 on the legacy id and numbers the rest', () => {
  assert.equal(flightTableId('abc', 1), 'tourney-abc');
  assert.equal(flightTableId('abc', 2), 'tourney-abc-1');
  assert.equal(flightTableId('abc', 3), 'tourney-abc-2');
  assert.throws(() => flightTableId('abc', 0), /positive integer/);
  // Every flight id is one the unregistration check already covers.
  const ids = tournamentTableIds('abc', 12);
  for (let i = 1; i <= 12; i += 1) assert.ok(ids.includes(flightTableId('abc', i)));
});

test('nextFlightIndex fills flights in order, then opens the lowest free index', () => {
  assert.equal(nextFlightIndex(new Map(), 6, 4), 1);
  assert.equal(nextFlightIndex(new Map([[1, 6]]), 6, 4), 2);
  assert.equal(nextFlightIndex(new Map([[1, 6], [2, 3]]), 6, 4), 2);
  // A broken table leaves a gap; the gap is reused before a later flight grows.
  assert.equal(nextFlightIndex(new Map([[1, 6], [3, 2]]), 6, 4), 2);
  // Plain-object input is accepted for JSON-shaped callers.
  assert.equal(nextFlightIndex({ 1: 6, 2: 6 }, 6, 4), 3);
});

test('nextFlightIndex refuses to open more flights than the cap', () => {
  assert.equal(nextFlightIndex(new Map([[1, 6], [2, 6], [3, 6]]), 6, 3), null);
  assert.throws(() => nextFlightIndex(new Map(), 0, 3), /seats/);
  assert.throws(() => nextFlightIndex(new Map(), 6, 0), /maxTables/);
});

test('balancing never moves a player the caller cannot move', () => {
  const tables = [
    { id: 'a', players: [{ id: 'busy', stack: 1000, inHand: true }, ...field(5).map((p) => ({ ...p, inHand: true }))] },
    { id: 'b', players: field(3) },
  ];
  assert.equal(nextBalancingMove(tables, { canMove: (p) => !p.inHand }), null);
  const relaxed = nextBalancingMove(tables);
  assert.equal(relaxed.from, 'a');
  // Balance-all honours the predicate too.
  const { tables: after } = balanceAll(tables, { canMove: (p) => !p.inHand });
  assert.equal(after.find((t) => t.id === 'a').players.length, 6);
});
