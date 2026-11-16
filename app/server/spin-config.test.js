import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.GGPOKER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-spin-config-'));
const { ensureSpinStore } = await import('./spin-queue.js');
const { saveSpinRules, spinRulesComplete, validateSpinRules } = await import('./spin-config.js');
const { spinPayouts } = await import('./spin.js');

function config(stake = 5000) {
  return { rows: spinPayouts(stake).map((row) => ({ ...row, startingChips: 500, timeBankCards: 3, actionSeconds: 15, secondsPerCard: 10, maxCardsPerAction: 3 })) };
}

test('incomplete timing rows and invalid card limits are rejected', () => {
  assert.equal(spinRulesComplete({ rows: spinPayouts(5000) }), false);
  assert.throws(() => validateSpinRules({ rows: spinPayouts(5000) }, 5000), /startingChips/);
  const invalid = config();
  invalid.rows[0].maxCardsPerAction = 4;
  assert.throws(() => validateSpinRules(invalid, 5000), /maxCardsPerAction/);
  invalid.rows[0].maxCardsPerAction = 3;
  invalid.rows[0].noDealing = true;
  assert.throws(() => validateSpinRules(invalid, 5000), /cannot be dealt/);
});

test('owner rule saves are complete, replayable, conflict-checked and revisioned', () => {
  const db = new DatabaseSync(':memory:');
  ensureSpinStore(db);
  const body = { actorId: 1, mode: '3max', stake: 5000, expectedRevision: 1, operationId: 'save-rules', config: config(), insurance: { premium: 100, payout: 1000 } };
  const saved = saveSpinRules(db, body);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.state.complete, true);
  assert.equal(saved.body.state.ruleRevision, 2);
  const replay = saveSpinRules(db, body);
  assert.equal(replay.status, 200);
  assert.equal(replay.replayed, true);
  assert.equal(db.prepare("SELECT revision FROM spin_rules WHERE mode = '3max' AND stake = 5000").get().revision, 2);
  const changed = config();
  changed.rows[0].startingChips = 600;
  assert.equal(saveSpinRules(db, { ...body, config: changed }).status, 409);
  assert.equal(saveSpinRules(db, { ...body, operationId: 'stale-rules', expectedRevision: 1 }).status, 409);
  assert.throws(() => saveSpinRules(db, { ...body, operationId: 'bad-insurance', insurance: { premium: 1000000001, payout: 1000 } }), /Insurance premium/);
});
