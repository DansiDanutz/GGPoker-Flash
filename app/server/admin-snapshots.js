// Admin snapshots: bounded, private, server-side copies of the live database.
//   GET    /api/admin/backups                  list, newest first, plus the retention count
//   POST   /api/admin/backups                  create (VACUUM INTO + integrity check), then prune
//   GET    /api/admin/backups/<id>             download one snapshot
//   DELETE /api/admin/backups/<id>             delete one snapshot
//   POST   /api/admin/backups/<id>/restore     queue a restore through admin-restore.js (applied on restart)
// Snapshots live in <DATA_DIR>/backups (directory 0700, files 0600). An id is the snapshot's filename and
// must match SNAPSHOT_RE exactly; nothing else is ever resolved to a path. Admin-only; the /api/admin
// network gate in index.js runs first.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { backupFilename, CONTENT_TYPE } from './admin-backup.js';
import { CONFIRM_WORD, checkDatabaseFile, queueRestore, RestoreError } from './admin-restore.js';

export const ROUTE = '/api/admin/backups';
export const BACKUP_DIR = 'backups';
export const RETENTION_SETTING = 'backup_retention';
export const DEFAULT_RETENTION = 10;
export const MAX_RETENTION = 50;
const SNAPSHOT_RE = /^dangg-backup-(\d{8}-\d{6})(?:-(\d{1,4}))?\.db$/;
const ITEM_RE = /^\/api\/admin\/backups\/([^/]+)(\/restore)?$/;

class SnapshotError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** True only for a name this module could have created, e.g. `dangg-backup-20261112-071500-2.db`. */
export const isSnapshotId = (id) => typeof id === 'string' && SNAPSHOT_RE.test(id);

/** `{ stamp, n }` for a valid id: the UTC stamp and the same-second sequence (the bare name is 1). */
export function parseSnapshotId(id) {
  const match = isSnapshotId(id) ? SNAPSHOT_RE.exec(id) : null;
  return match ? { stamp: match[1], n: match[2] ? Number(match[2]) : 1 } : null;
}

export const isValidRetention = (value) => Number.isInteger(value) && value >= 1 && value <= MAX_RETENTION;

/** The configured retention, or the default when the stored value is missing or out of range. */
export const retentionFrom = (value) => (isValidRetention(value) ? value : DEFAULT_RETENTION);

/** Map a URL path to `{ id, restore }`, or null when it is not a snapshot route. `id` null is the collection. */
export function parseRoute(pathname) {
  if (pathname === ROUTE) return { id: null, restore: false };
  const match = ITEM_RE.exec(pathname);
  return match ? { id: match[1], restore: Boolean(match[2]) } : null;
}

// Newest first: by UTC stamp, then by same-second sequence. File mtimes are not trusted for order.
const newestFirst = (a, b) => (a.stamp === b.stamp ? b.n - a.n : (a.stamp < b.stamp ? 1 : -1));

/** Snapshot records in `dir`, newest first. Anything that is not a regular file with a valid name is ignored. */
export async function listSnapshots(dir) {
  let names;
  try { names = await fsp.readdir(dir); } catch (err) { if (err.code === 'ENOENT') return []; throw err; }
  const entries = [];
  for (const name of names) {
    const parsed = parseSnapshotId(name);
    if (!parsed) continue;
    const stat = await fsp.lstat(path.join(dir, name));
    if (!stat.isFile()) continue;
    entries.push({ ...parsed, id: name, size: stat.size, createdAt: stat.mtime.toISOString() });
  }
  return entries.sort(newestFirst).map(({ id, size, createdAt }) => ({ id, size, createdAt }));
}

/**
 * The next free id for `stamp`: the bare name, or one past the highest sequence already present.
 * Sequences only grow, so a pruned name is never reused and sorts correctly against newer snapshots.
 */
export function nextSnapshotId(stamp, existingIds) {
  const sequences = existingIds.map(parseSnapshotId).filter((p) => p && p.stamp === stamp).map((p) => p.n);
  if (!sequences.length) return `dangg-backup-${stamp}.db`;
  return `dangg-backup-${stamp}-${Math.max(...sequences) + 1}.db`;
}

/** Run `task` after every earlier task queued here, so two creates never choose the same id. */
export function serialized() {
  let tail = Promise.resolve();
  return (task) => {
    const run = tail.then(task);
    tail = run.catch(() => {});
    return run;
  };
}

/**
 * @param {{
 *   db: any, json: Function, requireAdmin: Function, readBody: (req: any) => Promise<any>,
 *   dataDir: string, tempRoot?: string, getSetting: (key: string, fallback: any) => any,
 *   now?: () => Date, log?: Function,
 * }} deps
 */
export function createAdminSnapshotRoutes(deps) {
  const { db, json, requireAdmin, readBody, dataDir, tempRoot, getSetting, now = () => new Date(), log = console.error } = deps;
  const dir = path.join(dataDir, BACKUP_DIR);
  const audit = (actor, action, detail) => db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(actor, action, detail);
  const retention = () => retentionFrom(getSetting(RETENTION_SETTING, DEFAULT_RETENTION));
  const afterPriorCreates = serialized();

  /** The existing snapshot for `id`, or a 404. Only a regular file is ever returned. */
  async function snapshotFile(id) {
    if (!isSnapshotId(id)) throw new SnapshotError(400, 'Invalid snapshot ID');
    const file = path.join(dir, id);
    let stat;
    try { stat = await fsp.lstat(file); } catch (err) { if (err.code === 'ENOENT') throw new SnapshotError(404, 'Snapshot not found'); throw err; }
    if (!stat.isFile()) throw new SnapshotError(404, 'Snapshot not found');
    return { file, size: stat.size };
  }

  /** VACUUM INTO a private temp file, verify it, then rename it to its final id. Never leaves a partial snapshot. */
  async function writeSnapshot() {
    await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
    await fsp.chmod(dir, 0o700);
    const stamp = parseSnapshotId(backupFilename(now())).stamp;
    const id = nextSnapshotId(stamp, (await listSnapshots(dir)).map((s) => s.id));
    const temp = path.join(dir, `.${id}.${randomBytes(6).toString('hex')}.tmp`);
    try {
      db.prepare('VACUUM INTO ?').run(temp);
      await fsp.chmod(temp, 0o600);
      const check = checkDatabaseFile(temp);
      if (!check.ok) throw new SnapshotError(500, `Snapshot failed integrity check: ${check.reason}`);
      await fsp.rename(temp, path.join(dir, id));
      const { size } = await fsp.stat(path.join(dir, id));
      return { id, size, createdAt: now().toISOString(), integrity: 'ok' };
    } catch (err) {
      await fsp.rm(temp, { force: true });
      throw err;
    }
  }

  /** Delete every snapshot beyond the retention count, newest kept. `protectedId` is never removed. */
  async function prune(protectedId) {
    const doomed = (await listSnapshots(dir)).slice(retention()).filter((s) => s.id !== protectedId);
    for (const snapshot of doomed) await fsp.rm(path.join(dir, snapshot.id), { force: true });
    return doomed.map((s) => s.id);
  }

  async function createAndPrune(admin) {
    let snapshot;
    try {
      snapshot = await afterPriorCreates(writeSnapshot);
    } catch (err) {
      audit(admin.login, 'snapshot_failed', String(err?.message || err).slice(0, 200));
      throw err;
    }
    audit(admin.login, 'snapshot_create', `${snapshot.id} ${snapshot.size} bytes; integrity ${snapshot.integrity}`);
    const pruned = await prune(snapshot.id);
    if (pruned.length) audit(admin.login, 'snapshot_prune', pruned.join(', '));
    return { snapshot, pruned, retention: retention() };
  }

  async function download(res, admin, id) {
    const { file, size } = await snapshotFile(id);
    audit(admin.login, 'snapshot_download', `${id} ${size} bytes`);
    res.writeHead(200, {
      'content-type': CONTENT_TYPE,
      'content-length': String(size),
      'content-disposition': `attachment; filename="${id}"`,
      'cache-control': 'no-store',
    });
    try {
      await pipeline(fs.createReadStream(file), res);
    } catch (err) {
      log('[admin-snapshots] download failed:', err?.message || err);
      res.destroy();
    }
  }

  async function remove(res, admin, id) {
    const { file } = await snapshotFile(id);
    await fsp.rm(file);
    audit(admin.login, 'snapshot_delete', id);
    return json(res, 200, { ok: true, deleted: id });
  }

  async function restore(req, res, admin, id) {
    const body = await readBody(req);
    if (body?.confirm !== CONFIRM_WORD) throw new SnapshotError(400, `Type ${CONFIRM_WORD} to confirm`);
    const { file } = await snapshotFile(id);
    const buf = await fsp.readFile(file);
    await queueRestore({ db, dataDir, tempRoot, buf, actor: admin.login, source: `snapshot ${id}` });
    return json(res, 200, { ok: true, requiresRestart: true, snapshot: id });
  }

  async function dispatch(req, res, admin, { id, restore: restoring }) {
    if (id === null) {
      if (req.method === 'GET') return json(res, 200, { snapshots: await listSnapshots(dir), retention: retention() });
      if (req.method === 'POST') return json(res, 200, await createAndPrune(admin));
      return json(res, 405, { error: 'method not allowed' });
    }
    if (!isSnapshotId(id)) throw new SnapshotError(400, 'Invalid snapshot ID');
    if (restoring) return req.method === 'POST' ? restore(req, res, admin, id) : json(res, 405, { error: 'method not allowed' });
    if (req.method === 'GET') return download(res, admin, id);
    if (req.method === 'DELETE') return remove(res, admin, id);
    return json(res, 405, { error: 'method not allowed' });
  }

  /** Handle every /api/admin/backups route. Returns false when the request is not for one. */
  return async function handle(req, res, url) {
    const route = parseRoute(url.pathname);
    if (!route) return false;
    const admin = requireAdmin(req, res);
    if (!admin) return true;
    try {
      await dispatch(req, res, admin, route);
    } catch (err) {
      if (err instanceof SnapshotError || err instanceof RestoreError) { json(res, err.status, { error: err.message }); return true; }
      log('[admin-snapshots] request failed:', err?.message || err);
      if (!res.headersSent) json(res, 500, { error: 'Snapshot failed' });
      else res.destroy();
    }
    return true;
  };
}
