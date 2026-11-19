// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createOrganizerFundingProviders, organizerFundingCheckoutUrl } from './organizer-funding-provider.js';

const scopes = ['integrations:verify', 'payment_links:read', 'payment_links:write', 'payments:read'];
const row = { id:'request-1', reference:'funding:opaque-1', organizerId:'organizer-1', userId:'player-1', amount:2500, feeCents:375 };
const link = { id:'11111111-1111-4111-8111-111111111111', mode:'live', active:true, linkType:'embed', itemName:`Cash Chips ${row.amount} · ${row.reference}`, prices:[
  { network:'polygon', currencyToken:'USDC', amount:'3.75', pricingMode:'fixed' },
  { network:'bnb', currencyToken:'USDT', amount:'3.75', pricingMode:'fixed' },
] };

function provider(fetchImpl, connections = { 'organizer-1': { merchantId:'merchant-1', token:'server-token' } }) {
  return createOrganizerFundingProviders({ connections, fetchImpl }).forOrganizer('organizer-1');
}

test('organizer connections stay closed when missing, test, or for a different merchant', async () => {
  assert.throws(
    () => createOrganizerFundingProviders({ connections:'{secret-token' }),
    error => error.status === 503 && /ORGANIZER_NERVIXPAY_CONNECTIONS/.test(error.message) && !/secret-token/.test(error.message),
  );
  assert.equal(await createOrganizerFundingProviders({ connections:{} }).forOrganizer('organizer-1').ready(), false);
  await assert.rejects(
    () => createOrganizerFundingProviders({ connections:{} }).forOrganizer('organizer-1').linkForRequest(new DatabaseSync(':memory:'), row),
    error => error.status === 503 && /ORGANIZER_NERVIXPAY_CONNECTIONS/.test(error.message),
  );
  for (const verification of [
    { merchant:{ id:'other', blocked:false }, credential:{ mode:'live', scopes } },
    { merchant:{ id:'merchant-1', blocked:false }, credential:{ mode:'test', scopes } },
  ]) assert.equal(await provider(async () => Response.json(verification)).ready(), false);
});

test('creates one request-bound Cash Chips product at the exact organizer price and caches it', async () => {
  const db = new DatabaseSync(':memory:');
  const calls = [];
  const funding = provider(async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/verify')) return Response.json({ merchant:{ id:'merchant-1', blocked:false }, credential:{ mode:'live', scopes } });
    if (!init.body) return Response.json({ items:url.includes('?id=') ? [link] : [] });
    return Response.json({ paymentLink:link });
  });
  assert.deepEqual(await Promise.all([funding.linkForRequest(db, row), funding.linkForRequest(db, row)]), [link.id, link.id]);
  const creation = calls.find(call => call.init.body);
  const body = JSON.parse(creation.init.body);
  assert.equal(body.itemName, `Cash Chips ${row.amount} · ${row.reference}`);
  assert.match(body.description, /organizer Cash Chips/i);
  assert.match(body.description, /not service credits or club entry/i);
  assert.deepEqual(body.prices.map(price => price.amount), ['3.75', '3.75']);
  assert.equal(calls.filter(call => call.init.body).length, 1);
  assert.equal(await funding.linkForRequest(db, row), link.id);
  assert.equal(calls.filter(call => call.init.body).length, 1);
});

test('labels session settlement as used chips repayment that grants no additional chips', async () => {
  const db = new DatabaseSync(':memory:');
  const settlement = { ...row, id:'session-1', reference:'session:opaque-1', amount:1200, feeCents:180, purpose:'session_settlement' };
  const settlementLink = { ...link, itemName:`Session settlement · ${settlement.amount} Cash Chips · ${settlement.reference}`, prices:link.prices.map(value => ({ ...value, amount:'1.80' })) };
  let body;
  const funding = provider(async (url, init) => {
    if (url.endsWith('/verify')) return Response.json({ merchant:{ id:'merchant-1', blocked:false }, credential:{ mode:'live', scopes } });
    if (!init.body) return Response.json({ items:[] });
    body = JSON.parse(init.body); return Response.json({ paymentLink:settlementLink });
  });
  assert.equal(await funding.linkForRequest(db, settlement), settlementLink.id);
  assert.match(body.displayTitle, /session settlement/i);
  assert.match(body.description, /used or lost organizer Cash Chips/i);
  assert.match(body.description, /does not grant additional chips/i);
  assert.deepEqual(body.prices.map(value => value.amount), ['1.80', '1.80']);
});

test('recovers a link created before a failed response by matching the request product and price', async () => {
  const db = new DatabaseSync(':memory:');
  let created = false;
  const funding = provider(async (url, init) => {
    if (url.endsWith('/verify')) return Response.json({ merchant:{ id:'merchant-1', blocked:false }, credential:{ mode:'live', scopes } });
    if (init.body) { created = true; return new Response('', { status:503 }); }
    return Response.json({ items:created ? [link] : [] });
  });
  await assert.rejects(() => funding.linkForRequest(db, row));
  assert.equal(await funding.linkForRequest(db, row), link.id);
});

test('rejects provider links with the wrong fixed amount or settlement network', async () => {
  for (const badLink of [
    { ...link, prices:link.prices.map(price => ({ ...price, amount:'3.74' })) },
    { ...link, prices:[{ network:'ethereum', currencyToken:'USDC', amount:'3.75', pricingMode:'fixed' }] },
  ]) {
    const db = new DatabaseSync(':memory:');
    const funding = provider(async (url, init) => {
      if (url.endsWith('/verify')) return Response.json({ merchant:{ id:'merchant-1', blocked:false }, credential:{ mode:'live', scopes } });
      if (!init.body) return Response.json({ items:[] });
      return Response.json({ paymentLink:badLink });
    });
    await assert.rejects(() => funding.linkForRequest(db, row), /valid live organizer funding link/);
  }
});

test('reads payment by UUID and builds only a trusted hosted checkout URL', async () => {
  const payment = { id:'22222222-2222-4222-8222-222222222222' };
  const funding = provider(async (url, init) => {
    assert.equal(init.headers.authorization, 'Bearer server-token');
    return Response.json({ payment });
  });
  assert.deepEqual(await funding.payment(payment.id), payment);
  const url = new URL(organizerFundingCheckoutUrl(link.id, row.reference));
  assert.equal(url.origin, 'https://nervixpay.live');
  assert.equal(url.pathname, `/l/${link.id}`);
  assert.equal(url.searchParams.get('ref'), row.reference);
  assert.equal(url.searchParams.get('mode'), 'card');
  assert.throws(() => organizerFundingCheckoutUrl('../../evil', row.reference));
});
