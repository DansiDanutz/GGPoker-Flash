// SPDX-License-Identifier: AGPL-3.0-only
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) fail('Unexpected request field.');
  return body;
}

export function createOrganizerFundingRoutes({ db, funding, providers, mode, requireUser, readBody, json, limiter }) {
  const pending = new Set();
  return async (req, res, url) => {
    const base = '/api/marketplace/chips/funding';
    if (url.pathname !== base && !url.pathname.startsWith(base + '/')) return false;
    const user = requireUser(req, res); if (!user) return true;
    if (url.pathname === base && req.method === 'GET') {
      json(res, 200, { requests: funding.list(user.id), enabled: mode === 'enforce' }); return true;
    }
    if (req.method !== 'POST') fail('Method not allowed.', 405);
    if (mode !== 'enforce') fail('Organizer Cash Chips are not active.', 409);
    if (limiter) {
      if (limiter.isBlocked(user.id)) fail('Too many requests. Try again shortly.', 429);
      limiter.record(user.id);
    }
    if (url.pathname === base) {
      const body = fields(await readBody(req), ['organizerId', 'amount', 'key']);
      json(res, 200, funding.create({ ...body, userId: user.id })); return true;
    }
    const match = url.pathname.slice(base.length).match(/^\/([^/]+)\/(credit|offer|reject|verify|cancel)$/);
    if (!match) fail('Request not found.', 404);
    let id;
    try { id = decodeURIComponent(match[1]); } catch { fail('Invalid request identifier.'); }
    const action = match[2];
    if (pending.has(id)) fail('This funding request is being updated. Retry shortly.',409);
    pending.add(id);
    try {
    const row = funding.get(user.id, id);
    if (!row) fail('Request not found.', 404);
    const body = fields(await readBody(req), action === 'offer' ? ['feeCents'] : action === 'verify' ? ['paymentId'] : []);
    if (action === 'cancel') {
      if (row.organizerId !== user.id) fail('Only the owning organizer may cancel.',403);
      if (row.state === 'rejected') { json(res,200,funding.cancel({userId:user.id,id})); return true; }
      if (row.state !== 'offered') fail('Only unpaid offers can be cancelled.',409);
      await providers.forOrganizer(row.organizerId).cancelLink(row, db);
      json(res,200,funding.cancel({userId:user.id,id,providerCleared:true})); return true;
    }
    if (action === 'credit' || action === 'reject') {
      json(res, 200, funding[action]({ userId: user.id, id })); return true;
    }
    if (action === 'offer' && row.organizerId !== user.id) fail('Only the owning organizer may offer a price.', 403);
    const provider = providers.forOrganizer(row.organizerId);
    if (!await provider.ready()) fail('This organizer has not connected a verified NervixPay merchant. Ask the operator to configure the connection.', 503);
    if (action === 'offer') {
      const reserved = funding.offer({ userId: user.id, id, feeCents: body.feeCents });
      const paymentLinkId = await provider.linkForRequest(db, reserved);
      json(res, 200, funding.attachLink({ userId: user.id, id, paymentLinkId }));
    } else {
      const payment = await provider.payment(body.paymentId);
      json(res, 200, funding.settle({ userId: user.id, id, payment }));
    }
    return true;
    } finally { pending.delete(id); }
  };
}
