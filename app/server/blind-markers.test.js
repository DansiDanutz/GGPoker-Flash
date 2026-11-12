// SB/BB position markers (Codex clone FEATURES.md 329): the snapshot names the seats
// that posted the blinds for the current hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';

function deal(n) {
  const t = new PokerTable({
    id: 'markers', name: 'Markers', game: 'holdem', sb: 50, bb: 100, seats: n,
    min_buyin: 100, max_buyin: 1_000_000, botIterations: 8,
  }, { onEvent: () => {} });
  t.nextHandAt = Date.now() + 1e9;
  for (let i = 0; i < n; i++) t.sit({ id: i + 1, nick: `P${i + 1}` }, i, 10_000);
  t.nextHandAt = 0;
  t.startHand();
  return t;
}

test('ring game: SB and BB are the two seats after the button', () => {
  const s = deal(4).snapshotFor(1);
  assert.equal(s.button, 0);
  assert.equal(s.sbSeat, 1);
  assert.equal(s.bbSeat, 2);
});

test('heads-up: the button is the small blind', () => {
  const s = deal(2).snapshotFor(1);
  assert.equal(s.sbSeat, s.button);
  assert.notEqual(s.bbSeat, s.button);
});

test('no markers before the first hand', () => {
  const t = new PokerTable({ id: 'm2', name: 'M', game: 'holdem', sb: 50, bb: 100, seats: 6, min_buyin: 100, max_buyin: 1e6 }, { onEvent: () => {} });
  const s = t.snapshotFor(null);
  assert.equal(s.sbSeat, -1);
  assert.equal(s.bbSeat, -1);
});
