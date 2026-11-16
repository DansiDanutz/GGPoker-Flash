import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';
import { occupancyOf } from './lobby-occupancy.js';

const table = () => {
  const t = new PokerTable({ id: 't', name: 'T', game: 'holdem', seats: 6, sb: 5, bb: 10, min_buyin: 10, max_buyin: 5000, rakePercent: 0 });
  t.nextHandAt = Date.now() + 1e9;
  t.saveHand = () => {};
  return t;
};

test('a seated player keeps a valid two-letter country', () => {
  const t = table();
  t.sit({ id: 1, nick: 'Ana', country: 'ro' }, 0, 500);
  t.sit({ id: 2, nick: 'Bo', country: 'Romania<script>' }, 1, 500);
  t.sit({ id: 3, nick: 'Cy' }, 2, 500);
  const byNick = Object.fromEntries(occupancyOf(t).seated.map((s) => [s.nick, s.country]));
  assert.deepEqual(byNick, { Ana: 'RO', Bo: '', Cy: '' });
});

test('the public table state carries the seat country', () => {
  const t = table();
  t.sit({ id: 1, nick: 'Ana', country: 'GB' }, 0, 500);
  const seat = t.snapshotFor(99).players.find((s) => s && s.nick === 'Ana');
  assert.equal(seat.country, 'GB');
});
