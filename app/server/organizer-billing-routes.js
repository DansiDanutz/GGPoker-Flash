// SPDX-License-Identifier: AGPL-3.0-only
import { ORGANIZER_TARIFFS } from './organizer-billing.js';

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !allowed.includes(key))) fail('Unexpected request field.');
  return body;
}

export function createOrganizerBillingRoutes({ db, billing, json, requireUser, requireAdmin, readBody, liveTables }) {
  db.exec(`CREATE TABLE IF NOT EXISTS organizer_spin_schedule (
    table_id TEXT PRIMARY KEY REFERENCES tables(id), start_at TEXT NOT NULL, started_at TEXT
  )`);
  const resources = (userId) => ({
    tables: db.prepare('SELECT id,name,game FROM tables WHERE private=1 AND owner_id=?').all(userId).map((row) => ({
      ...row, session: row.game === 'spingold' ? null : billing.cashSession(userId, row.id),
      schedule: db.prepare('SELECT start_at,started_at FROM organizer_spin_schedule WHERE table_id=?').get(row.id) || null,
    })),
    tournaments: db.prepare('SELECT id,name,start_at,status FROM tournaments WHERE private=1 AND owner_id=?').all(userId),
  });
  return async (req, res, url) => {
    const p = url.pathname;
    if (!p.startsWith('/api/marketplace/billing') && p !== '/api/admin/marketplace/billing/credits') return false;
    if (p === '/api/marketplace/billing' && req.method === 'GET') {
      json(res, 200, { mode: billing.mode, tariffs: ORGANIZER_TARIFFS, checkout_enabled: false }); return true;
    }
    if (p === '/api/admin/marketplace/billing/credits') {
      const actor = requireAdmin(req, res); if (!actor) return true;
      if (req.method !== 'POST') fail('Method not allowed.', 405);
      const b = fields(await readBody(req), ['userId', 'amountCents', 'reference']);
      json(res, 200, billing.credit({ ...b, actor: actor.id })); return true;
    }
    const user = requireUser(req, res); if (!user) return true;
    if (p === '/api/marketplace/billing/me' && req.method === 'GET') {
      json(res, 200, { ...billing.account(user.id), ledger: billing.history(user.id), ...resources(user.id) }); return true;
    }
    if (req.method !== 'POST') fail('Method not allowed.', 405);
    if (billing.mode !== 'enforce') fail('Service-credit billing is not active on this installation.', 409);
    if (p === '/api/marketplace/billing/subscribe') {
      const b = fields(await readBody(req), ['role', 'idempotencyKey']);
      json(res, 200, billing.subscribe({ ...b, userId: user.id })); return true;
    }
    const action = p.match(/^\/api\/marketplace\/billing\/(cash|spin|tournament)\/([^/]+)\/(start|stop|reschedule)$/);
    if (!action) fail('Billing route not found.', 404);
    const [, kind, encodedId, operation] = action;
    const id = decodeURIComponent(encodedId);
    const row = kind === 'tournament'
      ? db.prepare('SELECT * FROM tournaments WHERE id=? AND owner_id=? AND private=1').get(id, user.id)
      : db.prepare('SELECT * FROM tables WHERE id=? AND owner_id=? AND private=1').get(id, user.id);
    if (!row || (kind === 'spin' && row.game !== 'spingold') || (kind === 'cash' && row.game === 'spingold')) fail('Resource not found.', 404);
    const b = fields(await readBody(req), operation === 'reschedule' ? ['startAt', 'idempotencyKey'] : operation === 'start' ? ['idempotencyKey'] : []);
    if (kind === 'cash' && operation === 'start') {
      json(res, 200, billing.startCash({ userId: user.id, tableId: id, idempotencyKey: b.idempotencyKey })); return true;
    }
    if (kind === 'cash' && operation === 'stop') {
      json(res, 200, billing.stopCash({ userId: user.id, tableId: id })); return true;
    }
    if (kind === 'cash' || operation !== 'reschedule') fail('Unsupported billing operation.', 404);
    const time = typeof b.startAt === 'string' ? Date.parse(b.startAt) : NaN;
    if (!Number.isFinite(time) || time <= Date.now()) fail('Choose a future start time.');
    const startAt = new Date(time).toISOString();
    const schedule = kind === 'spin' ? db.prepare('SELECT * FROM organizer_spin_schedule WHERE table_id=?').get(id) : row;
    if (!schedule) fail('This legacy Spin table has no scheduled launch.', 409);
    const live = liveTables.get(id)?.table;
    if (kind === 'tournament' ? row.status !== 'registering' || Date.parse(row.start_at) <= Date.now()
      : schedule.started_at || Date.parse(schedule.start_at) <= Date.now() || live?.spinStarted() || live?.occupiedSeats().length) {
      fail('Only an unstarted event without Spin seats can be rescheduled.', 409);
    }
    if (schedule.start_at === startAt) { json(res, 200, { ok: true, unchanged: true }); return true; }
    const result = billing.reschedule({ userId: user.id, kind, resourceId: id, idempotencyKey: b.idempotencyKey, startAt,
      change: () => {
        if (kind === 'tournament') db.prepare('UPDATE tournaments SET start_at=? WHERE id=?').run(startAt, id);
        else db.prepare('UPDATE organizer_spin_schedule SET start_at=? WHERE table_id=?').run(startAt, id);
        return { id };
      } });
    json(res, 200, result); return true;
  };
}
