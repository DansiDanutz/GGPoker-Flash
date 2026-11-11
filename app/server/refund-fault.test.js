import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.GGPOKER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'dangro-fault-'));
const { db, addTransactionEx, openSessions, refundOpenSessions } = await import('./db.js');
const user = db.prepare('SELECT * FROM users ORDER BY id LIMIT 1').get();

test('a database failure mid-sweep leaves later sessions open and does not abort', () => {
  addTransactionEx(user.id, 'buyin', -1000, 'buyin', 'USD', { sessionId: 'fault:s1', reference: 'in:fault:s1:1' });
  addTransactionEx(user.id, 'buyin', -1000, 'buyin', 'USD', { sessionId: 'fault:s2', reference: 'in:fault:s2:1' });
  let calls = 0;
  const injected = (...args) => {
    calls++;
    if (calls === 2) throw new Error('injected database failure');
    return addTransactionEx(...args);
  };
  assert.equal(refundOpenSessions({ refund: injected }), 1);
  assert.equal(openSessions().filter((s) => s.session_id.startsWith('fault:')).length, 1);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM transactions WHERE reference LIKE 'refund:fault:%'").get().c, 1);
});
