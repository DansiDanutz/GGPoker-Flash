// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { chipEventRevision, canRestoreChipEvent } from './organizer-chip-checkpoint.js';

test('a room checkpoint cannot replay over a newer payout or bounty', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE organizer_chip_journals(id INTEGER PRIMARY KEY,from_account TEXT,to_account TEXT)');
    const insert = db.prepare('INSERT INTO organizer_chip_journals(from_account,to_account) VALUES (?,?)');
    insert.run('ticket:1', 'event:cup');
    const saved = { version: 1, flights: [{ id: 'cup-1' }], chipRevision: chipEventRevision(db, 'cup') };
    assert.equal(canRestoreChipEvent(db, 'cup', saved), true);
    insert.run('wallet:2', 'wallet:3');
    assert.equal(canRestoreChipEvent(db, 'cup', saved), true, 'unrelated transfers do not invalidate a checkpoint');
    insert.run('event:cup', 'wallet:2');
    assert.equal(canRestoreChipEvent(db, 'cup', saved), false);
    saved.chipRevision = chipEventRevision(db, 'cup');
    assert.equal(canRestoreChipEvent(db, 'cup', saved), true);
    insert.run('event:cup-bounty', 'wallet:3');
    assert.equal(canRestoreChipEvent(db, 'cup', saved), false);
    assert.equal(canRestoreChipEvent(db, 'cup', null), false);
    assert.equal(canRestoreChipEvent(db, 'cup', { ...saved, flights: [] }), false);
  } finally { db.close(); }
});
