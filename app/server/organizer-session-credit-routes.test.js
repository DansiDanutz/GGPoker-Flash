// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrganizerSessionCreditRoutes } from './organizer-session-credit-routes.js';

function fixture({ mode='enforce', ready=true, finishRow } = {}) {
  const calls = [];
  const proposed = { id:'session-1', fundingRequestId:'funding-1', organizerId:7, userId:8, amount:20000, feeCents:500, dueCents:null, usedChips:null, returnedChips:null, state:'proposed', reference:'session:one', paymentLinkId:null };
  const awaiting = finishRow || { ...proposed, dueCents:250, usedChips:10000, returnedChips:10000, state:'awaiting_payment' };
  let current = proposed;
  const service = {
    list:userId => (calls.push(['list', userId]), [current]),
    get:(userId, id) => { calls.push(['get', userId, id]); if (id !== current.id || ![7, 8].includes(userId)) throw Object.assign(new Error('Session credit not found.'), { status:404 }); return current; },
    propose:x => (calls.push(['propose', x]), current), accept:x => (calls.push(['accept', x]), current), decline:x => (calls.push(['decline', x]), current),
    finish:x => (calls.push(['finish', x]), current = awaiting),
    attachLink:x => (calls.push(['attachLink', x]), current = { ...current, paymentLinkId:x.paymentLinkId }),
    settle:x => (calls.push(['settle', x]), current = { ...current, state:'paid' }),
  };
  const provider = { ready:async () => ready, linkForRequest:async (_db, row) => (calls.push(['linkForRequest', row]), '11111111-1111-4111-8111-111111111111'), payment:async id => (calls.push(['payment', id]), { id, status:'paid' }) };
  let result;
  const route = createOrganizerSessionCreditRoutes({ db:{}, sessionCredit:service, providers:{ forOrganizer:id => (calls.push(['forOrganizer', id]), provider) }, mode,
    requireUser:req => req.actor == null ? null : { id:req.actor }, readBody:async req => req.body,
    json:(_res, status, body) => { result = { status, body }; }, limiter:{ isBlocked:() => false, record:id => calls.push(['limit', id]) } });
  const call = async (suffix='', body, actor=7) => { result=undefined; await route({ method:body === undefined ? 'GET' : 'POST', body, actor }, {}, new URL('http://test/api/marketplace/chips/session-credit' + suffix)); return result; };
  return { call, calls, proposed };
}

test('session-credit routes bind actor identity, enforce mode, and reject extra fields', async () => {
  const f = fixture();
  await f.call('', { fundingRequestId:'funding-1', feeCents:500 }, 7);
  assert.deepEqual(f.calls.find(call => call[0] === 'propose')[1], { userId:7, fundingRequestId:'funding-1', feeCents:500 });
  await assert.rejects(f.call('', { fundingRequestId:'funding-1', feeCents:500, userId:99 }, 7), /Unexpected/);
  assert.equal(await f.call('', undefined, null), undefined);
  await assert.rejects(fixture({ mode:'off' }).call('', { fundingRequestId:'funding-1', feeCents:500 }), /not active/);
});

test('finish reclaims chips without consulting an unavailable payment provider', async () => {
  const f = fixture({ ready:false });
  const result = await f.call('/session-1/finish', {}, 7);
  assert.equal(result.body.state, 'awaiting_payment');
  assert.equal(f.calls.some(call => call[0] === 'forOrganizer'), false);
});

test('zero-due finish is paid and duplicate-safe without creating checkout', async () => {
  const paid = { id:'session-1', organizerId:7, userId:8, amount:20000, feeCents:500, dueCents:0, usedChips:0, returnedChips:20000, state:'paid', reference:'session:one', paymentLinkId:null };
  const f = fixture({ finishRow:paid });
  assert.equal((await f.call('/session-1/finish', {}, 7)).body.state, 'paid');
  assert.equal((await f.call('/session-1/finish', {}, 7)).body.state, 'paid');
  assert.equal((await f.call('/session-1/link', {}, 8)).body.state, 'paid');
  assert.equal(f.calls.some(call => call[0] === 'forOrganizer'), false);
});

test('link is separate, participant-authorized, and labels the provider request as settlement', async () => {
  const stale = fixture();
  await assert.rejects(stale.call('/session-1/link', {}, 7), error => error.status === 409);
  assert.equal(stale.calls.some(call => call[0] === 'forOrganizer'), false);
  const f = fixture();
  await f.call('/session-1/finish', {}, 7);
  const result = await f.call('/session-1/link', {}, 7);
  assert.equal(result.body.paymentLinkId, '11111111-1111-4111-8111-111111111111');
  const providerRow = f.calls.find(call => call[0] === 'linkForRequest')[1];
  assert.deepEqual({ amount:providerRow.amount, feeCents:providerRow.feeCents, purpose:providerRow.purpose }, { amount:10000, feeCents:250, purpose:'session_settlement' });
  assert.equal((await f.call('/session-1/link', {}, 8)).body.paymentLinkId, '11111111-1111-4111-8111-111111111111');
  await assert.rejects(f.call('/session-1/link', {}, 9), error => error.status === 404);
  const unavailable = fixture({ ready:false });
  await unavailable.call('/session-1/finish', {}, 7);
  await assert.rejects(unavailable.call('/session-1/link', {}, 8), error => error.status === 503);
  assert.equal(unavailable.calls.some(call => call[0] === 'attachLink'), false);
});

test('verification accepts only provider-fetched payment evidence', async () => {
  const f = fixture();
  await f.call('/session-1/finish', {}, 7);
  await f.call('/session-1/verify', { paymentId:'22222222-2222-4222-8222-222222222222' }, 8);
  assert.deepEqual(f.calls.find(call => call[0] === 'settle')[1].payment, { id:'22222222-2222-4222-8222-222222222222', status:'paid' });
  await assert.rejects(f.call('/session-1/verify', { paymentId:'x', payment:{} }, 8), /Unexpected/);
});
