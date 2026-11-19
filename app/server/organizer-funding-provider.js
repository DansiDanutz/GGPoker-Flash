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

export function createOrganizerFundingProviders({ connections = process.env.ORGANIZER_NERVIXPAY_CONNECTIONS, fetchImpl = fetch } = {}) {
  if (connections == null) connections = {};
  if (typeof connections === 'string') {
    try { connections = JSON.parse(connections); }
    catch { fail('ORGANIZER_NERVIXPAY_CONNECTIONS must contain valid JSON.', 503); }
  }
  if (!connections || typeof connections !== 'object' || Array.isArray(connections)) fail('ORGANIZER_NERVIXPAY_CONNECTIONS must be a JSON object.', 503);
  const providers = new Map();

  function forOrganizer(organizerId) {
    organizerId = text(String(organizerId ?? ''), 'organizer');
    if (providers.has(organizerId)) return providers.get(organizerId);
    const connection = connections[organizerId];
    const merchantId = connection?.merchantId;
    const token = connection?.token;
    const pendingLinks = new Map();
    let checkedAt = 0, available = false;

    async function request(path, body) {
      if (!merchantId || !token) fail(`Organizer ${organizerId} is not configured in ORGANIZER_NERVIXPAY_CONNECTIONS.`, 503);
      let response;
      try {
        response = await fetchImpl(ORIGIN + '/api/v1' + path, { method:body ? 'POST' : 'GET', redirect:'error', signal:AbortSignal.timeout(10000), headers:{ authorization:`Bearer ${token}`, ...(body ? { 'content-type':'application/json' } : {}) }, ...(body ? { body:JSON.stringify(body) } : {}) });
      } catch { fail('NervixPay could not be reached. No funding has been granted.', 503); }
      if (!response.ok) fail('NervixPay could not confirm this funding request. Try again later.', 503);
      return response.json();
    }

    async function ready() {
      if (!merchantId || !token) return false;
      if (checkedAt && Date.now() - checkedAt < (available ? 60000 : 5000)) return available;
      try {
        const result = await request('/verify');
        available = result.merchant?.id === merchantId && result.merchant?.blocked === false && result.credential?.mode === 'live' && SCOPES.every(scope => result.credential?.scopes?.includes(scope));
      } catch { available = false; }
      checkedAt = Date.now();
      return available;
    }

    async function linkForRequest(db, row) {
      if (!row || text(row.id, 'request') !== row.id || text(row.reference, 'reference') !== row.reference || String(row.organizerId) !== organizerId || !Number.isSafeInteger(row.amount) || row.amount < 1 || !Number.isSafeInteger(row.feeCents) || row.feeCents < 1 || row.feeCents > 100000 || (row.purpose != null && row.purpose !== 'session_settlement')) fail('Invalid organizer funding request.', 400);
      if (!await ready()) fail(`Organizer ${organizerId} needs a live NervixPay connection in ORGANIZER_NERVIXPAY_CONNECTIONS.`, 503);
      if (pendingLinks.has(row.id)) return pendingLinks.get(row.id);
      const task = (async () => {
        db.exec(`CREATE TABLE IF NOT EXISTS organizer_funding_provider_links (request_id TEXT PRIMARY KEY,organizer_id TEXT NOT NULL,merchant_id TEXT NOT NULL,fee_cents INTEGER NOT NULL,item_name TEXT NOT NULL,link_id TEXT NOT NULL)`);
        const settlement = row.purpose === 'session_settlement';
        const itemName = settlement ? `Session settlement · ${row.amount} Cash Chips · ${row.reference}` : `Cash Chips ${row.amount} · ${row.reference}`;
        const valid = link => link?.mode === 'live' && link.active === true && link.linkType === 'embed' && link.itemName === itemName && UUID.test(link.id) && Array.isArray(link.prices) && link.prices.length > 0 && link.prices.every(p => ((p.network === 'polygon' && p.currencyToken === 'USDC') || (p.network === 'bnb' && p.currencyToken === 'USDT')) && p.pricingMode === 'fixed' && Number(p.amount) === row.feeCents / 100);
        const saved = db.prepare('SELECT * FROM organizer_funding_provider_links WHERE request_id=?').get(row.id);
        if (saved) {
          if (saved.organizer_id !== organizerId || saved.merchant_id !== merchantId || saved.fee_cents !== row.feeCents || saved.item_name !== itemName) fail('Funding request payment terms changed after link creation.', 409);
          const found = (await request(`/payment-links?id=${encodeURIComponent(saved.link_id)}`)).items?.find(link => link.id === saved.link_id);
          if (valid(found)) return found.id;
          fail('The saved organizer funding link needs operator review.', 503);
        }
        const existing = (await request('/payment-links')).items?.find(valid);
        const link = existing || (await request('/payment-links', {
          linkType:'embed', itemName, displayTitle:settlement ? `${row.amount.toLocaleString('en-US')} Cash Chips · Session settlement` : `${row.amount.toLocaleString('en-US')} Cash Chips`,
          description:settlement ? 'Settlement for used or lost organizer Cash Chips. This payment does not grant additional chips and is not service credits or club entry. Network fees are separate.' : 'Organizer Cash Chips for this funding request only; not service credits or club entry. Network fees are separate.',
          prices:[
            { network:'polygon', currencyToken:'USDC', amount:price(row.feeCents), pricingMode:'fixed' },
            { network:'bnb', currencyToken:'USDT', amount:price(row.feeCents), pricingMode:'fixed' },
          ],
          theme:'dark', accentColor:'#e8c46c', backgroundColor:'#160b1e', showBranding:true, showMerchantChip:true, showExactAmountBox:true,
        })).paymentLink;
        if (!valid(link)) fail('NervixPay did not return a valid live organizer funding link.', 503);
        db.prepare('INSERT INTO organizer_funding_provider_links VALUES(?,?,?,?,?,?)').run(row.id, organizerId, merchantId, row.feeCents, itemName, link.id);
        return link.id;
      })();
      pendingLinks.set(row.id, task);
      try { return await task; } finally { pendingLinks.delete(row.id); }
    }

    const provider = { ready, linkForRequest, payment:async id => (await request(`/payments/${uuid(id)}`)).payment };
    providers.set(organizerId, provider);
    return provider;
  }

  return { forOrganizer };
}
