import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { applyLegacyElo, applyNumericElo } from './elo.js';

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY,elo INTEGER DEFAULT 1000,deleted_at TEXT);
    CREATE TABLE elo_ratings (user_id INTEGER,game TEXT,elo INTEGER,PRIMARY KEY(user_id,game));
    CREATE TABLE elo_history (id INTEGER PRIMARY KEY,user_id INTEGER,hand_id TEXT,delta INTEGER,before INTEGER,after INTEGER,game TEXT);`);
  for (const id of [1, 2, 3]) db.prepare('INSERT INTO users (id,elo) VALUES (?,1000)').run(id);
  return db;
}

const rating = (db, id) => db.prepare("SELECT elo FROM elo_ratings WHERE user_id = ? AND game = 'holdem'").get(id).elo;

test('RIMT rating uses gross contribution and uncalled returns exactly once per hand', () => {
  const db = database();
  const players = [
    { id: 1, grossContribution: 300, uncalledReturn: 0, win: 450 },
    { id: 2, grossContribution: 1000, uncalledReturn: 700, win: 150 },
  ];
  applyNumericElo(db, { handId: 'unequal', game: 'holdem', players });
  assert.equal(rating(db, 1), 1012);
  assert.equal(rating(db, 2), 988);
  applyNumericElo(db, { handId: 'unequal', game: 'holdem', players });
  assert.equal(rating(db, 1), 1012);
  assert.equal(rating(db, 2), 988);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM elo_history WHERE hand_id = 'unequal'").get().count, 2);
});

test('RIMT split nets receive pairwise scores and one history row per dealt-in player', () => {
  const db = database();
  const players = [
    { id: 1, grossContribution: 300, uncalledReturn: 0, win: 300 },
    { id: 2, grossContribution: 300, uncalledReturn: 0, win: 300 },
    { id: 3, grossContribution: 300, uncalledReturn: 0, win: 0 },
  ];
  applyNumericElo(db, { handId: 'split', game: 'holdem', players });
  assert.deepEqual([rating(db, 1), rating(db, 2), rating(db, 3)], [1006, 1006, 988]);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM elo_history WHERE hand_id = 'split'").get().count, 3);
});

test('ordinary hands retain the legacy winner reducer', () => {
  const db = database();
  applyLegacyElo(db, { handId: 'ordinary', game: 'holdem', players: [{ id: 1 }, { id: 2 }], winners: [{ id: 1 }] });
  assert.deepEqual([rating(db, 1), rating(db, 2)], [1012, 988]);
});
