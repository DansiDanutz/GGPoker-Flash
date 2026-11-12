// Admin table duplicate: POST /api/admin/tables/duplicate { id } copies a cash table's settings to a new
// table with a fresh id and a "(copy)" name. The copy starts disabled so nobody can sit at it until an
// admin enables it. The source row is never modified. Admin-only; the /api/admin network gate runs first.
export const ROUTE = '/api/admin/tables/duplicate';
export const COPY_SUFFIX = '-copy';
export const COPY_NAME_SUFFIX = ' (copy)';
export const MAX_ID_LENGTH = 60;

/**
 * The first free id derived from `sourceId`: `<source>-copy`, then `<source>-copy-2`, and so on.
 * The source part is trimmed so every candidate fits MAX_ID_LENGTH.
 * @param {string} sourceId
 * @param {(candidate: string) => boolean} isTaken
 */
export function copyId(sourceId, isTaken) {
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? COPY_SUFFIX : `${COPY_SUFFIX}-${n}`;
    const candidate = `${sourceId.slice(0, MAX_ID_LENGTH - suffix.length)}${suffix}`;
    if (!isTaken(candidate)) return candidate;
  }
}

/**
 * @param {{ db: any, json: (res: any, code: number, body: object) => void, requireAdmin: Function, readBody: (req: any) => Promise<any> }} deps
 */
export function createAdminTableDuplicateRoute({ db, json, requireAdmin, readBody }) {
  const selectTable = db.prepare('SELECT * FROM tables WHERE id = ?');
  const idTaken = (candidate) => Boolean(db.prepare('SELECT 1 FROM tables WHERE id = ?').get(candidate));

  /** Handle POST /api/admin/tables/duplicate. Returns false when the request is not for it. */
  return async function handle(req, res, url) {
    if (url.pathname !== ROUTE) return false;
    const admin = requireAdmin(req, res);
    if (!admin) return true;
    if (req.method !== 'POST') { json(res, 405, { error: 'method not allowed' }); return true; }
    const body = await readBody(req);
    const sourceId = typeof body?.id === 'string' ? body.id : '';
    if (!sourceId) { json(res, 400, { error: 'table id required' }); return true; }
    const source = selectTable.get(sourceId);
    if (!source) { json(res, 404, { error: 'table not found' }); return true; }

    const copy = { ...source, id: copyId(sourceId, idTaken), name: `${source.name}${COPY_NAME_SUFFIX}`, enabled: 0 };
    const columns = Object.keys(copy);
    db.prepare(`INSERT INTO tables (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
      .run(...columns.map((column) => copy[column]));
    db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)')
      .run(admin.login, 'duplicate_table', `${sourceId} -> ${copy.id}`);
    json(res, 200, { ok: true, id: copy.id, name: copy.name });
    return true;
  };
}
