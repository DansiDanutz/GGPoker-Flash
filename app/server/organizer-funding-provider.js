// SPDX-License-Identifier: AGPL-3.0-only
// Organizer credentials remain server-side; callers receive only provider operations.
const ORIGIN = 'https://nervixpay.live';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPES = ['integrations:verify', 'payment_links:read', 'payment_links:write', 'payments:read'];
function fail(message, status = 409) { throw Object.assign(new Error(message), { status, code:'organizer_funding_provider_error' }); }
function uuid(value) { if (typeof value !== 'string' || !UUID.test(value)) fail('Invalid NervixPay identifier.', 400); return value; }
function text(value, name) { if (typeof value !== 'string' || !value || value.length > 200) fail(`Invalid funding ${name}.`, 400); return value; }
const price = cents => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

export function organizerFundingCheckoutUrl(id, reference) {
  const url = new URL(`/l/${uuid(id)}`, ORIGIN);
  url.searchParams.set('mode', 'card');
  url.searchParams.set('ref', text(reference, 'reference'));
  return url.toString();
}

export function createOrganizerFundingProviders({ connections = process.env.ORGANIZER_NERVIXPAY_CONNECTIONS, resolveConnection = (_id, legacy) => legacy, fetchImpl = fetch } = {}) {
  if (connections == null) connections = {};
  if (typeof connections === 'string') {
    try { connections = JSON.parse(connections); }
    catch { fail('ORGANIZER_NERVIXPAY_CONNECTIONS must contain valid JSON.', 503); }
  }
  if (!connections || typeof connections !== 'object' || Array.isArray(connections)) fail('ORGANIZER_NERVIXPAY_CONNECTIONS must be a JSON object.', 503);
  if (typeof resolveConnection !== 'function') fail('NervixPay connection resolver is invalid.', 500);
  const providers = new Map();

  function forOrganizer(organizerId) {
    organizerId = text(String(organizerId ?? ''), 'organizer');
    if (providers.has(organizerId)) return providers.get(organizerId);
    const legacyConnection = connections[organizerId];
    const pendingLinks = new Map(), readiness = new Map();
    const connectionKey = connection => `${connection.merchantId}\u0000${connection.token}`;
    function current() {
      const connection = resolveConnection(organizerId, legacyConnection);
      return connection && typeof connection.merchantId === 'string' && connection.merchantId && typeof connection.token === 'string' && connection.token ? connection : null;
    }
    function same(connection) { const latest = current(); return latest && connectionKey(latest) === connectionKey(connection); }

    async function request(path, body, expected = current(), method = body ? 'POST' : 'GET') {
      if (!expected) fail(`Organizer ${organizerId} has no verified live NervixPay connection.`, 503);
      if (!same(expected)) fail('The NervixPay connection changed. Retry this request.', 503);
      let response;
      try {
        response = await fetchImpl(ORIGIN + '/api/v1' + path, { method, redirect:'error', signal:AbortSignal.timeout(10000), headers:{ authorization:`Bearer ${expected.token}`, ...(body ? { 'content-type':'application/json' } : {}) }, ...(body ? { body:JSON.stringify(body) } : {}) });
      } catch { fail('NervixPay could not be reached. No funding has been granted.', 503); }
      if (!same(expected)) fail('The NervixPay connection changed. No provider result was accepted.', 503);
      if (!response.ok) fail('NervixPay could not confirm this funding request. Try again later.', 503);
      const result = await response.json();
      if (!same(expected)) fail('The NervixPay connection changed. No provider result was accepted.', 503);
      return result;
    }

    async function readyFor(connection) {
      const key = connectionKey(connection), cached = readiness.get(key), now = Date.now();
      if (cached?.checkedAt && now - cached.checkedAt < (cached.available ? 60000 : 5000)) return same(connection) && cached.available;
      let available = false;
      try {
        const result = await request('/verify', undefined, connection);
        available = result.merchant?.id === connection.merchantId && result.merchant?.blocked === false && result.credential?.mode === 'live' && SCOPES.every(scope => result.credential?.scopes?.includes(scope));
      } catch { available = false; }
      readiness.set(key, { checkedAt:now, available });
      return same(connection) && available;
    }
    async function ready() { const connection = current(); return connection ? readyFor(connection) : false; }

    async function linkForRequest(db, row) {
      if (!row || text(row.id, 'request') !== row.id || text(row.reference, 'reference') !== row.reference || String(row.organizerId) !== organizerId || !Number.isSafeInteger(row.amount) || row.amount < 1 || !Number.isSafeInteger(row.feeCents) || row.feeCents < 1 || row.feeCents > 100000 || (row.purpose != null && row.purpose !== 'session_settlement')) fail('Invalid organizer funding request.', 400);
      const connection = current();
      if (!connection || !await readyFor(connection)) fail(`Organizer ${organizerId} needs a verified live NervixPay connection.`, 503);
      const pendingKey = `${connectionKey(connection)}\u0000${row.id}`;
      if (pendingLinks.has(pendingKey)) return pendingLinks.get(pendingKey);
      const task = (async () => {
        db.exec(`CREATE TABLE IF NOT EXISTS organizer_funding_provider_links (request_id TEXT PRIMARY KEY,organizer_id TEXT NOT NULL,merchant_id TEXT NOT NULL,fee_cents INTEGER NOT NULL,item_name TEXT NOT NULL,link_id TEXT NOT NULL)`);
        const settlement = row.purpose === 'session_settlement';
        const itemName = settlement ? `Session settlement · ${row.amount} Cash Chips · ${row.reference}` : `Cash Chips ${row.amount} · ${row.reference}`;
        const valid = link => link?.mode === 'live' && link.active === true && link.linkType === 'embed' && link.itemName === itemName && UUID.test(link.id) && Array.isArray(link.prices) && link.prices.length > 0 && link.prices.every(p => ((p.network === 'polygon' && p.currencyToken === 'USDC') || (p.network === 'bnb' && ['USDT', 'USDC'].includes(p.currencyToken))) && p.pricingMode === 'fixed' && Number(p.amount) === row.feeCents / 100);
        const saved = db.prepare('SELECT * FROM organizer_funding_provider_links WHERE request_id=?').get(row.id);
        if (saved) {
          if (saved.organizer_id !== organizerId || saved.merchant_id !== connection.merchantId || saved.fee_cents !== row.feeCents || saved.item_name !== itemName) fail('Funding request payment terms changed after link creation.', 409);
          const found = (await request(`/payment-links?id=${encodeURIComponent(saved.link_id)}`, undefined, connection)).items?.find(link => link.id === saved.link_id);
          if (valid(found)) return found.id;
          fail('The saved organizer funding link needs operator review.', 503);
        }
        const existing = (await request('/payment-links', undefined, connection)).items?.find(valid);
        const link = existing || (await request('/payment-links', {
          linkType:'embed', itemName, displayTitle:settlement ? `DanGG · ${row.amount.toLocaleString('en-US')} Cash Chips · Session settlement` : `DanGG · ${row.amount.toLocaleString('en-US')} Cash Chips`,
          description:settlement ? 'Settlement for used or lost organizer Cash Chips. This payment does not grant additional chips and is not service credits or club entry. Network fees are separate.' : 'Organizer Cash Chips for this funding request only; not service credits or club entry. Network fees are separate.',
          prices:[
            { network:'polygon', currencyToken:'USDC', amount:price(row.feeCents), pricingMode:'fixed' },
            { network:'bnb', currencyToken:'USDC', amount:price(row.feeCents), pricingMode:'fixed' },
          ],
          theme:'dark', accentColor:'#e8c46c', backgroundColor:'#160b1e', showBranding:true, showMerchantChip:true, showExactAmountBox:true,
        }, connection)).paymentLink;
        if (!valid(link)) fail('NervixPay did not return a valid live organizer funding link.', 503);
        if (!same(connection)) fail('The NervixPay connection changed. No payment link was saved.', 503);
        db.prepare('INSERT INTO organizer_funding_provider_links VALUES(?,?,?,?,?,?)').run(row.id, organizerId, connection.merchantId, row.feeCents, itemName, link.id);
        return link.id;
      })();
      pendingLinks.set(pendingKey, task);
      try { return await task; } finally { pendingLinks.delete(pendingKey); }
    }

    async function cancelLink(row, db) {
      if (!row.paymentLinkId) {
        const saved = db?.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='organizer_funding_provider_links'").get() && db.prepare('SELECT link_id FROM organizer_funding_provider_links WHERE request_id=? AND organizer_id=?').get(row.id,organizerId);
        if (!saved) fail('Link creation is unresolved; reconcile the provider checkout before returning chips.');
        row = { ...row, paymentLinkId:saved.link_id };
      }
      const connection = current();
      const updated = await request(`/payment-links/${uuid(row.paymentLinkId)}`, { active:false }, connection, 'PATCH');
      if (updated.paymentLink?.id !== row.paymentLinkId || updated.paymentLink.active !== false) fail('Checkout could not be disabled.',503);
      // Any existing order may still receive a late transfer; require operator reconciliation.
      const payments = await request('/payments?limit=100', undefined, connection);
      if (!Array.isArray(payments.items) || payments.items.length >= 100 || payments.items.some(p => p.paymentLinkId === row.paymentLinkId)) fail('Checkout disabled; existing payment orders require reconciliation before returning chips.');
    }

    const provider = { ready, linkForRequest, cancelLink, payment:async id => (await request(`/payments/${uuid(id)}`)).payment };
    providers.set(organizerId, provider);
    return provider;
  }

  return { forOrganizer };
}
