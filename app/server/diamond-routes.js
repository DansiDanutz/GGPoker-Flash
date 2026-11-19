function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function fields(body, allowed) { if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) fail('Unexpected request field.'); return body; }

export function createDiamondRoutes({ diamonds, json, requireUser, readBody }) {
  return async (req, res, url) => {
    const path = url.pathname;
    if (!path.startsWith('/api/marketplace/diamonds')) return false;
    if (path === '/api/marketplace/diamonds' && req.method === 'GET') { json(res, 200, diamonds.catalog()); return true; }
    const user = requireUser(req, res); if (!user) return true;
    if (path === '/api/marketplace/diamonds/me' && req.method === 'GET') { json(res, 200, diamonds.list(user.id)); return true; }
    if (req.method !== 'POST') fail('Method not allowed.', 405);
    if (path === '/api/marketplace/diamonds/offers') { const body = fields(await readBody(req), ['priceCashChips']); json(res, 200, diamonds.offer({ userId: user.id, ...body })); return true; }
    if (path === '/api/marketplace/diamonds/requests') { const body = fields(await readBody(req), ['organizerId', 'quantity', 'priceCashChips', 'key']); json(res, 200, diamonds.request({ userId: user.id, ...body })); return true; }
    const match = path.match(/^\/api\/marketplace\/diamonds\/requests\/([^/]+)\/(approve|reject|cancel)$/);
    if (match) { fields(await readBody(req), []); json(res, 200, diamonds[match[2]]({ userId: user.id, id: decodeURIComponent(match[1]) })); return true; }
    fail('Diamond route not found.', 404);
  };
}
