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
  assert.equal(openSessions().filter((s) => s.session_id === 't1:s1').length, 1);
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


test('a failing session does not abort the sweep', () => {
  const before = balance();
  addTransactionEx(user.id, 'buyin', -2000, 'buy-in', 'USD', { sessionId: 't4:s1', reference: 'in:t4:s1:1' });
  db.prepare(`INSERT INTO transactions (user_id,kind,currency,amount,balance_after,memo,session_id,reference)
    VALUES (999999,'buyin','USD',-1000,0,'bad session','bad:s','in:bad:s:1')`).run();
  assert.equal(refundOpenSessions(), 1);
  assert.equal(balance(), before);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM transactions WHERE reference = 'refund:t4:s1'").get().c, 1);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM transactions WHERE reference = 'refund:bad:s'").get().c, 0);
});

test('pending-chip refunds and removed chips lower the crash refund', () => {
  const start = balance();
  addTransactionEx(user.id, 'buyin', -5000, 'buy-in', 'USD', { sessionId: 't9:s9', reference: 'in:t9:s9:1' });
  addTransactionEx(user.id, 'rebuy', -3000, 'add chips', 'USD', { sessionId: 't9:s9', reference: 'topup:t9:s9:1' });
  addTransactionEx(user.id, 'chips_refund', 1000, 'pending refund', 'USD', { sessionId: 't9:s9', reference: 'topup:t9:s9:2' });
  addTransactionEx(user.id, 'remove_chips', 2000, 'remove chips', 'USD', { sessionId: 't9:s9', reference: 'remove:t9:s9:1' });
  const open = openSessions().find((s) => s.session_id === 't9:s9');
  assert.equal(open.chips_in, 5000, 'chips already returned are not refunded again');
  refundOpenSessions();
  assert.equal(balance(), start);
});

