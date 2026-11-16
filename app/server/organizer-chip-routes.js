// SPDX-License-Identifier: AGPL-3.0-only
import { MEMBERSHIP_CHIPS, PACK_CENTS, PACK_CHIPS } from './organizer-chips.js';

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !allowed.includes(key))) fail('Unexpected request field.');
  return body;
}

export function createOrganizerChipRoutes({ db, chips, events, spin, billing, json, requireUser, requireAdmin, readBody, mode, prepareSpin, onEventResolved }) {
  return async (req, res, url) => {
    const path = url.pathname;
    const adminMatch = path.match(/^\/api\/admin\/marketplace\/chips\/buybacks\/([^/]+)\/resolve$/);
    if (adminMatch) {
      const admin = requireAdmin(req, res); if (!admin) return true;
      if (req.method !== 'POST') fail('Method not allowed.', 405);
      const body = fields(await readBody(req), ['resolution', 'reason']);
      json(res, 200, events.resolveBuyback({ adminId: admin.id, buybackId: decodeURIComponent(adminMatch[1]), ...body })); return true;
    }
    const eventMatch = path.match(/^\/api\/admin\/marketplace\/chips\/tournaments\/([^/]+)(?:\/(resolve))?$/);
    if (eventMatch) {
      const admin = requireAdmin(req, res); if (!admin) return true;
      const tournamentId = decodeURIComponent(eventMatch[1]);
      const event = db.prepare('SELECT * FROM tournaments WHERE id=? AND chip_economy=1').get(tournamentId);
      if (!event) fail('Cash Chip event not found.', 404);
      if (req.method === 'GET' && !eventMatch[2]) {
        json(res, 200, { event,
          escrow: db.prepare('SELECT account_key,balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key IN (?,?)').all(event.owner_id, `event:${tournamentId}`, `event:${tournamentId}-bounty`),
          tickets: db.prepare('SELECT * FROM organizer_chip_tickets WHERE tournament_id=?').all(tournamentId),
          journal: db.prepare('SELECT * FROM organizer_chip_journals WHERE organizer_id=? AND from_account IN (?,?) ORDER BY id').all(event.owner_id, `event:${tournamentId}`, `event:${tournamentId}-bounty`) }); return true;
      }
      if (req.method !== 'POST' || !eventMatch[2]) fail('Method not allowed.', 405);
      const body = fields(await readBody(req), ['awards', 'reason']);
      const result = events.resolveEvent({ adminId: admin.id, tournamentId, ...body });
      onEventResolved?.(tournamentId);
      json(res, 200, result); return true;
    }
    const recoveryMatch = path.match(/^\/api\/admin\/marketplace\/chips\/spin\/([^/]+)(?:\/(resolve))?$/);
    if (recoveryMatch) {
      const admin = requireAdmin(req, res); if (!admin) return true;
      const roundId = decodeURIComponent(recoveryMatch[1]);
      const round = db.prepare('SELECT * FROM organizer_chip_spin_rounds WHERE id=?').get(roundId);
      if (!round) fail('Spin round not found.', 404);
      const participants = db.prepare('SELECT * FROM organizer_chip_spin_players WHERE round_id=?').all(roundId);
      if (req.method === 'GET' && !recoveryMatch[2]) { json(res, 200, { round, participants }); return true; }
      if (req.method !== 'POST' || !recoveryMatch[2]) fail('Method not allowed.', 405);
      const body = fields(await readBody(req), ['userId', 'place', 'reason']);
      if (typeof body.reason !== 'string' || body.reason.trim().length < 8 || body.reason.length > 2000) fail('Document the verified finishing place and supporting evidence.');
      if (!['disputed', 'complete'].includes(round.state)) fail('Only a recovered disputed round can be resolved.', 409);
      if (!Number.isSafeInteger(body.place) || body.place < 1 || body.place > 3) fail('Invalid finishing place.');
      const player = participants.find((p) => p.user_id === body.userId);
      if (!player) fail('Participant not found.', 404);
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = spin.payPlace({ tableId: round.table_id, userId: player.user_id, sessionId: player.session_id, place: body.place, amount: JSON.parse(round.outcome).prizes[body.place - 1] });
        if (result.applied) db.prepare('INSERT INTO audit_log(actor,action,detail) VALUES (?,?,?)').run(String(admin.id), 'organizer_spin_resolved', JSON.stringify({ roundId, ...body }));
        db.exec('COMMIT'); json(res, 200, result); return true;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    }
    if (!path.startsWith('/api/marketplace/chips')) return false;
    if (path === '/api/marketplace/chips' && req.method === 'GET') {
      json(res, 200, { mode, pack: { service_cents: PACK_CENTS, chips: PACK_CHIPS }, membership_grant: MEMBERSHIP_CHIPS, satellite_supported: false, tournaments: events.eligibleTournaments() }); return true;
    }
    const user = requireUser(req, res); if (!user) return true;
    if (path === '/api/marketplace/chips/me' && req.method === 'GET') {
      json(res, 200, { mode, service_billing: billing.account(user.id), balances: chips.account(user.id), ...(db ? {
        organizer_supply: chips.supply(user.id), grants: db.prepare('SELECT reference,available_at,status FROM organizer_chip_grants WHERE organizer_id=? ORDER BY available_at DESC LIMIT 100').all(user.id),
        tables: db.prepare("SELECT id,name,game,min_buyin FROM tables WHERE owner_id=? AND chip_economy=1 AND game='spingold'").all(user.id).map((t) => ({ ...t, activeRound: spin.currentRound(t.id), maximumReserve: t.min_buyin * 20000 }))
      } : {}), ...events.list(user.id), tournaments: events.eligibleTournaments(user.id) }); return true;
    }
    if (req.method !== 'POST') fail('Method not allowed.', 405);
    if (mode !== 'enforce') fail('Organizer Cash Chips are not active on this installation.', 409);
    const spinMatch = path.match(/^\/api\/marketplace\/chips\/spin\/([^/]+)\/(start|cancel)$/);
    if (spinMatch) {
      fields(await readBody(req), []);
      const tableId = decodeURIComponent(spinMatch[1]);
      const table = db.prepare("SELECT * FROM tables WHERE id=? AND owner_id=? AND private=1 AND chip_economy=1 AND game='spingold'").get(tableId, user.id);
      if (!table) fail('Owned Cash Chip Spin table not found.', 404);
      const active = spin.currentRound(tableId);
      if (spinMatch[2] === 'cancel' && active && active.state !== 'waiting') fail('Only a waiting reserve can be cancelled.', 409);
      prepareSpin(tableId, spinMatch[2] === 'cancel');
      json(res, 200, spinMatch[2] === 'start' ? spin.reserveRound({ organizerId: user.id, tableId, stake: table.min_buyin }) : spin.abortRound(tableId)); return true;
    }
    if (path === '/api/marketplace/chips/purchase') {
      const body = fields(await readBody(req), ['packs', 'key']); json(res, 200, chips.purchase({ organizerId: user.id, packs: body.packs, idempotencyKey: body.key })); return true;
    }
    if (path === '/api/marketplace/chips/transfer') {
      const body = fields(await readBody(req), ['organizerId', 'toUserId', 'amount', 'key']); json(res, 200, chips.transfer({ organizerId: body.organizerId, fromUserId: user.id, toUserId: body.toUserId, amount: body.amount, idempotencyKey: body.key })); return true;
    }
    if (path === '/api/marketplace/chips/tickets') {
      const body = fields(await readBody(req), ['tournamentId', 'key']); json(res, 200, events.issueTicket({ userId: user.id, tournamentId: body.tournamentId, idempotencyKey: body.key })); return true;
    }
    let match = path.match(/^\/api\/marketplace\/chips\/tickets\/([^/]+)\/(transfer|redeem|unregister)$/);
    if (match) {
      const ticketId = decodeURIComponent(match[1]);
      if (match[2] === 'transfer') {
        const body = fields(await readBody(req), ['toUserId', 'key']); json(res, 200, events.transferTicket({ userId: user.id, ticketId, toUserId: body.toUserId, idempotencyKey: body.key })); return true;
      }
      fields(await readBody(req), []); json(res, 200, (match[2] === 'unregister' ? events.unregisterTicket : events.redeemTicket)({ userId: user.id, ticketId })); return true;
    }
    if (path === '/api/marketplace/chips/buybacks') {
      const body = fields(await readBody(req), ['organizerId', 'amount', 'paymentAmount', 'paymentCurrency', 'paymentDetails', 'key']);
      json(res, 200, events.requestBuyback({ userId: user.id, organizerId: body.organizerId, amount: body.amount, paymentAmount: body.paymentAmount, paymentCurrency: body.paymentCurrency, paymentDetails: body.paymentDetails, idempotencyKey: body.key })); return true;
    }
    match = path.match(/^\/api\/marketplace\/chips\/buybacks\/([^/]+)\/(report|confirm|cancel|reject)$/);
    if (match) {
      const buybackId = decodeURIComponent(match[1]), operation = match[2];
      if (operation === 'report') {
        const body = fields(await readBody(req), ['receipt', 'paymentAmount', 'paymentCurrency', 'paymentNetwork', 'paymentDetails']);
        json(res, 200, events.reportBuyback({ userId: user.id, buybackId, receipt: body.receipt, paymentAmount: body.paymentAmount, paymentCurrency: body.paymentCurrency, paymentNetwork: body.paymentNetwork, paymentDetails: body.paymentDetails })); return true;
      }
      fields(await readBody(req), []);
      const action = operation === 'confirm' ? events.confirmBuyback : operation === 'cancel' ? events.cancelBuyback : events.rejectBuyback;
      json(res, 200, action({ userId: user.id, buybackId })); return true;
    }
    fail('Cash Chip route not found.', 404);
  };
}
