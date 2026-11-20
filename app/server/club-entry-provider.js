// SPDX-License-Identifier: AGPL-3.0-only
// NervixPay's merchant-scoped API is the authority; browser messages only request a recheck.
const ORIGIN = 'https://nervixpay.live';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPES = ['integrations:verify', 'payment_links:read', 'payment_links:write', 'payments:read'];
function fail(message, status = 409) { throw Object.assign(new Error(message), { status, code: 'club_entry_payment_unverified' }); }
function uuid(value) { if (typeof value !== 'string' || !UUID.test(value)) fail('Invalid payment identifier.', 400); return value; }
const price = cents => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

export function clubEntryCheckoutUrl(order) {
  const url = new URL(`/l/${uuid(order.paymentLinkId)}`, ORIGIN);
  url.searchParams.set('mode', 'card');
  url.searchParams.set('prefer', 'bnb:USDC');
  url.searchParams.set('ref', order.reference);
  return url.toString();
}
export function verifyClubEntryPayment(order, payment) {
  if (!payment || payment.status !== 'paid' || payment.test !== false || payment.customerReference !== order.reference || payment.paymentLinkId !== order.paymentLinkId) fail('This payment does not settle your club entry.');
  uuid(payment.id);
  const decimals = payment.network === 'polygon' && payment.currencyToken === 'USDC' ? 6 : payment.network === 'bnb' && ['USDT', 'USDC'].includes(payment.currencyToken) ? 18 : null;
  if (decimals === null || !Number.isSafeInteger(order.feeCents) || order.feeCents <= 0 || order.feeCents > 100000) fail('Unsupported entry payment amount or asset.');
  const units = value => { if (typeof value !== 'string' || !/^[1-9][0-9]{0,35}$/.test(value)) fail('Invalid settled payment amount.'); return BigInt(value); };
  const expected = BigInt(order.feeCents) * 10n ** BigInt(decimals - 2);
  const cent = 10n ** BigInt(decimals - 2);
  const quoted = units(payment.amountBaseUnits), received = units(payment.amountReceivedBaseUnits);
  // Accept the provider's sub-cent matching suffix and verified round-amount rescue, never an underpayment.
  if (quoted < expected || quoted >= expected + cent || received < expected || received >= expected + cent) fail('The settled amount does not match the entry price.');
  if (typeof payment.transactionId !== 'string' || !payment.transactionId || payment.transactionId.length > 200 || !payment.paidAt || !Number.isFinite(Date.parse(payment.paidAt)) || typeof payment.recipientWallet !== 'string' || !payment.recipientWallet) fail('The payment has no final settlement evidence.');
  return { orderId: order.id, providerOrderId: payment.id, transactionId: payment.transactionId, network: payment.network, token: payment.currencyToken, amountBaseUnits: payment.amountReceivedBaseUnits };
}

export function createClubEntryProvider({ token, merchantId, fetchImpl = fetch, now = Date.now } = {}) {
  let checkedAt = 0, available = false;
  const pendingLinks = new Map();
  async function request(path, body) {
    if (!token || !merchantId) fail('Club Entry payments are not configured yet.', 503);
    let response;
    try {
      response = await fetchImpl(ORIGIN + '/api/v1' + path, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch { fail('NervixPay could not be reached. No access has been granted.', 503); }
    if (!response.ok) fail('NervixPay could not confirm this request. Try again later.', 503);
    return response.json();
  }
  async function ready() {
    if (!token || !merchantId) return false;
    if (checkedAt && now() - checkedAt < (available ? 60000 : 5000)) return available;
    try {
      const result = await request('/verify');
      available = result.merchant?.id === merchantId && result.merchant?.blocked === false && result.credential?.mode === 'live' && SCOPES.every(scope => result.credential?.scopes?.includes(scope));
    } catch { available = false; }
    checkedAt = now(); return available;
  }
  async function linkForFee(db, feeCents) {
    if (!Number.isSafeInteger(feeCents) || feeCents < 1 || feeCents > 100000) fail('Invalid entry fee.', 400);
    if (!await ready()) fail('Club Entry payments are not configured yet.', 503);
    if (pendingLinks.has(feeCents)) return pendingLinks.get(feeCents);
    const task = (async () => {
      db.exec(`CREATE TABLE IF NOT EXISTS club_entry_provider_links (merchant_id TEXT NOT NULL,fee_cents INTEGER NOT NULL,link_id TEXT NOT NULL,PRIMARY KEY(merchant_id,fee_cents))`);
      const saved = db.prepare('SELECT link_id FROM club_entry_provider_links WHERE merchant_id=? AND fee_cents=?').get(merchantId, feeCents);
      const valid = link => link?.mode === 'live' && link.active === true && link.linkType === 'embed' && UUID.test(link.id) && Array.isArray(link.prices) && link.prices.length > 0 && link.prices.every(p => (p.network === 'polygon' && p.currencyToken === 'USDC' || p.network === 'bnb' && p.currencyToken === 'USDT') && p.pricingMode === 'fixed' && Number(p.amount) === feeCents / 100);
      if (saved) {
        const found = (await request(`/payment-links?id=${encodeURIComponent(saved.link_id)}`)).items?.find(link => link.id === saved.link_id);
        if (valid(found)) return found.id;
        fail('The configured entry payment link needs operator review.', 503);
      }
      const itemName = `DanGG Club Entry USD ${price(feeCents)}`;
      const existing = (await request('/payment-links')).items?.find(link => link.itemName === itemName && valid(link));
      const link = existing || (await request('/payment-links', {
        linkType: 'embed', itemName, displayTitle: 'DanGG · Club Entry',
        description: 'One-time club admission. Access opens after server verification. This payment does not buy player chips. Network fees are separate.',
        prices: [{ network: 'polygon', currencyToken: 'USDC', amount: price(feeCents), pricingMode: 'fixed' }, { network: 'bnb', currencyToken: 'USDT', amount: price(feeCents), pricingMode: 'fixed' }],
        theme: 'dark', accentColor: '#e8c46c', backgroundColor: '#160b1e', showBranding: true, showMerchantChip: true, showExactAmountBox: true,
      })).paymentLink;
      if (!valid(link)) fail('NervixPay did not return a valid live entry link.', 503);
      db.prepare('INSERT INTO club_entry_provider_links VALUES(?,?,?)').run(merchantId, feeCents, link.id);
      return link.id;
    })();
    pendingLinks.set(feeCents, task);
    try { return await task; } finally { pendingLinks.delete(feeCents); }
  }
  const payment = async paymentId => (await request(`/payments/${uuid(paymentId)}`)).payment;
  const recentPayments = async () => (await request('/payments?limit=100')).items || [];
  return { ready, linkForFee, payment, recentPayments };
}
