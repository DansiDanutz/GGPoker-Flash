import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  autoFoldItems, autoFoldHandKey, autoFoldMatrix, autoFoldRateSelection, autoFoldSelectedRate,
  readAutoFoldPreferences, editAutoFoldSelection,
} from './auto-fold.js';
import { autoFoldEligible, autoFoldPreferences, autoFoldTick, saveAutoFoldPreferences } from './auto-fold.js';
import { PokerTable } from './table.js';

process.env.GGPOKER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-auto-fold-'));
const { db } = await import('./db.js');

const ranks = '23456789TJQKA';
const suits = 'cdhs';

test('all 1326 physical two-card combinations map to the 169 native classes', () => {
  const classes = new Set();
  for (let first = 0; first < ranks.length; first++) for (let second = first; second < ranks.length; second++) {
    for (const a of suits) for (const b of suits) {
      if (first === second && a === b) continue;
      const key = autoFoldHandKey([ranks[first] + a, ranks[second] + b]);
      assert.ok(key);
      const item = autoFoldItems.find((entry) => entry.key === key);
      assert.ok(item, key);
      classes.add(item.index);
    }
  }
  assert.equal(classes.size, 169, autoFoldItems.filter((entry) => !classes.has(entry.index)).map((entry) => entry.key).join(','));
  assert.equal(autoFoldMatrix.length, 169);
  assert.equal(autoFoldRateSelection(95).length, 159);
  assert.equal(autoFoldHandKey(['Ah', 'Ad']), 'AA');
  assert.equal(autoFoldHandKey(['Kd', 'Ac']), 'AKo');
  assert.equal(autoFoldHandKey(['Kd', 'Ad']), 'AKs');
  assert.equal(autoFoldHandKey(['Ad', 'Ad']), null);
});

test('default selection, 96% editor boundary and corrupt recovery match the reference', () => {
  const defaults = readAutoFoldPreferences('{}');
  assert.equal(defaults.active, false);
  assert.equal(defaults.selected.length, 59);
  assert.ok(Math.abs(autoFoldSelectedRate(defaults.selected) - 50.7) < 0.001);
  assert.equal(editAutoFoldSelection([0], 0, false).length, 1, 'the last selected cell cannot be removed');
  assert.equal(editAutoFoldSelection([0], 1, true).length, 2);
  assert.equal(readAutoFoldPreferences('{broken').active, false);
});

function sixPlayers() {
  const table = new PokerTable({ id: 'auto-fold-table', name: 'Auto Fold', game: 'rush', seats: 6, sb: 10, bb: 20, min_buyin: 20, max_buyin: 1000 });
  table.holdStart = true;
  for (let id = 1; id <= 6; id++) table.sit({ id, nick: `P${id}` }, id - 1, 1000);
  table.holdStart = false;
  table.maybeStart();
  return table;
}
const preferences = { active: true, button: true, blinds: true, rate: 95, selected: autoFoldItems.map((item) => item.index) };

test('Rush eligibility respects capability, positions, prior actions and directed Cash Drop', () => {
  const table = sixPlayers();
  const player = table.seats[0].player;
  assert.equal(autoFoldEligible(table, player, preferences), true);
  table.cashDrop = { handId: table.handId, amount: 100 };
  assert.equal(autoFoldEligible(table, player, preferences), false);
  table.cashDrop = null;
  player.acted = true;
  assert.equal(autoFoldEligible(table, player, preferences), false);
  player.acted = false;
  assert.equal(autoFoldEligible(table, player, { ...preferences, button: false }), table.button !== player.seat);
  table.street = 'flop';
  assert.equal(autoFoldEligible(table, player, preferences), false);
});

test('one-second scheduler folds once and cancels on manual action or a newer hand', () => {
  const table = sixPlayers();
  const pending = new Map();
  const context = { preferences: () => preferences, get: (key) => pending.get(key), set: (key, due) => pending.set(key, due), delete: (key) => pending.delete(key) };
  autoFoldTick(table, context, 1000);
  assert.equal(pending.size, 6);
  autoFoldTick(table, context, 1999);
  assert.equal(table.seats[0].player.folded, false);
  autoFoldTick(table, context, 2000);
  assert.equal(table.seats[0].player.folded, true);
  assert.equal(pending.size, 5);
  const next = table.seats[1].player;
  next.acted = true;
  autoFoldTick(table, context, 3000);
  assert.ok(pending.size < 5);
  assert.equal(next.folded, false);
});

test('preference writes are revisioned and replay-safe', () => {
  const config = { active: true, button: false, blinds: true, rate: 50, selected: [0, 1, 2] };
  const saved = saveAutoFoldPreferences(db, { actorId: 1, expectedRevision: 0, operationId: 'save-auto-fold', config });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.revision, 1);
  assert.deepEqual(saveAutoFoldPreferences(db, { actorId: 1, expectedRevision: 0, operationId: 'save-auto-fold', config }).body, saved.body);
  assert.equal(autoFoldPreferences(db, 1).revision, 1);
  assert.equal(saveAutoFoldPreferences(db, { actorId: 1, expectedRevision: 0, operationId: 'stale-auto-fold', config }).status, 409);
});
