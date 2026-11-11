import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.GGPOKER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'dangro-session-'));
const {
  db, addTransactionEx, openSessions, refundOpenSessions,
} = await import('./db.js');

const user = db.prepare('SELECT * FROM users ORDER BY id LIMIT 1').get();

function balance() {
  return db.prepare('SELECT balance FROM users WHERE id = ?').get(user.id).balance;
}

test('crash refunds the sum of buy-in and rebuy exactly once', () => {
  const start = balance();
  addTransactionEx(user.id, 'buyin', -5000, 'buy-in', 'USD', { sessionId: 't1:s1', reference: 'in:t1:s1:1' });
  addTransactionEx(user.id, 'rebuy', -5000, 'rebuy', 'USD', { sessionId: 't1:s1', reference: 'in:t1:s1:r1' });
  assert.equal(openSessions().length, 1);
  assert.equal(refundOpenSessions(), 1);
  assert.equal(balance(), start);
  assert.equal(refundOpenSessions(), 0);
  const refund = db.prepare("SELECT * FROM transactions WHERE user_id = ? AND reference = 'refund:t1:s1'").get(user.id);
  assert.equal(refund.amount, 10000);
  assert.equal(refund.kind, 'buyin_refund');
});

test('a busted session with a zero cash-out is not refunded', () => {
  const before = balance();
  addTransactionEx(user.id, 'buyin', -5000, 'buy-in', 'USD', { sessionId: 't2:s1', reference: 'in:t2:s1:1' });
  addTransactionEx(user.id, 'session_close', 0, 'bust', 'USD', { sessionId: 't2:s1', reference: 'out:t2:s1' });
  assert.equal(refundOpenSessions(), 0);
  assert.equal(balance(), before - 5000);
});

test('a failed seat refund is not refunded again', () => {
  const before = balance();
  addTransactionEx(user.id, 'buyin', -5000, 'buy-in', 'USD', { sessionId: 't3:s1', reference: 'in:t3:s1:1' });
  addTransactionEx(user.id, 'refund', 5000, 'seat failed', 'USD', { sessionId: 't3:s1', reference: 'refund:t3:s1' });
  assert.equal(refundOpenSessions(), 0);
  assert.equal(balance(), before);
});

test('duplicate reference is skipped, not credited', () => {
  const before = balance();
  const first = addTransactionEx(user.id, 'test_credit', 1000, 'once', 'USD', { reference: 'dup:1', onDuplicate: 'skip' });
  const second = addTransactionEx(user.id, 'test_credit', 1000, 'twice', 'USD', { reference: 'dup:1', onDuplicate: 'skip' });
  assert.equal(first.applied, true);
  assert.equal(second.applied, false);
  assert.equal(balance(), before + 1000);
});
