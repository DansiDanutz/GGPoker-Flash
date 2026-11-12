// Admin database restore, queued and applied on the next server start (no hot swap).
// POST /api/admin/restore validates an uploaded SQLite file and stages it as
// <DATA_DIR>/restore-pending.db. `applyPendingRestore` runs in db.js before the live
// database is opened: it keeps the current DB as ggpoker.db.pre-restore-<UTC stamp>
// and moves the pending file into place. The live DB is never touched by the request.
// This module must not import db.js: db.js imports it before the DB exists.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export const ROUTE = '/api/admin/restore';
export const CONFIRM_WORD = 'RESTORE';
export const MAX_RESTORE_BYTES = 6 * 1024 * 1024;
export const PENDING_NAME = 'restore-pending.db';
export const DB_NAME = 'ggpoker.db';
export const REQUIRED_TABLES = Object.freeze(['users', 'hands', 'tables']);
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'latin1');
const SIDECARS = Object.freeze(['-wal', '-shm', '-journal']);
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
// Largest JSON body we read: base64 of MAX_RESTORE_BYTES plus room for the envelope.
const MAX_BODY_BYTES = Math.ceil(MAX_RESTORE_BYTES / 3) * 4 + 4096;

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** `YYYYMMDD-HHMMSS` in UTC. */
export function utcStamp(date = new Date()) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
    + `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

class RestoreError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const removeWithSidecars = (file) => {
  for (const suffix of ['', ...SIDECARS]) fs.rmSync(file + suffix, { force: true });
};

/**
 * Open `file` and check it is a usable DanGG database. Returns `{ ok: true }` or
 * `{ ok: false, reason }`. Never throws.
 */
export function checkDatabaseFile(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(SQLITE_MAGIC.length);
    try { fs.readSync(fd, head, 0, head.length, 0); } finally { fs.closeSync(fd); }
    if (!head.equals(SQLITE_MAGIC)) return { ok: false, reason: 'not a SQLite database' };
  } catch (err) {
    return { ok: false, reason: `unreadable: ${err.code || err.message}` };
  }
  let db = null;
  try {
    db = new DatabaseSync(file);
    const integrity = db.prepare('PRAGMA integrity_check').all().map((r) => Object.values(r)[0]);
    if (integrity.length !== 1 || integrity[0] !== 'ok') return { ok: false, reason: 'integrity check failed' };
    const names = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
    const missing = REQUIRED_TABLES.filter((t) => !names.has(t));
    if (missing.length) return { ok: false, reason: `missing tables: ${missing.join(', ')}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `cannot open: ${err.message}` };
  } finally {
    try { db?.close(); } catch { /* already closed */ }
  }
}

/** Decode and validate the request payload. Returns the decoded buffer or throws RestoreError. */
export function decodeRestorePayload(body) {
  if (!body || typeof body !== 'object') throw new RestoreError(400, 'Invalid JSON body');
  if (body.confirm !== CONFIRM_WORD) throw new RestoreError(400, `Type ${CONFIRM_WORD} to confirm`);
  if (typeof body.data !== 'string' || !body.data) throw new RestoreError(400, 'data must be a base64 string');
  const data = body.data.replace(/\s+/g, '');
  if (data.length % 4 !== 0 || !BASE64_RE.test(data)) throw new RestoreError(400, 'data is not valid base64');
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  if ((data.length / 4) * 3 - padding > MAX_RESTORE_BYTES) throw new RestoreError(413, 'Backup larger than 6 MB');
  const buf = Buffer.from(data, 'base64');
  if (buf.length < SQLITE_MAGIC.length || !buf.subarray(0, SQLITE_MAGIC.length).equals(SQLITE_MAGIC)) {
    throw new RestoreError(400, 'Not a SQLite database');
  }
  return buf;
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new RestoreError(413, 'Backup larger than 6 MB');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new RestoreError(400, 'Invalid JSON body'); }
}

/** Validate `buf` in a temp dir outside `dataDir`, then atomically stage it as the pending restore. */
export async function stagePendingRestore(buf, { dataDir, tempRoot = os.tmpdir() }) {
  const dir = await fsp.mkdtemp(path.join(tempRoot, 'dangg-restore-'));
  const temp = path.join(dir, 'upload.db');
  try {
    await fsp.writeFile(temp, buf);
    const check = checkDatabaseFile(temp);
    if (!check.ok) throw new RestoreError(400, `Invalid backup: ${check.reason}`);
    const staging = path.join(dataDir, `.${PENDING_NAME}.${randomBytes(6).toString('hex')}.tmp`);
    try {
      await fsp.writeFile(staging, buf, { flag: 'wx' });
      await fsp.rename(staging, path.join(dataDir, PENDING_NAME));
    } catch (err) {
      await fsp.rm(staging, { force: true });
      throw err;
    }
    return { size: buf.length };
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

/**
 * @param {{ db: any, json: Function, requireAdmin: Function, dataDir: string, tempRoot?: string, log?: Function }} deps
 */
export function createAdminRestoreRoute({ db, json, requireAdmin, dataDir, tempRoot, log = console.error }) {
  /** Handle POST /api/admin/restore. Returns false when the request is not for it. */
  return async function handle(req, res, url) {
    if (url.pathname !== ROUTE) return false;
    const admin = requireAdmin(req, res);
    if (!admin) return true;
    if (req.method !== 'POST') { json(res, 405, { error: 'method not allowed' }); return true; }
    try {
      const buf = decodeRestorePayload(await readJsonBody(req));
      const { size } = await stagePendingRestore(buf, { dataDir, tempRoot });
      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)')
        .run(admin.login, 'restore_queued', `${size} bytes; applies on next restart`);
      json(res, 200, { ok: true, requiresRestart: true });
    } catch (err) {
      if (err instanceof RestoreError) { json(res, err.status, { error: err.message }); return true; }
      log('[admin-restore] restore upload failed:', err?.message || err);
      json(res, 500, { error: 'Restore failed' });
    }
    return true;
  };
}

/**
 * Startup step, run BEFORE the live DB is opened. When a valid pending restore exists,
 * keep the current DB (and its -wal/-shm) as `<db>.pre-restore-<stamp>` and move the
 * pending file into place. An invalid pending file is logged and left alone.
 * @returns {{ applied: false, reason?: string } | { applied: true, backupName: string | null }}
 */
export function applyPendingRestore({ dataDir, now = () => new Date(), log = console.error }) {
  const pending = path.join(dataDir, PENDING_NAME);
  if (!fs.existsSync(pending)) return { applied: false };
  const check = checkDatabaseFile(pending);
  // Opening the file may leave sidecars behind; the pending file itself is kept as-is.
  for (const suffix of SIDECARS) fs.rmSync(pending + suffix, { force: true });
  if (!check.ok) {
    log(`[restore] ignoring ${PENDING_NAME}: ${check.reason}; live database left untouched`);
    return { applied: false, reason: check.reason };
  }
  const live = path.join(dataDir, DB_NAME);
  let backupName = null;
  if (fs.existsSync(live)) {
    backupName = uniqueBackupName(dataDir, utcStamp(now()));
    fs.renameSync(live, path.join(dataDir, backupName));
    for (const suffix of ['-wal', '-shm']) {
      if (fs.existsSync(live + suffix)) fs.renameSync(live + suffix, path.join(dataDir, backupName + suffix));
    }
  }
  removeWithSidecars(live);
  fs.renameSync(pending, live);
  log(`[restore] applied ${PENDING_NAME}${backupName ? `; previous database kept as ${backupName}` : ''}`);
  return { applied: true, backupName };
}

function uniqueBackupName(dataDir, stamp) {
  const base = `${DB_NAME}.pre-restore-${stamp}`;
  if (!fs.existsSync(path.join(dataDir, base))) return base;
  for (let i = 1; ; i += 1) {
    const name = `${base}-${i}`;
    if (!fs.existsSync(path.join(dataDir, name))) return name;
  }
}
