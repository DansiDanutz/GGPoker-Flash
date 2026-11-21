import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('fresh and upgraded wallets reject overdrafts without rewriting legacy balances', t => {
  const dir = mkdtempSync(join(tmpdir(), 'wallet-floor-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const boot = () => {
    const r = spawnSync(process.execPath, ['db.js'], { cwd: new URL('.', import.meta.url), env: { ...process.env, GGPOKER_DATA: dir }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  };
  boot();
  const db = new DatabaseSync(join(dir, 'ggpoker.db'));
  try {
    for (const field of ['balance', 'gems']) {
      assert.throws(() => db.exec(`INSERT INTO users(login,nick,password,${field}) VALUES ('floor','fixture','fixture',-1)`), /wallet floor/);
    }
    db.exec('DROP TRIGGER user_wallet_floor_update');
    const id = db.prepare('SELECT min(id) id FROM users').get().id;
    const update = db.prepare('UPDATE users SET balance=?, gems=? WHERE id=?');
    update.run(-10,-5,id);
    const entries = () => db.prepare('SELECT count(*) n FROM transactions WHERE user_id=?').get(id).n;
    const before = entries();
    boot();
    assert.deepEqual([...Object.values(db.prepare('SELECT balance,gems FROM users WHERE id=?').get(id))], [-10,-5]);
    assert.equal(entries(), before);
    assert.throws(() => update.run(-11,-5,id), /wallet floor/);
    assert.throws(() => update.run(-10,-6,id), /wallet floor/);
    update.run(-5,-5,id);
    update.run(0,0,id);
    assert.throws(() => update.run(-1,0,id), /wallet floor/);
  } finally { db.close(); }
});
