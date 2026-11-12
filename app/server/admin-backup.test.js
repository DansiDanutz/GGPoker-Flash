// Admin database backup: GET /api/admin/backup returns a consistent SQLite snapshot.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './test-helpers.js';
import { backupFilename, isInside, resolveTempRoot, CONTENT_TYPE } from './admin-backup.js';
import { backupFilenameFrom } from '../src/lib/api.ts';

const SQLITE_MAGIC = 'SQLite format 3\0';
const FILENAME_RE = /^attachment; filename="dangg-backup-\d{8}-\d{6}\.db"$/;

let srv;
let tempRoot;
let adminToken;
let playerToken;

before(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-backup-root-'));
  srv = await startServer({ env: { GGPOKER_BACKUP_TMP: tempRoot } });
  adminToken = await srv.login('admin', 'admin123');
  const reg = await srv.post('/api/auth/register', { body: { login: 'bak_player', nick: 'Backup Player', password: 'secret12' } });
  assert.equal(reg.status, 200, JSON.stringify(reg.data));
  playerToken = reg.data.token;
});
after(async () => {
  await srv.stop();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

const tempEntries = () => fs.readdirSync(tempRoot);
const backupRows = () => {
  const db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'), { readOnly: true });
  try { return db.prepare("SELECT actor, detail FROM audit_log WHERE action = 'backup' ORDER BY id").all(); }
  finally { db.close(); }
};
const download = (token) => fetch(`${srv.base}/api/admin/backup`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

test('backupFilename is UTC YYYYMMDD-HHMMSS', () => {
  assert.equal(backupFilename(new Date(Date.UTC(2026, 0, 2, 3, 4, 5))), 'dangg-backup-20260102-030405.db');
  assert.equal(backupFilename(new Date(Date.UTC(2026, 10, 12, 23, 59, 59))), 'dangg-backup-20261112-235959.db');
});

test('temp root must sit outside the data dir', () => {
  assert.equal(isInside('/srv/data', '/srv/data/tmp'), true);
  assert.equal(isInside('/srv/data', '/srv/data'), true);
  assert.equal(isInside('/srv/data', '/tmp'), false);
  assert.equal(isInside('/srv/data', '/srv/data-other'), false);
  assert.throws(() => resolveTempRoot('/srv/data', '/srv/data/backups'), /outside the data dir/);
  assert.equal(resolveTempRoot('/srv/data', '/tmp/x'), '/tmp/x');
});

test('anonymous is 401 and non-admin is 403, with no file and no audit row', async () => {
  const anon = await srv.get('/api/admin/backup');
  assert.equal(anon.status, 401);
  const player = await srv.get('/api/admin/backup', { token: playerToken });
  assert.equal(player.status, 403);
  assert.deepEqual(tempEntries(), []);
  assert.equal(backupRows().length, 0);
});

test('admin download is a valid SQLite file with attachment headers', async () => {
  const res = await download(adminToken);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), CONTENT_TYPE);
  assert.match(res.headers.get('content-disposition'), FILENAME_RE);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = Buffer.from(await res.arrayBuffer());
  assert.equal(Number(res.headers.get('content-length')), body.length);
  assert.equal(body.subarray(0, 16).toString('latin1'), SQLITE_MAGIC);

  // The snapshot opens and holds the live data.
  const copy = path.join(tempRoot, '..', `verify-${process.pid}.db`);
  fs.writeFileSync(copy, body);
  try {
    const db = new DatabaseSync(copy, { readOnly: true });
    const row = db.prepare('SELECT login FROM users WHERE login = ?').get('bak_player');
    db.close();
    assert.equal(row.login, 'bak_player');
  } finally { fs.rmSync(copy, { force: true }); }

  // No DB path leaks into the headers.
  for (const [, value] of res.headers) assert.ok(!value.includes(srv.dataDir) && !value.includes('ggpoker.db'));
});

test('each download writes a backup audit row with the file size', async () => {
  const before = backupRows().length;
  const res = await download(adminToken);
  const body = Buffer.from(await res.arrayBuffer());
  const rows = backupRows();
  assert.equal(rows.length, before + 1);
  const last = rows.at(-1);
  assert.equal(last.actor, 'admin');
  assert.match(last.detail, /^dangg-backup-\d{8}-\d{6}\.db \d+ bytes$/);
  assert.equal(Number(last.detail.split(' ')[1]), body.length);
  assert.ok(!last.detail.includes(srv.dataDir));
});

test('the temp snapshot is removed after the response', async () => {
  const res = await download(adminToken);
  await res.arrayBuffer();
  // Cleanup runs in `finally` right after the stream ends; allow a beat for it.
  for (let i = 0; i < 50 && tempEntries().length; i += 1) await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(tempEntries(), []);
});

test('other methods are 405 for an admin and still 401 anonymously', async () => {
  assert.equal((await srv.post('/api/admin/backup', { token: adminToken })).status, 405);
  assert.equal((await srv.post('/api/admin/backup')).status, 401);
  assert.deepEqual(tempEntries(), []);
});

test('client backupFilenameFrom keeps only a well-formed backup name', () => {
  assert.equal(backupFilenameFrom('attachment; filename="dangg-backup-20261112-071500.db"'), 'dangg-backup-20261112-071500.db');
  assert.equal(backupFilenameFrom('attachment; filename="../../etc/passwd"'), 'dangg-backup.db');
  assert.equal(backupFilenameFrom(null), 'dangg-backup.db');
});
