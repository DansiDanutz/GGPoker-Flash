import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as waitlist from './waitlist.js';
import { ensureWaitlistTable, loadWaitlist, restoreWaitlist, saveWaitlist } from './waitlist-store.js';

function memoryDb() {
  const db = new DatabaseSync(':memory:');
  ensureWaitlistTable(db);
  return db;
}

test('an empty database restores an empty wait list', () => {
  const db = memoryDb();
  assert.deepEqual(loadWaitlist(db), waitlist.createWaitlist());
});

test('queues survive a save and load in order', () => {
  const db = memoryDb();
  let s = waitlist.createWaitlist();
  s = waitlist.join(s, 3, { tableId: 'a' }).state;
  s = waitlist.join(s, 1, { tableId: 'a' }).state;
  s = waitlist.join(s, 2, { groupKey: 'holdem:1/2:6', tables: [] }).state;
  saveWaitlist(db, s);
  const back = loadWaitlist(db);
  assert.deepEqual(back.queues, { 't:a': [3, 1], 'g:holdem:1/2:6': [2] });
  assert.equal(waitlist.position(back, 1, 't:a'), 2);
  assert.ok(Object.isFrozen(back) && Object.isFrozen(back.queues['t:a']));
});

test('a held seat comes back as the head of its queue (the live table is gone after a restart)', () => {
  let s = waitlist.createWaitlist();
  s = waitlist.join(s, 1, { tableId: 'a' }).state;
  s = waitlist.join(s, 2, { tableId: 'a' }).state;
  s = waitlist.offer(s, 'a', 4, 1000).state; // player 1 holds seat 4, player 2 waits
  const back = restoreWaitlist(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back.offers, []);
  assert.deepEqual(back.queues['t:a'], [1, 2]);
});

test('a malformed or hostile row is ignored instead of crashing the boot', () => {
  const db = memoryDb();
  db.prepare('INSERT INTO waitlist_state (id, state) VALUES (1, ?)').run('{not json');
  assert.deepEqual(loadWaitlist(db), waitlist.createWaitlist());
  const odd = restoreWaitlist({
    queues: { 't:a': [1, 'x', 1, null], bogus: [2], 'g:k': 'nope' },
    offers: [{ userId: 5 }, { userId: 6, queueKey: 't:b' }],
  });
  assert.deepEqual(odd.queues, { 't:a': [1], 't:b': [6] });
});

test('saving an empty wait list clears the stored queues', () => {
  const db = memoryDb();
  saveWaitlist(db, waitlist.join(waitlist.createWaitlist(), 1, { tableId: 'a' }).state);
  saveWaitlist(db, waitlist.createWaitlist());
  assert.deepEqual(loadWaitlist(db).queues, {});
});
