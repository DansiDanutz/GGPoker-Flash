// Rush & Cash Drop rule (P0 slice R4): configured rate, flat BB amount, one ledger row per
// drop, idempotent hand-save retry, and admin settings validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CASHDROP_DEFAULTS, CASHDROP_KIND, CASHDROP_RULE_LABEL, cashDropAmount, cashDropReference, createCashDropLedger,
  cryptoRng, readCashDropConfig, rollCashDrop, settleCashDrop, validateCashDropSettings,
} from './rush-pool.js';
import { startServer } from './test-helpers.js';

// Isolate the database before db.js is imported (it opens on import).
process.env.GGPOKER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'dangro-rushpool-'));
const { db, addTransactionEx } = await import('./db.js');

/** Deterministic mulberry32 RNG so the rate test is reproducible. */
function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLAYERS = [{ id: 1, nick: 'A' }, { id: 2, nick: 'B' }, { id: 3, nick: 'C' }];
const config = (over = {}) => ({ ...CASHDROP_DEFAULTS, rule: CASHDROP_RULE_LABEL, ...over });
const TRIALS = 100_000;
const TOLERANCE = 0.01;

for (const rate of [0.12, 0.05, 0.5]) {
  test(`a seeded RNG hits the configured rate ${rate} within ±1% over 100k trials`, () => {
    const rng = seededRng(42);
    let hits = 0;
    for (let i = 0; i < TRIALS; i++) {
      if (rollCashDrop({ bb: 1000, candidates: PLAYERS, config: config({ rate }), rng })) hits++;
    }
    assert.ok(Math.abs(hits / TRIALS - rate) <= TOLERANCE, `observed ${hits / TRIALS} for rate ${rate}`);
  });
}

test('rate 0 never drops and rate 1 always drops', () => {
  const rng = seededRng(7);
  for (let i = 0; i < 1000; i++) {
    assert.equal(rollCashDrop({ bb: 1000, candidates: PLAYERS, config: config({ rate: 0 }), rng }), null);
    assert.ok(rollCashDrop({ bb: 1000, candidates: PLAYERS, config: config({ rate: 1 }), rng }));
  }
});

test('the drop amount is bb × the configured multiple, independent of the pot', () => {
  for (const [bb, amountBb] of [[1000, 5], [200, 5], [2000, 3], [100, 25]]) {
    const drop = rollCashDrop({ bb, candidates: PLAYERS, config: config({ rate: 1, amountBb }), rng: seededRng(1) });
    assert.equal(drop.amount, bb * amountBb);
    assert.equal(cashDropAmount(bb, config({ amountBb })), bb * amountBb);
  }
  assert.equal(cashDropAmount(0, config()), 0);
  assert.equal(rollCashDrop({ bb: 1000, candidates: PLAYERS, config: config({ rate: 1, amountBb: 0 }) }), null);
});

test('the recipient is one of the candidates and every candidate can be picked', () => {
  const rng = seededRng(99);
  const seen = new Set();
  for (let i = 0; i < 3000; i++) {
    const drop = rollCashDrop({ bb: 1000, candidates: PLAYERS, config: config({ rate: 1 }), rng });
    assert.ok(PLAYERS.some((p) => p.id === drop.userId && p.nick === drop.nick));
    seen.add(drop.userId);
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
  assert.equal(rollCashDrop({ bb: 1000, candidates: [], config: config({ rate: 1 }) }), null);
});

test('cryptoRng returns floats in [0, 1)', () => {
  for (let i = 0; i < 1000; i++) {
    const x = cryptoRng();
    assert.ok(x >= 0 && x < 1);
  }
});

test('readCashDropConfig uses settings, and falls back to defaults for missing or invalid values', () => {
  const from = (values) => (key, fallback) => (key in values ? values[key] : fallback);
  assert.deepEqual({ ...readCashDropConfig(from({})) }, { rate: 0.12, amountBb: 5, rule: CASHDROP_RULE_LABEL });
  assert.deepEqual({ ...readCashDropConfig(from({ rush_cashdrop_rate: 0.3, rush_cashdrop_amount_bb: 8 })) },
    { rate: 0.3, amountBb: 8, rule: CASHDROP_RULE_LABEL });
  assert.deepEqual({ ...readCashDropConfig(from({ rush_cashdrop_rate: 2, rush_cashdrop_amount_bb: 'x' })) },
    { rate: 0.12, amountBb: 5, rule: CASHDROP_RULE_LABEL });
});

test('validateCashDropSettings accepts valid values, ignores other keys and rejects bad ones', () => {
  assert.deepEqual(validateCashDropSettings({ site_name: 'x' }), []);
  assert.deepEqual(validateCashDropSettings({ rush_cashdrop_rate: 0, rush_cashdrop_amount_bb: 0 }), []);
  assert.deepEqual(validateCashDropSettings({ rush_cashdrop_rate: 1, rush_cashdrop_amount_bb: 1000 }), []);
  assert.equal(validateCashDropSettings({ rush_cashdrop_rate: -0.1 }).length, 1);
  assert.equal(validateCashDropSettings({ rush_cashdrop_rate: 1.5 }).length, 1);
  assert.equal(validateCashDropSettings({ rush_cashdrop_rate: '0.12' }).length, 1);
  assert.equal(validateCashDropSettings({ rush_cashdrop_amount_bb: 2.5 }).length, 1);
  assert.equal(validateCashDropSettings({ rush_cashdrop_amount_bb: 1001 }).length, 1);
  assert.equal(validateCashDropSettings({ rush_cashdrop_rate: null, rush_cashdrop_amount_bb: -1 }).length, 2);
});

/* --------------------------- ledger integration --------------------------- */

const ledger = createCashDropLedger(db, addTransactionEx);
const users = () => db.prepare('SELECT id, nick FROM users ORDER BY id LIMIT 3').all();
const dropRows = (handId) => db.prepare('SELECT * FROM transactions WHERE kind = ? AND reference = ?')
  .all(CASHDROP_KIND, cashDropReference(handId));

test('a drop writes exactly one ledger row and credits the recipient', () => {
  const candidates = users();
  const before = new Map(candidates.map((u) => [u.id, db.prepare('SELECT balance FROM users WHERE id = ?').get(u.id).balance]));
  const drop = settleCashDrop({ handId: 'rush-t1-1', bb: 1000, candidates, config: config({ rate: 1, amountBb: 5 }), ledger, rng: seededRng(3) });
  assert.equal(drop.amount, 5000);
  assert.equal(drop.rule, CASHDROP_RULE_LABEL);
  const rows = dropRows('rush-t1-1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, drop.userId);
  assert.equal(rows[0].amount, 5000);
  const after = db.prepare('SELECT balance FROM users WHERE id = ?').get(drop.userId).balance;
  assert.equal(after, before.get(drop.userId) + 5000);
});

test('a hand-save retry never pays a second drop, even when the RNG would pick someone else', () => {
  const candidates = users();
  const first = settleCashDrop({ handId: 'rush-t1-2', bb: 1000, candidates, config: config({ rate: 1 }), ledger, rng: () => 0 });
  assert.ok(first);
  const balance = db.prepare('SELECT balance FROM users WHERE id = ?').get(first.userId).balance;
  for (const rng of [() => 0, () => 0.999, seededRng(5)]) {
    assert.equal(settleCashDrop({ handId: 'rush-t1-2', bb: 1000, candidates, config: config({ rate: 1 }), ledger, rng }), null);
  }
  assert.equal(dropRows('rush-t1-2').length, 1);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = ?').get(first.userId).balance, balance);
  assert.equal(ledger.credit(first.userId, 5000, 'dup', cashDropReference('rush-t1-2')), false, 'unique reference blocks a raw duplicate');
});

test('a hand without an id, or a missed roll, writes no ledger row', () => {
  const count = () => db.prepare('SELECT COUNT(*) c FROM transactions WHERE kind = ?').get(CASHDROP_KIND).c;
  const start = count();
  assert.equal(settleCashDrop({ handId: null, bb: 1000, candidates: users(), config: config({ rate: 1 }), ledger }), null);
  assert.equal(settleCashDrop({ handId: 'rush-t1-3', bb: 1000, candidates: users(), config: config({ rate: 0 }), ledger }), null);
  assert.equal(count(), start);
});

/* ----------------------------- admin settings ----------------------------- */

test('admin settings: Cash Drop keys are listed, validated and exposed to the lobby', async () => {
  const srv = await startServer();
  try {
    const admin = await srv.login('admin', 'admin123');
    const listed = (await srv.get('/api/admin/settings', { token: admin })).data.settings;
    assert.equal(listed.rush_cashdrop_rate, 0.12);
    assert.equal(listed.rush_cashdrop_amount_bb, 5);

    for (const body of [{ rush_cashdrop_rate: 1.2 }, { rush_cashdrop_rate: 'abc' }, { rush_cashdrop_amount_bb: 2.5 }, { rush_cashdrop_amount_bb: -1 }]) {
      const res = await srv.post('/api/admin/settings', { token: admin, body: { ...body, site_name: 'Changed' } });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.ok(res.data.error);
    }
    const unchanged = (await srv.get('/api/admin/settings', { token: admin })).data.settings;
    assert.equal(unchanged.site_name, 'GGPoker', 'a rejected payload writes nothing');

    assert.equal((await srv.post('/api/admin/settings', { token: admin, body: { rush_cashdrop_rate: 0.25, rush_cashdrop_amount_bb: 10 } })).status, 200);
    const lobby = (await srv.get('/api/lobby')).data;
    assert.deepEqual(lobby.rushCashDrop, { rate: 0.25, amountBb: 10, rule: CASHDROP_RULE_LABEL });

    const u = (await srv.post('/api/auth/register', { body: { login: 'rp_plain', nick: 'RP Plain', password: 'secret12' } })).data;
    assert.equal((await srv.post('/api/admin/settings', { token: u.token, body: { rush_cashdrop_rate: 0.5 } })).status, 403);
  } finally {
    await srv.stop();
  }
});
