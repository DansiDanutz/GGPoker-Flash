// Admin database restore: POST /api/admin/restore stages a validated upload; the next start applies it.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './test-helpers.js';
import { MAX_RESTORE_BYTES, PENDING_NAME, utcStamp } from './admin-restore.js';
import { base64FromDataUrl, RESTORE_MAX_BYTES } from '../src/lib/api.ts';

const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'latin1');
const PRE_RESTORE_RE = /^ggpoker\.db\.pre-restore-\d{8}-\d{6}(-\d+)?$/;

let scratch;
let tempRoot;
let srv;
let adminToken;
let playerToken;
let validBackup; // a real backup of the running server plus a `restored_marker` user

const env = () => ({ GGPOKER_BACKUP_TMP: tempRoot });
const pendingPath = (dir) => path.join(dir, PENDING_NAME);
const preRestoreFiles = (dir) => fs.readdirSync(dir).filter((f) => PRE_RESTORE_RE.test(f));

function query(file, sql, ...params) {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return db.prepare(sql).all(...params); } finally { db.close(); }
}
const liveDb = (dir) => path.join(dir, 'ggpoker.db');
const hasUser = (file, login) => query(file, 'SELECT 1 FROM users WHERE login = ?', login).length === 1;
const auditRows = (file, action) => query(file, 'SELECT actor, detail FROM audit_log WHERE action = ? ORDER BY id', action);

/** Build a SQLite file with `setup` and return its bytes. */
function sqliteBytes(setup) {
  const file = path.join(scratch, `fixture-${Math.random().toString(36).slice(2)}.db`);
  const db = new DatabaseSync(file);
  setup(db);
  db.close();
  const bytes = fs.readFileSync(file);
  fs.rmSync(file, { force: true });
  return bytes;
}

const restore = (body, token = adminToken) => srv.post('/api/admin/restore', { token, body });
const payload = (buf, confirm = 'RESTORE') => ({ data: buf.toString('base64'), confirm });

before(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-restore-test-'));
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-restore-tmp-'));
  srv = await startServer({ env: env() });
  adminToken = await srv.login('admin', 'admin123');
  const reg = await srv.post('/api/auth/register', { body: { login: 'rst_player', nick: 'Restore Player', password: 'secret12' } });
  assert.equal(reg.status, 200, JSON.stringify(reg.data));
  playerToken = reg.data.token;

  const res = await fetch(`${srv.base}/api/admin/backup`, { headers: { authorization: `Bearer ${adminToken}` } });
  assert.equal(res.status, 200);
  const file = path.join(scratch, 'backup.db');
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  const db = new DatabaseSync(file);
  db.prepare("INSERT INTO users (login, nick, password) VALUES ('restored_marker', 'Restored', 'x:y')").run();
  db.close();
  validBackup = fs.readFileSync(file);

  // Exists only in the live DB, after the backup was taken.
  const later = await srv.post('/api/auth/register', { body: { login: 'live_only', nick: 'Live Only', password: 'secret12' } });
  assert.equal(later.status, 200, JSON.stringify(later.data));
});
after(async () => {
  await srv?.stop();
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('utcStamp is UTC YYYYMMDD-HHMMSS', () => {
  assert.equal(utcStamp(new Date(Date.UTC(2026, 10, 12, 7, 5, 9))), '20261112-070509');
});

test('client helper strips the data URL prefix and shares the 6 MB limit', () => {
  assert.equal(base64FromDataUrl('data:application/octet-stream;base64,U1FMaXRl'), 'U1FMaXRl');
  assert.equal(base64FromDataUrl('data:;base64,'), '');
  assert.throws(() => base64FromDataUrl('data:text/plain,hello'), /Could not read/);
  assert.throws(() => base64FromDataUrl('U1FMaXRl'), /Could not read/);
  assert.equal(RESTORE_MAX_BYTES, MAX_RESTORE_BYTES);
});

test('anonymous is 401, non-admin is 403, and nothing is staged', async () => {
  assert.equal((await restore(payload(validBackup), null)).status, 401);
  assert.equal((await restore(payload(validBackup), playerToken)).status, 403);
  assert.equal(fs.existsSync(pendingPath(srv.dataDir)), false);
  assert.equal(auditRows(liveDb(srv.dataDir), 'restore_queued').length, 0);
});

test('bad confirm, bad base64, bad header, corrupt and wrong-schema files are 400', async () => {
  const cases = [
    payload(validBackup, 'restore'),
    { data: validBackup.toString('base64') },
    { data: 'not base64 !!', confirm: 'RESTORE' },
    payload(Buffer.from('this is definitely not a sqlite database file')),
    payload(Buffer.concat([SQLITE_MAGIC, Buffer.alloc(4096, 0x41)])),
    payload(sqliteBytes((db) => db.exec('CREATE TABLE users (id INTEGER); CREATE TABLE hands (id INTEGER);'))),
  ];
  for (const body of cases) {
    const res = await restore(body);
    assert.equal(res.status, 400, `${JSON.stringify(res.data)} for confirm=${body.confirm}`);
    assert.equal(typeof res.data.error, 'string');
  }
  const schema = await restore(cases.at(-1));
  assert.match(schema.data.error, /missing tables: tables/);
  assert.equal(fs.existsSync(pendingPath(srv.dataDir)), false);
  assert.deepEqual(fs.readdirSync(tempRoot), [], 'temp upload dirs are removed');
});

test('an upload over 6 MB is 413', async () => {
  const big = Buffer.concat([SQLITE_MAGIC, Buffer.alloc(MAX_RESTORE_BYTES + 1 - SQLITE_MAGIC.length)]);
  const res = await restore(payload(big));
  assert.equal(res.status, 413);
  assert.equal(fs.existsSync(pendingPath(srv.dataDir)), false);
});

test('GET is 405', async () => {
  assert.equal((await srv.get('/api/admin/restore', { token: adminToken })).status, 405);
});

test('a valid upload stages restore-pending.db, audits it and leaves the live DB unchanged', async () => {
  const res = await restore(payload(validBackup));
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(res.data, { ok: true, requiresRestart: true });

  const pending = pendingPath(srv.dataDir);
  assert.ok(fs.readFileSync(pending).equals(validBackup), 'pending file is the uploaded bytes');
  assert.deepEqual(fs.readdirSync(srv.dataDir).filter((f) => f.endsWith('.tmp')), [], 'no staging leftovers');
  assert.deepEqual(fs.readdirSync(tempRoot), [], 'temp upload dir removed');

  const live = liveDb(srv.dataDir);
  assert.equal(hasUser(live, 'live_only'), true);
  assert.equal(hasUser(live, 'restored_marker'), false);
  assert.deepEqual(preRestoreFiles(srv.dataDir), []);
  const rows = auditRows(live, 'restore_queued');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor, 'admin');
  assert.match(rows[0].detail, new RegExp(`^${validBackup.length} bytes`));

  // The running server keeps serving the live data.
  const users = await srv.get('/api/admin/users?q=live_only', { token: adminToken });
  assert.equal(users.data.users.length, 1);
});

test('restart applies the pending DB and keeps a pre-restore backup', async () => {
  const dataDir = srv.dataDir;
  await srv.stop();
  srv = await startServer({ dataDir, env: env() });

  assert.equal(fs.existsSync(pendingPath(dataDir)), false, 'pending file consumed');
  const live = liveDb(dataDir);
  assert.equal(hasUser(live, 'restored_marker'), true);
  assert.equal(hasUser(live, 'live_only'), false);
  const applied = auditRows(live, 'restore_applied');
  assert.equal(applied.length, 1);
  assert.equal(applied[0].actor, 'system');

  const kept = preRestoreFiles(dataDir);
  assert.equal(kept.length, 1, fs.readdirSync(dataDir).join(','));
  assert.match(applied[0].detail, new RegExp(kept[0].replace(/\./g, '\\.')));
  const backup = path.join(dataDir, kept[0]);
  assert.equal(hasUser(backup, 'live_only'), true, 'pre-restore copy holds the old live data');
  assert.equal(auditRows(backup, 'restore_queued').length, 1);

  // The restored server works: the restored marker user is listed over HTTP.
  const token = await srv.login('admin', 'admin123');
  const users = await srv.get('/api/admin/users?q=restored_marker', { token });
  assert.equal(users.status, 200);
  assert.equal(users.data.users.length, 1);
});

test('an invalid pending file is ignored at startup and the live DB is untouched', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-restore-bad-'));
  let other = await startServer({ dataDir, env: env() });
  try {
    const reg = await other.post('/api/auth/register', { body: { login: 'keep_me', nick: 'Keep Me', password: 'secret12' } });
    assert.equal(reg.status, 200);
    await other.stop();
    const garbage = Buffer.concat([SQLITE_MAGIC, Buffer.alloc(2048, 0x7a)]);
    fs.writeFileSync(pendingPath(dataDir), garbage);

    other = await startServer({ dataDir, env: env() });
    const live = liveDb(dataDir);
    assert.equal(hasUser(live, 'keep_me'), true);
    assert.equal(auditRows(live, 'restore_applied').length, 0);
    assert.deepEqual(preRestoreFiles(dataDir), []);
    assert.ok(fs.readFileSync(pendingPath(dataDir)).equals(garbage), 'invalid pending file left for the owner to inspect');
  } finally {
    await other.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
