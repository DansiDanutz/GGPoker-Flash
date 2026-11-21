// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { startServer } from './test-helpers.js';

test('Crash restart voids only identified outstanding stakes, once', async () => {
  let srv = await startServer();
  try {
    const { token, user } = (await srv.post('/api/auth/guest', { body: {} })).data;
    const initial = await srv.balance(token);
    const { dataDir } = srv;
    await srv.stop();
    const db = new DatabaseSync(join(dataDir, 'ggpoker.db'));
    try {
      let balance = initial;
      const entry = db.prepare("INSERT INTO transactions(user_id,kind,currency,amount,balance_after,session_id,reference) VALUES(?,?,'USD',?,?,?,?)");
      for (const [id,kind,amount,ref] of [
        ['open','crash_bet',-100,'stake'], ['win','crash_bet',-100,'stake'], ['win','crash_win',150,'end'],
        ['loss','crash_bet',-100,'stake'], ['loss','crash_loss',0,'end'], [null,'crash_bet',-100,null],
      ]) entry.run(user.id,kind,amount,balance += amount,id,ref && 'crash:'+ref+':'+id);
      db.prepare('UPDATE users SET balance=? WHERE id=?').run(balance,user.id);
    } finally { db.close(); }
    for (let i=0; i<2; i++) {
      srv = await startServer({ dataDir });
      assert.equal(await srv.balance(token), initial - 150);
      const snapshot = new DatabaseSync(join(dataDir,'ggpoker.db'), { readOnly: true });
      try {
        const refunds = snapshot.prepare("SELECT session_id,amount FROM transactions WHERE kind='crash_refund'").all();
        assert.deepEqual(refunds.map(r => [r.session_id,r.amount]), [['open',100]]);
      } finally { snapshot.close(); }
      if (i===0) await srv.stop();
    }
  } finally { await srv.stop(); }
});
