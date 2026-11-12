// Admin snapshots: bounded private copies of the live DB, listed, downloaded, deleted and restored by exact id.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './test-helpers.js';
import { CONTENT_TYPE } from './admin-backup.js';
import { PENDING_NAME } from './admin-restore.js';
import {
  DEFAULT_RETENTION, MAX_RETENTION, isSnapshotId, isValidRetention, parseRoute, retentionFrom,
} from './admin-snapshots.js';

const SQLITE_MAGIC = 'SQLite format 3\0';
const PRE_RESTORE_RE = /^ggpoker\.db\.pre-restore-\d{8}-\d{6}(-\d+)?$/;
const ID_RE = /^dangg-backup-\d{8}-\d{6}(-\d+)?\.db$/;
const MISSING_ID = 'dangg-backup-20200101-000000.db';
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let srv;
let tempRoot;
let adminToken;
let playerToken;
let firstId;

const liveDb = () => path.join(srv.dataDir, 'ggpoker.db');
const backupsDir = () => path.join(srv.dataDir, 'backups');
const snapshotFiles = () => (fs.existsSync(backupsDir()) ? fs.readdirSync(backupsDir()).sort() : []);
const query = (file, sql, ...params) => {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return db.prepare(sql).all(...params); } finally { db.close(); }
};
const hasUser = (file, login) => query(file, 'SELECT 1 FROM users WHERE login = ?', login).length === 1;
const auditRows = (action) => query(liveDb(), 'SELECT actor, detail FROM audit_log WHERE action = ? ORDER BY id', action);
const setRetention = (value) => srv.post('/api/admin/settings', { token: adminToken, body: { backup_retention: value } });
const create = () => srv.post('/api/admin/backups', { token: adminToken });
const listed = async () => (await srv.get('/api/admin/backups', { token: adminToken })).data.snapshots.map((s) => s.id);

before(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-snapshot-tmp-'));
  srv = await startServer({ env: { GGPOKER_BACKUP_TMP: tempRoot } });
  adminToken = await srv.login('admin', 'admin123');
  const reg = await srv.post('/api/auth/register', { body: { login: 'snap_player', nick: 'Snap Player', password: 'secret12' } });
  assert.equal(reg.status, 200, JSON.stringify(reg.data));
  playerToken = reg.data.token;
});
after(async () => {
  await srv?.stop();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('snapshot ids are exact backup filenames only', () => {
  assert.equal(isSnapshotId('dangg-backup-20261112-071500.db'), true);
  assert.equal(isSnapshotId('dangg-backup-20261112-071500-2.db'), true);
  const rejected = [
    '', 'ggpoker.db', '../ggpoker.db', '..%2Fggpoker.db', 'dangg-backup-20261112-071500.db/x',
    'dangg-backup-2026111-071500.db', 'DANGG-backup-20261112-071500.db', 'dangg-backup-20261112-071500.db.tmp',
  ];
  for (const id of rejected) assert.equal(isSnapshotId(id), false, id);
  assert.equal(isSnapshotId(undefined), false);
});

test('retention is a whole number from 1 to 50 and falls back to 10', () => {
  assert.equal(DEFAULT_RETENTION, 10);
  assert.equal(MAX_RETENTION, 50);
  assert.equal(retentionFrom(undefined), 10);
  for (const bad of ['3', 0, 51, 2.5, null]) assert.equal(retentionFrom(bad), 10, String(bad));
  assert.equal(retentionFrom(4), 4);
  assert.equal(isValidRetention(1), true);
  assert.equal(isValidRetention(50), true);
  assert.equal(isValidRetention(51), false);
});

test('routes map the list, one snapshot and its restore action', () => {
  assert.deepEqual(parseRoute('/api/admin/backups'), { id: null, restore: false });
  assert.deepEqual(parseRoute(`/api/admin/backups/${MISSING_ID}`), { id: MISSING_ID, restore: false });
  assert.deepEqual(parseRoute(`/api/admin/backups/${MISSING_ID}/restore`), { id: MISSING_ID, restore: true });
  assert.equal(parseRoute('/api/admin/backup'), null, 'the one-off download route is separate');
  assert.equal(parseRoute('/api/admin/backups/a/b/c'), null);
});

test('every snapshot route is 401 anonymously and 403 for a player, with no file made', async () => {
  const routes = [
    ['GET', '/api/admin/backups'], ['POST', '/api/admin/backups'],
    ['GET', `/api/admin/backups/${MISSING_ID}`], ['DELETE', `/api/admin/backups/${MISSING_ID}`],
    ['POST', `/api/admin/backups/${MISSING_ID}/restore`],
  ];
  const send = { GET: srv.get, POST: srv.post, DELETE: srv.del };
  for (const [method, route] of routes) {
    assert.equal((await send[method](route)).status, 401, `anonymous ${method} ${route}`);
    assert.equal((await send[method](route, { token: playerToken })).status, 403, `player ${method} ${route}`);
  }
  assert.deepEqual(snapshotFiles(), []);
  assert.equal(auditRows('snapshot_create').length, 0);
});

test('create writes a verified private snapshot and lists it', async () => {
  await srv.post('/api/auth/register', { body: { login: 'snap_before', nick: 'Snap Before', password: 'secret12' } });
  const res = await create();
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const { snapshot, pruned } = res.data;
  assert.match(snapshot.id, ID_RE);
  assert.equal(snapshot.integrity, 'ok');
  assert.deepEqual(pruned, []);
  firstId = snapshot.id;

  const file = path.join(backupsDir(), snapshot.id);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600, 'snapshot file is owner-only');
  assert.equal(fs.statSync(backupsDir()).mode & 0o777, 0o700, 'backups directory is owner-only');
  assert.equal(snapshot.size, fs.statSync(file).size);
  assert.deepEqual(snapshotFiles(), [snapshot.id], 'no temp file left behind');
  assert.equal(hasUser(file, 'snap_before'), true, 'snapshot holds the live data at creation');

  const list = await srv.get('/api/admin/backups', { token: adminToken });
  assert.equal(list.status, 200);
  assert.deepEqual(list.data.snapshots.map((s) => s.id), [snapshot.id]);
  assert.equal(list.data.snapshots[0].size, snapshot.size);
  assert.equal(list.data.retention, DEFAULT_RETENTION);
});

test('download returns the exact snapshot bytes as an attachment and is audited', async () => {
  const res = await fetch(`${srv.base}/api/admin/backups/${firstId}`, { headers: { authorization: `Bearer ${adminToken}` } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), CONTENT_TYPE);
  assert.equal(res.headers.get('content-disposition'), `attachment; filename="${firstId}"`);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = Buffer.from(await res.arrayBuffer());
  assert.ok(body.equals(fs.readFileSync(path.join(backupsDir(), firstId))));
  assert.equal(body.subarray(0, 16).toString('latin1'), SQLITE_MAGIC);
  for (const [, value] of res.headers) assert.ok(!value.includes(srv.dataDir), 'no data dir in headers');
  const rows = auditRows('snapshot_download');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor, 'admin');
  assert.match(rows[0].detail, new RegExp(`^${escapeRe(firstId)} \\d+ bytes$`));
});

test('ids are matched exactly: traversal, live DB names and unknown ids never reach a file', async () => {
  for (const bad of ['ggpoker.db', '..%2Fggpoker.db', 'dangg-backup-2026.db', `${firstId}.bak`]) {
    assert.equal((await srv.get(`/api/admin/backups/${bad}`, { token: adminToken })).status, 400, bad);
  }
  assert.equal((await srv.get(`/api/admin/backups/${MISSING_ID}`, { token: adminToken })).status, 404);
  assert.equal((await srv.del('/api/admin/backups/..%2Fggpoker.db', { token: adminToken })).status, 400);
  const restore = await srv.post('/api/admin/backups/ggpoker.db/restore', { token: adminToken, body: { confirm: 'RESTORE' } });
  assert.equal(restore.status, 400);
  assert.ok(fs.existsSync(liveDb()), 'live database untouched');
  assert.deepEqual(snapshotFiles(), [firstId]);
});

test('retention keeps the newest N snapshots and prunes the rest, including same-second names', async () => {
  assert.equal((await setRetention(2)).status, 200);
  const second = await create();
  const third = await create();
  assert.equal(second.status, 200);
  assert.equal(third.status, 200);
  assert.deepEqual(third.data.pruned, [firstId]);
  const ids = await listed();
  assert.deepEqual(ids, [third.data.snapshot.id, second.data.snapshot.id]);
  assert.deepEqual(snapshotFiles(), [...ids].sort());
  assert.equal(auditRows('snapshot_prune').length, 1);
  assert.equal((await srv.get('/api/admin/backups', { token: adminToken })).data.retention, 2);
});

test('an invalid retention setting is refused', async () => {
  for (const bad of [0, 51, '5', 1.5]) {
    const res = await setRetention(bad);
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.match(res.data.error, /backup_retention must be a whole number from 1 to 50/);
  }
});

test('delete removes exactly the named snapshot and is audited', async () => {
  const [keep, gone] = await listed();
  const res = await srv.del(`/api/admin/backups/${gone}`, { token: adminToken });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(res.data, { ok: true, deleted: gone });
  assert.deepEqual(await listed(), [keep]);
  assert.deepEqual(snapshotFiles(), [keep]);
  assert.equal((await srv.del(`/api/admin/backups/${gone}`, { token: adminToken })).status, 404);
  const rows = auditRows('snapshot_delete');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].detail, gone);
});

test('restore from snapshot queues the shared pending restore and leaves the live DB alone', async () => {
  await srv.post('/api/auth/register', { body: { login: 'snap_after', nick: 'Snap After', password: 'secret12' } });
  const [target] = await listed();
  const wrong = await srv.post(`/api/admin/backups/${target}/restore`, { token: adminToken, body: { confirm: 'restore' } });
  assert.equal(wrong.status, 400);
  assert.equal(fs.existsSync(path.join(srv.dataDir, PENDING_NAME)), false);

  const res = await srv.post(`/api/admin/backups/${target}/restore`, { token: adminToken, body: { confirm: 'RESTORE' } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(res.data, { ok: true, requiresRestart: true, snapshot: target });

  const pending = path.join(srv.dataDir, PENDING_NAME);
  assert.ok(fs.readFileSync(pending).equals(fs.readFileSync(path.join(backupsDir(), target))), 'pending file is the snapshot');
  assert.equal(hasUser(liveDb(), 'snap_after'), true, 'live DB not swapped while running');
  assert.deepEqual(await listed(), [target], 'the snapshot itself is kept');
  const rows = auditRows('restore_queued');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor, 'admin');
  assert.match(rows[0].detail, new RegExp(`^snapshot ${escapeRe(target)}; \\d+ bytes; applies on next restart$`));
});

test('restart applies the queued snapshot and keeps the previous database as a rescue copy', async () => {
  const dataDir = srv.dataDir;
  await srv.stop();
  srv = await startServer({ dataDir, env: { GGPOKER_BACKUP_TMP: tempRoot } });
  adminToken = await srv.login('admin', 'admin123');

  assert.equal(fs.existsSync(path.join(dataDir, PENDING_NAME)), false, 'pending file consumed');
  assert.equal(hasUser(liveDb(), 'snap_before'), true, 'snapshot data is live');
  assert.equal(hasUser(liveDb(), 'snap_after'), false, 'post-snapshot data is gone from the live DB');
  const rescue = fs.readdirSync(dataDir).filter((f) => PRE_RESTORE_RE.test(f));
  assert.equal(rescue.length, 1, fs.readdirSync(dataDir).join(','));
  assert.equal(hasUser(path.join(dataDir, rescue[0]), 'snap_after'), true, 'rescue copy holds the pre-restore data');
  assert.equal(auditRows('restore_applied').length, 1);
  assert.equal((await srv.get('/api/admin/backups', { token: adminToken })).status, 200);
});

test('overlapping creates each get their own id and the retention still holds', async () => {
  const [a, b] = await Promise.all([create(), create()]);
  assert.equal(a.status, 200, JSON.stringify(a.data));
  assert.equal(b.status, 200, JSON.stringify(b.data));
  assert.notEqual(a.data.snapshot.id, b.data.snapshot.id);
  const ids = await listed();
  assert.equal(ids.length, 2);
  assert.ok(ids.includes(a.data.snapshot.id) && ids.includes(b.data.snapshot.id));
});
