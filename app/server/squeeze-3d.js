// SPDX-License-Identifier: AGPL-3.0-only
export { SQUEEZE_3D_PRICES } from './organizer-billing.js';

function fail(message, status = 400, code = 'squeeze_3d_invalid') {
  throw Object.assign(new Error(message), { status, code });
}

export function squeezeTableEconomy(db, liveTables, tableId) {
  if (typeof tableId !== 'string' || !/^[\w-]{1,160}$/.test(tableId)) return { found: false, play_money: false };
  const tournamentId = liveTables.get(tableId)?.table?.cfg?.tournamentId;
  if (tournamentId) {
    const row = db.prepare('SELECT chip_economy FROM tournaments WHERE id=?').get(tournamentId);
    return row ? { found: true, play_money: row.chip_economy !== 1 } : { found: false, play_money: false };
  }
  const row = db.prepare('SELECT chip_economy FROM tables WHERE id=?').get(tableId);
  return row ? { found: true, play_money: row.chip_economy !== 1 } : { found: false, play_money: false };
}

export function createSqueeze3dRoutes({ db, billing, liveTables, json, requireUser, readBody }) {
  const root = '/api/marketplace/squeeze-3d';
  return async (req, res, url) => {
    if (!url.pathname.startsWith(root)) return false;
    try {
      const user = requireUser(req, res); if (!user) return true;
      if (url.pathname === `${root}/account`) {
        if (req.method !== 'GET') fail('Method not allowed.', 405);
        json(res, 200, billing.squeeze3dAccount(user.id)); return true;
      }
      if (url.pathname === `${root}/purchase`) {
        if (req.method !== 'POST') fail('Method not allowed.', 405);
        const body = await readBody(req);
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !['plan', 'idempotencyKey'].includes(key))) fail('Unexpected request field.');
        const purchase = billing.purchaseSqueeze3d({ userId: user.id, plan: body.plan, idempotencyKey: body.idempotencyKey });
        json(res, 200, { ...billing.squeeze3dAccount(user.id), purchase }); return true;
      }
      if (url.pathname === `${root}/access`) {
        if (req.method !== 'GET') fail('Method not allowed.', 405);
        const economy = squeezeTableEconomy(db, liveTables, url.searchParams.get('tableId'));
        const account = billing.squeeze3dAccount(user.id);
        const reason = !economy.found ? 'table_not_found' : economy.play_money ? 'play_money_preview' : account.entitlement.active ? 'entitled' : 'purchase_required';
        json(res, 200, { access: { allowed: reason === 'play_money_preview' || reason === 'entitled', reason, preview: reason === 'play_money_preview' }, entitlement: account.entitlement }); return true;
      }
      fail('Squeeze 3D route not found.', 404);
    } catch (error) {
      if (!error.status) throw error;
      json(res, error.status, { error: error.message, code: error.code }); return true;
    }
  };
}
