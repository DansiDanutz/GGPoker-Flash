// Battle Royale is capture-gated (P0 slice B0): no table under the label may be listed,
// created, joined or started until the native rules and payouts are captured.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BATTLE_ROYALE_UNAVAILABLE, disableBattleRoyaleTables, isBattleRoyale } from './battleroyale.js';
import { parseTableConfig } from './validate.js';
import { startServer } from './test-helpers.js';

const serverDir = import.meta.dirname;
const BR_ROWS = ['br-1', 'br-2'];

// The rows an older build seeded: plain Hold'em under the Battle Royale label, enabled.
function insertLegacyRows(dataDir) {
  const raw = new DatabaseSync(path.join(dataDir, 'ggpoker.db'));
  const ins = raw.prepare(`INSERT OR REPLACE INTO tables (id,name,game,category,sb,bb,ante,min_buyin,max_buyin,seats,speed,featured,enabled,sort)
    VALUES (?,?,'battleroyale','Battle',500,1000,0,25000,25000,6,'Fast',0,1,?)`);
  BR_ROWS.forEach((id, i) => ins.run(id, `Battle Royale ${i + 1}`, 990 + i));
  raw.close();
}

// Boots db.js in a fresh process (which runs the migrations) and reports the BR rows.
function boot(dataDir) {
  const script = `
    const { db } = await import('./db.js');
    const { disableBattleRoyaleTables } = await import('./battleroyale.js');
    const again = disableBattleRoyaleTables(db);
    const rows = db.prepare("SELECT id, enabled FROM tables WHERE game = 'battleroyale' ORDER BY id").all();
    const others = db.prepare("SELECT COUNT(*) AS n FROM tables WHERE game != 'battleroyale' AND enabled = 1").get().n;
    process.stdout.write(JSON.stringify({ rows, again, others }));`;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: serverDir, env: { ...process.env, GGPOKER_DATA: dataDir }, encoding: 'utf8',
  }));
}

test('disableBattleRoyaleTables flips only enabled battleroyale rows and is idempotent', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE tables (id TEXT PRIMARY KEY, game TEXT, enabled INTEGER NOT NULL DEFAULT 1)');
  const ins = db.prepare('INSERT INTO tables (id, game, enabled) VALUES (?,?,?)');
  ins.run('br-1', 'battleroyale', 1);
  ins.run('br-2', 'battleroyale', 0);
  ins.run('nlh-1', 'holdem', 1);
  ins.run('spin-1', 'spingold', 1);

  assert.equal(disableBattleRoyaleTables(db), 1);
  assert.equal(disableBattleRoyaleTables(db), 0, 'second run changes nothing');
  const rows = Object.fromEntries(db.prepare('SELECT id, enabled FROM tables').all().map((r) => [r.id, r.enabled]));
  assert.deepEqual(rows, { 'br-1': 0, 'br-2': 0, 'nlh-1': 1, 'spin-1': 1 });
  db.close();
});

test('isBattleRoyale and parseTableConfig refuse the format', () => {
  assert.equal(isBattleRoyale('battleroyale'), true);
  assert.equal(isBattleRoyale('holdem'), false);
  assert.equal(isBattleRoyale(undefined), false);
  assert.deepEqual(parseTableConfig({ game: 'battleroyale' }), { ok: false, error: BATTLE_ROYALE_UNAVAILABLE });
  assert.equal(parseTableConfig({ game: 'holdem' }).ok, true);
});

test('boot seeds no Battle Royale tables and disables existing ones idempotently', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-br-boot-'));
  try {
    const fresh = boot(dataDir);
    assert.deepEqual(fresh.rows, [], 'a new database seeds no battleroyale rows');
    assert.ok(fresh.others > 0, 'other tables are still seeded');

    insertLegacyRows(dataDir);
    const migrated = boot(dataDir);
    assert.deepEqual(migrated.rows, BR_ROWS.map((id) => ({ id, enabled: 0 })), 'boot switches legacy rows off');
    assert.equal(migrated.again, 0, 'the migration already ran during boot');
    assert.equal(migrated.others, fresh.others, 'no other table is touched');

    const rebooted = boot(dataDir);
    assert.deepEqual(rebooted.rows, migrated.rows, 'rows are kept, never deleted');
    assert.equal(rebooted.again, 0);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

let srv;
let player;
let admin;
let dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-br-srv-'));
  boot(dataDir);
  insertLegacyRows(dataDir);
  srv = await startServer({ dataDir });
  player = await srv.login('DansiDanutz', 'ggpoker');
  admin = await srv.login('admin', 'admin123');
});

after(async () => {
  await srv?.stop();
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

// Re-enable a row behind the server's back, as a stale admin edit or a restored backup might.
function forceEnable(id) {
  const raw = new DatabaseSync(path.join(dataDir, 'ggpoker.db'));
  raw.prepare('UPDATE tables SET enabled = 1 WHERE id = ?').run(id);
  raw.close();
}

test('lobby lists no Battle Royale rows, even a re-enabled one', async () => {
  forceEnable('br-1');
  for (const route of ['/api/lobby', '/api/tables']) {
    const { status, data } = await srv.get(route, { token: player });
    assert.equal(status, 200);
    assert.ok(data.tables.length > 0, `${route} still lists other tables`);
    assert.equal(data.tables.filter((t) => t.game === 'battleroyale').length, 0, route);
  }
});

test('joining a Battle Royale table is refused with a clear error and no buy-in', async () => {
  forceEnable('br-2');
  const start = await srv.balance(player);
  for (const tableId of BR_ROWS) {
    const ws = srv.socket(player);
    await ws.opened;
    ws.send({ type: 'join_table', tableId, buyin: 25000 });
    const reply = await ws.next((m) => m.type === 'error' || m.type === 'joined');
    assert.deepEqual(reply, { type: 'error', error: BATTLE_ROYALE_UNAVAILABLE }, tableId);
    ws.send({ type: 'join_table', tableId, observe: true });
    const watch = await ws.next((m) => m.type === 'error' || m.type === 'joined');
    assert.equal(watch.type, 'error', 'cannot observe (and so start) one either');
    await ws.close();
  }
  assert.equal(await srv.balance(player), start, 'no chips moved');
});

test('creating a Battle Royale table is refused', async () => {
  const res = await srv.post('/api/admin/tables', {
    token: admin,
    body: { id: 'br-new', name: 'Battle Royale X', game: 'battleroyale', sb: 500, bb: 1000, min_buyin: 25000, max_buyin: 25000 },
  });
  assert.equal(res.status, 400);
  assert.equal(res.data.error, BATTLE_ROYALE_UNAVAILABLE);

  const hosted = await srv.post('/api/tables/host', { token: player, body: { game: 'battleroyale', name: 'BR home' } });
  assert.equal(hosted.status, 200);
  const mine = (await srv.get('/api/tables/host', { token: player })).data;
  const row = (mine.tables || mine).find((t) => t.id === hosted.data.id);
  assert.notEqual(row?.game, 'battleroyale', 'private hosting never creates the format');
});
