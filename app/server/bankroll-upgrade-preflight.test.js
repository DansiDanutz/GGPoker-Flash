// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('upgrade preflight refuses orphaned stakes and outstanding challenges without changing the backup', t => {
  const dir = mkdtempSync(join(tmpdir(), 'bankroll-preflight-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'backup.db');
  const change = sql => {
    const db = new DatabaseSync(file);
    try { db.exec(sql); } finally { db.close(); }
  };
  const check = () => {
    const before = readFileSync(file);
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../../tools/check-bankroll-upgrade.mjs', import.meta.url)), file], { encoding: 'utf8' });
    assert.deepEqual(readFileSync(file), before);
    return result;
  };
  change(`CREATE TABLE users(login, play_chips, elo);
    CREATE TABLE transactions(user_id, kind, currency, balance_after);
    CREATE TABLE prop_bets(id INTEGER PRIMARY KEY, type, status);
    CREATE TABLE prop_bet_entries(bet_id, user_id, side, stake);
    INSERT INTO prop_bet_entries VALUES(1,2,'bettor',100);`);
  const orphan = check();
  assert.equal(orphan.status, 1);
  assert.match(orphan.stderr, /stake has no matching bet/);
  change("INSERT INTO prop_bets VALUES(1,'bankroll','running')");
  const running = check();
  assert.equal(running.status, 1);
  assert.deepEqual(JSON.parse(running.stdout), { open: 0, running: 1 });
  change("UPDATE prop_bets SET status='settled'");
  const settled = check();
  assert.equal(settled.status, 0, settled.stderr);
  assert.deepEqual(JSON.parse(settled.stdout), { open: 0, running: 0 });
});
