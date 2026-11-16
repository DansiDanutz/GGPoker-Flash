// SPDX-License-Identifier: AGPL-3.0-only
import { ORGANIZER_TARIFFS } from './organizer-billing.js';
import { cashRakeConfig, validateCashRake } from './cash-rake.js';

const MANUAL_FUNDING_LINKS = Object.freeze([
  { amount_cents: 900, url: 'https://nervixpay.live/l/b0afce77-773a-48a0-9a73-72274791313d' },
  { amount_cents: 1000, url: 'https://nervixpay.live/l/9aae5873-9e81-4ac0-be07-3b189ffded2f' },
]);

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !allowed.includes(key))) fail('Unexpected request field.');
  return body;
}

export function createOrganizerBillingRoutes({ db, billing, json, requireUser, requireAdmin, readBody, liveTables, getSetting, broadcastState }) {
  db.exec(`CREATE TABLE IF NOT EXISTS organizer_spin_schedule (
    table_id TEXT PRIMARY KEY REFERENCES tables(id), start_at TEXT NOT NULL, started_at TEXT
  )`);
  const resources = (userId) => ({
    tables: db.prepare('SELECT id,name,game,private,owner_id,chip_economy,rake_percent,rake_cap,min_buyin,seats FROM tables WHERE private=1 AND play_money=0 AND owner_id=?').all(userId).map((row) => ({
      ...row, session: row.game === 'spingold' ? null : billing.cashSession(userId, row.id),
      ...cashRakeConfig(row, getSetting),
      spinRound: row.game === 'spingold' ? db.prepare('SELECT id,state,max_reserve,outcome FROM organizer_chip_spin_rounds WHERE table_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').get(row.id) || null : null,
      occupied: liveTables.get(row.id)?.table?.occupiedSeats().length || 0,
      schedule: db.prepare('SELECT start_at,started_at FROM organizer_spin_schedule WHERE table_id=?').get(row.id) || null,
    })),
    tournaments: db.prepare('SELECT id,name,start_at,status,format,mode,buyin,fee,starting_stack,blind_speed,late_reg,max_players,entrants,bounty,chip_economy FROM tournaments WHERE private=1 AND play_money=0 AND owner_id=?').all(userId),
  });
  return async (req, res, url) => {
    const p = url.pathname;
    if (!p.startsWith('/api/marketplace/billing') && !p.startsWith('/api/admin/marketplace/billing/')) return false;
    if (p === '/api/marketplace/billing' && req.method === 'GET') {
      const manualFunding = billing.mode === 'enforce' && process.env.GGPOKER_NERVIXPAY_MANUAL_FUNDING === 'on';
      json(res, 200, {
        mode: billing.mode, chip_mode: process.env.GGPOKER_ORGANIZER_CHIPS === 'enforce' ? 'enforce' : 'off', tariffs: ORGANIZER_TARIFFS, checkout_enabled: false,
        manual_funding: manualFunding ? {
          enabled: true, merchant_display: 'Fake or Real', settlement_account_display: 'Seme',
          assets: ['USDC on Polygon', 'USDT on BNB Chain'], links: MANUAL_FUNDING_LINKS,
        } : { enabled: false, links: [] },
      }); return true;
    }
    if (p === '/api/admin/marketplace/billing/credits') {
      const actor = requireAdmin(req, res); if (!actor) return true;
      if (req.method !== 'POST') fail('Method not allowed.', 405);
      const b = fields(await readBody(req), ['userId', 'amountCents', 'reference']);
      json(res, 200, billing.credit({ ...b, actor: actor.id })); return true;
    }
    if (p.startsWith('/api/admin/marketplace/billing/')) {
      const actor = requireAdmin(req, res); if (!actor) return true;
      if (p === '/api/admin/marketplace/billing/refunds') {
        if (req.method === 'GET') { json(res, 200, { refunds: billing.listCreditRefunds() }); return true; }
        if (req.method !== 'POST') fail('Method not allowed.', 405);
        const b = fields(await readBody(req), ['userId', 'originalReference', 'amountCents', 'requestId', 'reason']);
        json(res, 200, billing.reserveCreditRefund({ ...b, actor: actor.id })); return true;
      }
      const refundAction = p.match(/^\/api\/admin\/marketplace\/billing\/refunds\/([^/]+)\/(paid|cancel)$/);
      if (!refundAction) fail('Billing route not found.', 404);
      if (req.method !== 'POST') fail('Method not allowed.', 405);
      const requestId = decodeURIComponent(refundAction[1]);
      const paid = refundAction[2] === 'paid';
      const b = fields(await readBody(req), paid ? ['externalReference'] : ['reason']);
      json(res, 200, paid ? billing.markCreditRefundPaid({ ...b, requestId, actor: actor.id })
        : billing.cancelCreditRefund({ ...b, requestId, actor: actor.id })); return true;
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
    const action = p.match(/^\/api\/marketplace\/billing\/(cash|spin|tournament)\/([^/]+)\/(start|stop|reschedule|rake)$/);
    if (!action) fail('Billing route not found.', 404);
    const [, kind, encodedId, operation] = action;
    const id = decodeURIComponent(encodedId);
    const b = fields(await readBody(req), operation === 'rake' ? ['rakePercent', 'rakeCap'] : operation === 'reschedule' ? ['startAt', 'idempotencyKey'] : operation === 'start' ? ['idempotencyKey'] : []);
    const row = kind === 'tournament'
      ? db.prepare('SELECT * FROM tournaments WHERE id=? AND owner_id=? AND private=1').get(id, user.id)
      : db.prepare('SELECT * FROM tables WHERE id=? AND owner_id=? AND private=1').get(id, user.id);
    if (!row || (kind === 'spin' && row.game !== 'spingold') || (kind === 'cash' && row.game === 'spingold')) fail('Resource not found.', 404);
    if (row.play_money) fail('Play Money resources do not use service-credit billing.', 409);
    if (operation === 'rake') {
      if (kind !== 'cash' || !row.chip_economy) fail('Organizer Cash Chip table required.', 404);
      billing.requireMembership(user.id, 'organizer');
      const rake = validateCashRake(b), live = liveTables.get(id)?.table;
      if (billing.cashSession(user.id, id)?.active || live?.occupiedSeats().length || live?.handInProgress() || live?.reservations.size || live?.financialError
        || db.prepare("SELECT 1 FROM organizer_chip_sessions WHERE table_id=? AND status='open'").get(id)) {
        fail('Pause the table, cash out all players and clear seat reservations before changing rake.', 409);
      }
      if (row.rake_percent !== rake.rakePercent || row.rake_cap !== rake.rakeCap) {
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare('UPDATE tables SET rake_percent=?,rake_cap=? WHERE id=?').run(rake.rakePercent, rake.rakeCap, id);
          db.prepare('INSERT INTO audit_log(actor,action,detail) VALUES (?,?,?)').run(user.login, 'organizer_cash_rake', JSON.stringify({ tableId: id, ...rake }));
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      }
      if (live) { Object.assign(live.cfg, rake); Object.assign(live, rake); broadcastState(live); }
      json(res, 200, { ok: true, ...rake }); return true;
    }
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
