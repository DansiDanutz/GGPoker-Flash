import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrganizerFundingRoutes } from './organizer-funding-routes.js';

function fixture({ ready = true, mode = 'enforce' } = {}) {
  const calls = [], row = { id: 'req', organizerId: 7, userId: 8, state: 'requested' };
  const funding = { list: () => [row], get: (userId, id) => id === 'req' ? row : null, create: x => (calls.push(['create', x]), x),
    cancel: x => (calls.push(['cancel',x]),row), credit: x => (calls.push(['credit', x]), row), reject: x => row,
    offer: x => (calls.push(['offer', x]), row), attachLink: x => (calls.push(['attach', x]), row),
    settle: x => (calls.push(['settle', x]), row) };
  const provider = { cancelLink: async x => calls.push(['disable',x]), ready: async () => ready, linkForRequest: async () => 'link', payment: async () => ({ status: 'paid' }) };
  let result;
  const route = createOrganizerFundingRoutes({ db: {}, funding, providers: { forOrganizer: () => provider }, mode,
    requireUser: req => req.actor === null ? null : { id: req.actor ?? 7 }, readBody: async req => req.body,
    json: (_res, status, body) => { result = { status, body }; } });
  const call = async (suffix = '', body, actor = 7) => { result = undefined; await route({ method: body === undefined ? 'GET' : 'POST', body, actor }, {}, new URL('http://test/api/marketplace/chips/funding' + suffix)); return result; };
  return { call, calls, row };
}
test('funding routes bind authenticated identity and reject extra fields', async () => {
  const f = fixture();
  await f.call('', { organizerId: 7, amount: 20000, key: 'one' }, 8);
  assert.equal(f.calls[0][1].userId, 8);
  await assert.rejects(f.call('', { organizerId: 7, amount: 20000, key: 'two', userId: 99 }), /Unexpected/);
  assert.equal(await f.call('', undefined, null), undefined);
});
test('unconfigured payments do not reserve chips; read-only mode blocks writes', async () => {
  const f = fixture({ ready: false });
  await assert.rejects(f.call('/req/offer', { feeCents: 200 }), /connected/);
  assert.equal(f.calls.length, 0);
  await assert.rejects(fixture({ mode: 'off' }).call('/req/credit', {}), /not active/);
});
test('only owning organizer creates links; verification uses provider evidence', async () => {
  const f = fixture();
  await assert.rejects(f.call('/req/offer', { feeCents: 200 }, 8), /organizer/);
  await f.call('/req/offer', { feeCents: 200 });
  assert.equal(f.calls[0][0], 'offer'); assert.equal(f.calls[1][0], 'attach');
  await f.call('/req/verify', { paymentId: 'receipt' }, 8);
  assert.deepEqual(f.calls.at(-1)[1].payment, { status: 'paid' });
  await assert.rejects(f.call('/missing/verify', { paymentId: 'receipt' }), /not found/);
  await assert.rejects(f.call('/req/verify', { paymentId: 'receipt', payment: {} }), /Unexpected/);
});

test('cancel checks owner and provider before returning escrow; client cannot assert clearance',async()=>{
 const f=fixture();f.row.state='offered';
 await assert.rejects(f.call('/req/cancel',{},8),/owning organizer/);
 await assert.rejects(f.call('/req/cancel',{providerCleared:true}),/Unexpected/);
 await f.call('/req/cancel',{});
 assert.deepEqual(f.calls.map(c=>c[0]),['disable','cancel']);
 assert.equal(f.calls[1][1].providerCleared,true);
 f.row.state='rejected';await f.call('/req/cancel',{});
 assert.equal(f.calls.filter(c=>c[0]==='disable').length,1);
});
