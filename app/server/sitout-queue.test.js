// The accelerated sit-out clock counts group (lobby) queues that can fill this table, not only
// the table's own queue (Codex review #59).
import test from 'node:test';
import assert from 'node:assert/strict';
import { waitingForTable } from './sitOut.js';

test('table and group queues both count', () => {
  const sizes = { 't:a': 1, 'g:holdem:1/2:6': 2 };
  const size = (key) => sizes[key] || 0;
  assert.equal(waitingForTable({ id: 'a', game: 'holdem', sb: 1, bb: 2, seats: 6 }, size), 3);
  assert.equal(waitingForTable({ id: 'b', game: 'holdem', sb: 1, bb: 2, seats: 9 }, size), 0);
});
