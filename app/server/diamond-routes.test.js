import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiamondRoutes } from './diamond-routes.js';

test('routes bind authenticated identity and reject extra fields', async () => {
  const calls = [], diamonds = { catalog: () => ({ enabled: true }), list: userId => ({ userId }), offer: body => (calls.push(body), body), request: body => (calls.push(body), body), approve: body => body, reject: body => body, cancel: body => body };
  const json = (_res, status, data) => { _res.status = status; _res.data = data; }, requireUser = () => ({ id: 7 });
  let body = { priceCashChips: 2000 };
  const routes = createDiamondRoutes({ diamonds, json, requireUser, readBody: async () => body });
  const res = {}; assert.equal(await routes({ method: 'POST' }, res, new URL('http://x/api/marketplace/diamonds/offers')), true); assert.deepEqual(calls[0], { userId: 7, priceCashChips: 2000 });
  body = { priceCashChips: 2000, userId: 99 };
  await assert.rejects(() => routes({ method: 'POST' }, {}, new URL('http://x/api/marketplace/diamonds/offers')), { status: 400 });
});

test('catalog is public while me and actions require the authenticated actor', async () => {
  let required = 0;
  const diamonds = { catalog: () => ({ offers: [] }), list: id => ({ id }), approve: value => value };
  const route = createDiamondRoutes({ diamonds, json: (res, _status, data) => { res.data = data; }, requireUser: () => { required++; return { id: 4 }; }, readBody: async () => ({}) });
  const publicRes = {}; await route({ method: 'GET' }, publicRes, new URL('http://x/api/marketplace/diamonds')); assert.equal(required, 0);
  const me = {}; await route({ method: 'GET' }, me, new URL('http://x/api/marketplace/diamonds/me')); assert.equal(me.data.id, 4);
  const action = {}; await route({ method: 'POST' }, action, new URL('http://x/api/marketplace/diamonds/requests/request-id/approve')); assert.deepEqual(action.data, { userId: 4, id: 'request-id' });
});
