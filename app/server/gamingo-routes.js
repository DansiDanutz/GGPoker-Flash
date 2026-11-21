// SPDX-License-Identifier: AGPL-3.0-only
const ROOT = '/api/marketplace/gamingo';

export function createGamingoRoutes({ gamingo, catalogOwner, catalogProvider, requireUser, readBody, json }) {
  return async (req, res, url) => {
    const path = url.pathname;
    if (path !== ROOT && !path.startsWith(`${ROOT}/`)) return false;
    try {
      if (path === ROOT && req.method === 'GET') {
        json(res, 200, gamingo.model()); return true;
      }
      const user = requireUser(req, res); if (!user) return true;
      if (path === `${ROOT}/catalog`) {
        res.setHeader('Cache-Control', 'private, no-store');
        if (req.method !== 'GET') { json(res, 405, { error: 'Catalog is read-only.' }); return true; }
        if (String(user.id) !== catalogOwner) { json(res, 403, { error: 'No sandbox catalog is assigned to this account.' }); return true; }
        if (!gamingo.readiness(user.id).organizer_membership_active) {
          json(res, 403, { error: 'Active organizer membership required.' }); return true;
        }
        const { games } = await catalogProvider().games();
        json(res, 200, { games: games.map(({ game_id, title, enabled, maintenance }) => {
          if (typeof game_id !== 'string' || typeof title !== 'string') throw new Error('Invalid catalog entry.');
          return { id: game_id, title, available: enabled === true && maintenance === false };
        }) });
        return true;
      }
      if (path === `${ROOT}/me` && req.method === 'GET') {
        // Always use the authenticated organizer. Query/body IDs cannot select
        // another tenant or expose credentials, agreement references or balances.
        json(res, 200, gamingo.readiness(user.id)); return true;
      }
      if (path === `${ROOT}/sessions` && req.method === 'POST') {
        const body = await readBody(req);
        if (!body || typeof body !== 'object' || Array.isArray(body)
          || Object.keys(body).some(key => key !== 'gameId')
          || typeof body.gameId !== 'string' || !/^[a-zA-Z0-9_.-]{1,100}$/.test(body.gameId)) {
          json(res, 400, { error: 'Expected a gameId only.', code: 'gamingo_invalid' }); return true;
        }
        const status = gamingo.readiness(user.id);
        json(res, 503, { error: 'Gamingo integration is pending. No game session was opened.',
          code: 'gamingo_integration_pending', product_id: status.product_id, blockers: status.blockers }); return true;
      }
      const known = path === ROOT || path === `${ROOT}/me` || path === `${ROOT}/sessions`;
      json(res, known ? 405 : 404, { error: known ? 'Method not allowed.' : 'Gamingo route not found.' }); return true;
    } catch (error) {
      if (!error.status) throw error;
      json(res, error.status, { error: error.message, code: error.code }); return true;
    }
  };
}
