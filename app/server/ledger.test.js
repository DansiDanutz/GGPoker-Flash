import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolate the database before db.js is imported (it opens on import).
process.env.GGPOKER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'dangro-ledger-'));
const { db, addTransaction } = await import('./db.js');

test('addTransaction writes balance and ledger together', () => {
  const u = db.prepare('SELECT * FROM users ORDER BY id LIMIT 1').get();
  const before = u.balance;
  const after = addTransaction(u.id, 'test_credit', 1234, 'ledger test');
  assert.equal(after, before + 1234);
  const row = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(u.id);
  assert.equal(row.amount, 1234);
  assert.equal(row.balance_after, after);
  assert.equal(row.memo, 'ledger test');
});

test('ledger balance_after is continuous for a user and currency', () => {
  const u = db.prepare('SELECT * FROM users ORDER BY id LIMIT 1').get();
  addTransaction(u.id, 'test_credit', 500, 'continuity 1');
  addTransaction(u.id, 'test_debit', -200, 'continuity 2');
  const rows = db.prepare("SELECT amount, balance_after FROM transactions WHERE user_id = ? AND currency = 'USD' ORDER BY id").all(u.id);
  for (let i = 1; i < rows.length; i++) {
    assert.equal(rows[i].balance_after, rows[i - 1].balance_after + rows[i].amount);
  }
});

test('a failed ledger write does not change the balance', () => {
  const u = db.prepare('SELECT * FROM users ORDER BY id LIMIT 1').get();
  const before = u.balance;
  assert.throws(() => addTransaction(999999, 'test_credit', 100, 'missing user'));
  const after = db.prepare('SELECT balance FROM users WHERE id = ?').get(u.id).balance;
  assert.equal(after, before);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM transactions WHERE user_id = 999999').get().c, 0);
});
