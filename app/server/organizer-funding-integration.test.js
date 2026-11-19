// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createOrganizerChips } from './organizer-chips.js';
import { createOrganizerFunding } from './organizer-funding.js';
import { createOrganizerFundingRoutes } from './organizer-funding-routes.js';

const LINK = '11111111-1111-4111-8111-111111111111';
const PAYMENT_ID = '22222222-2222-4222-8222-222222222222';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY,nick TEXT,banned INTEGER DEFAULT 0,deleted_at TEXT);
    INSERT INTO users VALUES (1,'Owner',0,NULL),(2,'Member',0,NULL),(3,'Stranger',0,NULL);
    CREATE TABLE organizer_billing_memberships(user_id INTEGER,role TEXT,active INTEGER,expires_at TEXT,PRIMARY KEY(user_id,role));
    INSERT INTO organizer_billing_memberships VALUES (1,'organizer',1,'2099-01-01T00:00:00.000Z');
    CREATE TABLE organizer_billing_accounts(user_id INTEGER PRIMARY KEY,balance_cents INTEGER NOT NULL);
    INSERT INTO organizer_billing_accounts VALUES (1,0),(2,0);
    CREATE TABLE organizer_club_members(organizer_id INTEGER,user_id INTEGER,status TEXT,message TEXT,created_at TEXT,updated_at TEXT,PRIMARY KEY(organizer_id,user_id));
    INSERT INTO organizer_club_members VALUES (1,2,'approved','','','');
  `);
  const now = () => Date.parse('2026-01-01T00:00:00Z');
  const chips = createOrganizerChips({ db, now });
  db.prepare('INSERT INTO organizer_chip_accounts VALUES (?,?,?)').run(1, 'wallet:1', 100_000);
  const funding = createOrganizerFunding({ db, chips, now });
  let wrongReference = true, offeredReference;
  const provider = {
    ready: async () => true,
    linkForRequest: async (_db, row) => { offeredReference = row.reference; return LINK; },
    payment: async () => {
      return { id: PAYMENT_ID, status: 'paid', test: false, customerReference: wrongReference ? 'wrong-reference' : offeredReference,
        paymentLinkId: LINK, network: 'polygon', currencyToken: 'USDC', amountBaseUnits: '25000000', amountReceivedBaseUnits: '25000000',
        transactionId: '0xfunding-integration', paidAt: '2026-01-02T00:00:00Z', recipientWallet: '0xmerchant' };
    },
  };
  const providers = { forOrganizer: () => provider };
  const makeRoute = (mode = 'enforce', selectedProviders = providers) => {
    let response;
    const route = createOrganizerFundingRoutes({ db, funding, providers: selectedProviders, mode,
      requireUser: req => ({ id: req.actor }), readBody: async req => req.body,
      json: (_res, status, body) => { response = { status, body }; } });
    const call = async (actor, suffix = '', body) => {
      response = undefined;
      await route({ actor, method: body === undefined ? 'GET' : 'POST', body }, {}, new URL(`http://test/api/marketplace/chips/funding${suffix}`));
      return response;
    };
    return call;
  };
  return { db, chips, funding, call: makeRoute(), makeRoute, allowReference: () => { wrongReference = false; } };
}

test('real funding routes complete the verified paid loop without minting or service credits', async () => {
  const f = fixture();
  const created = (await f.call(2, '', { organizerId: 1, amount: 20_000, key: 'integration-request' })).body;
  assert.equal(created.state, 'requested');
  await assert.rejects(f.call(3, `/${created.id}/offer`, { feeCents: 2500 }), (error) => error.code === 'funding_not_found');

  const offered = (await f.call(1, `/${created.id}/offer`, { feeCents: 2500 })).body;
  assert.equal(offered.state, 'offered');
  assert.equal(offered.feeCents, 2500);
  assert.equal(offered.paymentLinkId, LINK);
  assert.equal(f.chips.balance(1, 1), 80_000);
  assert.equal(f.db.prepare('SELECT balance FROM organizer_chip_accounts WHERE organizer_id=1 AND account_key=?').get(`ticket:funding:${created.id}`).balance, 20_000);

  await assert.rejects(f.call(2, `/${created.id}/verify`, { paymentId: PAYMENT_ID }), (error) => error.code === 'club_entry_payment_unverified');
  assert.equal(f.chips.balance(1, 2), 0);
  f.allowReference();
  assert.equal((await f.call(2, `/${created.id}/verify`, { paymentId: PAYMENT_ID })).body.state, 'paid');
  assert.equal((await f.call(1, `/${created.id}/verify`, { paymentId: PAYMENT_ID })).body.state, 'paid');

  assert.equal(f.chips.balance(1, 1), 80_000);
  assert.equal(f.chips.balance(1, 2), 20_000);
  assert.equal(f.db.prepare('SELECT SUM(balance) total FROM organizer_chip_accounts WHERE organizer_id=1').get().total, 100_000);
  assert.equal(f.db.prepare('SELECT SUM(balance_cents) total FROM organizer_billing_accounts').get().total, 0);
  assert.deepEqual(f.chips.supply(1), { minted: 0, burned: 0, circulating: 0 });
});

test('disabled mode and an unready provider cannot reserve organizer chips', async () => {
  const f = fixture();
  await assert.rejects(f.makeRoute('off')(2, '', { organizerId: 1, amount: 5000, key: 'mode-off' }), /not active/);
  const created = (await f.call(2, '', { organizerId: 1, amount: 5000, key: 'provider-off' })).body;
  const unavailable = { forOrganizer: () => ({ ready: async () => false }) };
  await assert.rejects(f.makeRoute('enforce', unavailable)(1, `/${created.id}/offer`, { feeCents: 2500 }), /connected/);
  assert.equal(f.chips.balance(1, 1), 100_000);
  assert.equal(f.funding.get(1, created.id).state, 'requested');
  assert.equal(f.db.prepare('SELECT SUM(balance_cents) total FROM organizer_billing_accounts').get().total, 0);
});
