// SPDX-License-Identifier: AGPL-3.0-only
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) fail('Unexpected request field.');
  return body;
}

export function createOrganizerSessionCreditRoutes({ db, sessionCredit, providers, mode, requireUser, readBody, json, limiter }) {
  return async (req, res, url) => {
    const base = '/api/marketplace/chips/session-credit';
    if (url.pathname !== base && !url.pathname.startsWith(base + '/')) return false;
    const user = requireUser(req, res); if (!user) return true;
    if (url.pathname === base && req.method === 'GET') {
      json(res, 200, { sessions:sessionCredit.list(user.id), enabled:mode === 'enforce' }); return true;
    }
    if (req.method !== 'POST') fail('Method not allowed.', 405);
    if (mode !== 'enforce') fail('Organizer session credit is not active.', 409);
    if (limiter) {
      if (limiter.isBlocked(user.id)) fail('Too many requests. Try again shortly.', 429);
      limiter.record(user.id);
    }
    if (url.pathname === base) {
      const body = fields(await readBody(req), ['fundingRequestId', 'feeCents']);
      json(res, 200, sessionCredit.propose({ userId:user.id, fundingRequestId:body.fundingRequestId, feeCents:body.feeCents })); return true;
    }
    const match = url.pathname.slice(base.length).match(/^\/([^/]+)\/(accept|decline|finish|link|verify)$/);
    if (!match) fail('Session credit not found.', 404);
    let id;
    try { id = decodeURIComponent(match[1]); } catch { fail('Session credit not found.', 404); }
    const action = match[2];
    const row = sessionCredit.get(user.id, id);
    const body = fields(await readBody(req), action === 'verify' ? ['paymentId'] : []);
    if (action === 'accept' || action === 'decline' || action === 'finish') {
      json(res, 200, sessionCredit[action]({ userId:user.id, id })); return true;
    }
    if (action === 'link') {
      if (row.state === 'paid' || row.dueCents === 0 || row.paymentLinkId) { json(res, 200, row); return true; }
      if (row.state !== 'awaiting_payment') fail('Payment is not due.', 409);
      const provider = providers.forOrganizer(row.organizerId);
      if (!await provider.ready()) fail('This organizer has not connected a verified NervixPay merchant. The returned chips are safe; retry link creation after the connection is configured.', 503);
      const paymentLinkId = await provider.linkForRequest(db, { ...row, amount:row.usedChips, feeCents:row.dueCents, purpose:'session_settlement' });
      json(res, 200, sessionCredit.attachLink({ userId:user.id, id, paymentLinkId })); return true;
    }
    const provider = providers.forOrganizer(row.organizerId);
    if (!await provider.ready()) fail('Payment verification is unavailable for this organizer.', 503);
    const payment = await provider.payment(body.paymentId);
    json(res, 200, sessionCredit.settle({ userId:user.id, id, payment }));
    return true;
  };
}
