// Admin database backup: GET /api/admin/backup streams a consistent SQLite snapshot.
// The snapshot is made with VACUUM INTO a unique temp file outside the data dir and
// deleted once the response ends. The live database path is never sent to the client.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

export const ROUTE = '/api/admin/backup';
export const CONTENT_TYPE = 'application/vnd.sqlite3';
const TEMP_PREFIX = 'dangg-backup-';

const pad = (n) => String(n).padStart(2, '0');

/** `dangg-backup-YYYYMMDD-HHMMSS.db` in UTC. */
export function backupFilename(date = new Date()) {
  const day = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
  const time = `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
  return `dangg-backup-${day}-${time}.db`;
}

/** True when `child` is `parent` or sits inside it. */
export function isInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Resolve the temp root; refuse one inside the app data dir so a snapshot never lands next to the live DB. */
export function resolveTempRoot(dataDir, tempRoot = os.tmpdir()) {
  if (isInside(dataDir, tempRoot)) throw new Error('backup temp dir must be outside the data dir');
  return tempRoot;
}

/** Write a consistent snapshot of `db` to a fresh temp dir. Returns the file path and its directory. */
export async function createSnapshot(db, tempRoot) {
  const dir = await fsp.mkdtemp(path.join(tempRoot, TEMP_PREFIX));
  const file = path.join(dir, 'snapshot.db');
  try {
    db.prepare('VACUUM INTO ?').run(file);
    const { size } = await fsp.stat(file);
    return { dir, file, size };
  } catch (err) {
    await fsp.rm(dir, { recursive: true, force: true });
    throw err;
  }
}

/**
 * @param {{ db: any, json: Function, requireAdmin: Function, dataDir: string, tempRoot?: string, now?: () => Date, log?: Function }} deps
 */
export function createAdminBackupRoute({ db, json, requireAdmin, dataDir, tempRoot, now = () => new Date(), log = console.error }) {
  const root = resolveTempRoot(dataDir, tempRoot);
  /** Handle GET /api/admin/backup. Returns false when the request is not for it. */
  return async function handle(req, res, url) {
    if (url.pathname !== ROUTE) return false;
    const admin = requireAdmin(req, res);
    if (!admin) return true;
    if (req.method !== 'GET') { json(res, 405, { error: 'method not allowed' }); return true; }
    let snapshot = null;
    try {
      snapshot = await createSnapshot(db, root);
      const filename = backupFilename(now());
      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)')
        .run(admin.login, 'backup', `${filename} ${snapshot.size} bytes`);
      res.writeHead(200, {
        'content-type': CONTENT_TYPE,
        'content-length': String(snapshot.size),
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      });
      await pipeline(fs.createReadStream(snapshot.file), res);
    } catch (err) {
      log('[admin-backup] backup failed:', err?.message || err);
      if (!res.headersSent) json(res, 500, { error: 'Backup failed' });
      else res.destroy();
    } finally {
      if (snapshot) await fsp.rm(snapshot.dir, { recursive: true, force: true });
    }
    return true;
  };
}
