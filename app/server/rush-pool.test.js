// Rush & Cash Drop rule (P0 slice R4): configured rate, flat BB amount, one ledger row per
// drop, idempotent hand-save retry, and admin settings validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CASHDROP_DEFAULTS, CASHDROP_KIND, CASHDROP_RULE_LABEL, cashDropAmount, cashDropReference, createCashDropLedger,
  createRushPool, cryptoRng, poolKeyOf, readCashDropConfig, rollCashDrop, RUSH_MAX_PASSES, settleCashDrop,
  validateCashDropSettings,
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

/* ------------------------------------------------------------------ */
/* R1: pool queue and transfers stay inside one pool (game + sb + bb)  */
/* ------------------------------------------------------------------ */

/** Minimal stand-in for a live Rush PokerTable: seats, humans, street, emit. */
function fakeTable({ id, game = 'rush', sb, bb, seats = 6, players = [], street = 'ended' }) {
  const seatList = Array.from({ length: seats }, (_, i) => ({ index: i, player: players[i] ? { ...players[i] } : null }));
  return {
    cfg: { id, game, sb, bb, seats, max_buyin: bb * 100 },
    rush: game.startsWith('rush'),
    street,
    seats: seatList,
    events: [],
    humans() { return seatList.filter((s) => s.player && !s.player.isBot).map((s) => s.player); },
    seatOf(userId) { return seatList.find((s) => s.player?.id === userId) || null; },
    occupiedSeats() { return seatList.filter((s) => s.player); },
    emit(evt) { this.events.push(evt); },
  };
}

/**
 * A pool world over fake tables; records every transfer as { userId, from, to }.
 * options.refill: a vacated seat is taken by a new bot at once (a busy pool).
 */
function poolWorld(tables, { now = () => 1000, refill = false } = {}) {
  let nextBot = 10_000;
  const byId = new Map(tables.map((t) => [t.cfg.id, t]));
  const transfers = [];
  const sent = [];
  const seatedUsers = [];
  let pendingFrom = null;
  const entry = (id) => byId.has(id) ? {
    table: byId.get(id),
    clients: [{ userId: 1, readyState: 1, send: (m) => sent.push(JSON.parse(m)) }, { userId: 2, readyState: 1, send: (m) => sent.push(JSON.parse(m)) }],
  } : undefined;
  const pool = createRushPool({
    listPoolTableIds: (p) => tables.filter((t) => poolKeyOf(t.cfg) === p.key).map((t) => t.cfg.id),
    getLiveTable: (id) => byId.get(id) || null,
    getEntry: entry,
    findUser: (id) => ({ id, nick: `u${id}` }),
    cashOutSeat: (table, userId) => {
      pendingFrom = table.cfg.id;
      table.seatOf(userId).player = refill ? { id: nextBot++, stack: 50_000, isBot: true } : null;
    },
    seatHuman: (table, user, buyin) => {
      const free = table.seats.find((s) => !s.player);
      if (!free) return { ok: false };
      free.player = { id: user.id, stack: buyin };
      transfers.push({ userId: user.id, from: pendingFrom, to: table.cfg.id });
      seatedUsers.push(user);
      return { ok: true };
    },
    broadcastState: () => {},
    isRealUser: () => true,
    getSetting: (_k, fallback) => fallback,
    ledger: { hasDrop: () => false, credit: () => true },
    now,
  });
  return { pool, transfers, sent, byId, seatedUsers };
}

const human = (id, stack = 50_000) => ({ id, stack, rushQueued: true });
const bot = (id) => ({ id, stack: 50_000, isBot: true });

test('poolKeyOf separates games and both blinds', () => {
  assert.equal(poolKeyOf({ game: 'rush', sb: 500, bb: 1000 }), 'rush:500/1000');
  assert.notEqual(poolKeyOf({ game: 'rush', sb: 500, bb: 1000 }), poolKeyOf({ game: 'rush', sb: 250, bb: 1000 }));
  assert.notEqual(poolKeyOf({ game: 'rush', sb: 500, bb: 1000 }), poolKeyOf({ game: 'rushplo', sb: 500, bb: 1000 }));
});

test('a folded player moves to the emptiest table of the same pool, never another stake', () => {
  const from = fakeTable({ id: 'p1', sb: 500, bb: 1000, players: [human(1), bot(90)] });
  const samePoolBusy = fakeTable({ id: 'p2', sb: 500, bb: 1000, players: [bot(91), bot(92), bot(93)] });
  const samePoolQuiet = fakeTable({ id: 'p3', sb: 500, bb: 1000, players: [bot(94)] });
  const otherStakeEmpty = fakeTable({ id: 'g1', sb: 50, bb: 100, players: [] });
  const sameBbOtherSb = fakeTable({ id: 'x1', sb: 250, bb: 1000, players: [] });
  const { pool, transfers, sent } = poolWorld([from, samePoolBusy, samePoolQuiet, otherStakeEmpty, sameBbOtherSb]);

  pool.moveQueued(from);

  assert.deepEqual(transfers, [{ userId: 1, from: 'p1', to: 'p3' }]);
  assert.deepEqual(sent, [{ type: 'rush_move', tableId: 'p3', stack: 50_000 }]);
  assert.equal(pool.waitingList().length, 0);
});

test('with its pool full the player waits, even when other stakes have room, then flushes within the pool', () => {
  const from = fakeTable({ id: 'p1', sb: 500, bb: 1000, seats: 2, players: [human(1), bot(90)] });
  const full = fakeTable({ id: 'p2', sb: 500, bb: 1000, seats: 2, players: [bot(91), bot(92)] });
  const otherStake = fakeTable({ id: 'g1', sb: 50, bb: 100, seats: 6, players: [] });
  const { pool, transfers, sent } = poolWorld([from, full, otherStake]);

  pool.moveQueued(from);
  assert.deepEqual(transfers, [], 'no transfer out of the pool');
  assert.deepEqual(pool.waitingList(), [{ userId: 1, poolKey: 'rush:500/1000', fromTable: 'p1', stack: 50_000, since: 1000 }]);
  assert.equal(from.seatOf(1).player.sittingOut, true);
  assert.deepEqual(sent, [{ type: 'rush_queued' }]);

  pool.flush();
  assert.deepEqual(transfers, [], 'still no seat in the pool');

  full.seats[1].player = null; // a seat opens in the same pool
  pool.flush();
  assert.deepEqual(transfers, [{ userId: 1, from: 'p1', to: 'p2' }]);
  assert.equal(pool.waitingList().length, 0);
});

test('flush waits while the source hand is still running', () => {
  const from = fakeTable({ id: 'p1', sb: 500, bb: 1000, seats: 2, players: [human(1), bot(90)] });
  const target = fakeTable({ id: 'p2', sb: 500, bb: 1000, seats: 2, players: [bot(91), bot(92)] });
  const { pool, transfers } = poolWorld([from, target]);
  pool.moveQueued(from);
  target.seats[1].player = null;
  from.street = 'flop';
  pool.flush();
  assert.deepEqual(transfers, []);
  from.street = 'idle';
  pool.flush();
  assert.deepEqual(transfers, [{ userId: 1, from: 'p1', to: 'p2' }]);
});

test('settleHand rolls the Cash Drop only for Rush hands and emits the felt event', () => {
  const table = fakeTable({ id: 'p1', sb: 500, bb: 1000 });
  const { pool } = poolWorld([table]);
  const players = [{ id: 1, nick: 'A' }, { id: 2, nick: 'B', isBot: true }];
  assert.equal(pool.settleHand({ game: 'holdem', handId: 'h0', players }, table), null);
  let drop = null;
  for (let i = 0; i < 500 && !drop; i++) drop = pool.settleHand({ game: 'rush', handId: `h${i + 1}`, players }, table);
  assert.ok(drop, 'a drop fires at the default rate within 500 hands');
  assert.equal(drop.userId, 1, 'bots are never eligible');
  assert.equal(drop.amount, 1000 * CASHDROP_DEFAULTS.amountBb);
  assert.deepEqual(table.events.at(-1), { type: 'cashdrop', nick: 'A', amount: drop.amount, rule: CASHDROP_RULE_LABEL });
});

/* ------------------------------------------------------------------ */
/* R5: fair queue service per pool                                     */
/* ------------------------------------------------------------------ */

const POOLS = Object.freeze([
  Object.freeze({ game: 'rush', sb: 500, bb: 1000 }),
  Object.freeze({ game: 'rushplo', sb: 500, bb: 1000 }),
]);

/** Each pool: one 2-seat source table per player (player + bot) and 3 full 6-seat bot tables. */
function busyPools(playersPerPool) {
  const tables = [];
  const sources = [];
  let botId = 500;
  POOLS.forEach((stake, pi) => {
    for (let i = 0; i < 3; i++) {
      tables.push(fakeTable({ id: `t${pi}-${i}`, ...stake, players: Array.from({ length: 6 }, () => bot(botId++)) }));
    }
    for (let i = 0; i < playersPerPool; i++) {
      const userId = pi * playersPerPool + i + 1;
      const source = fakeTable({ id: `s${pi}-${i}`, ...stake, seats: 2, players: [human(userId), bot(botId++)] });
      tables.push(source);
      sources.push({ userId, poolKey: poolKeyOf(stake), table: source });
    }
  });
  return { tables, sources };
}

/** Free one bot seat on a random bot table of a random pool. */
function openRandomSeat(rng, tables) {
  const candidates = tables.filter((t) => t.cfg.id.startsWith('t') && t.seats.some((s) => s.player?.isBot));
  const table = candidates[Math.floor(rng() * candidates.length)];
  const botSeats = table.seats.filter((s) => s.player?.isBot);
  botSeats[Math.floor(rng() * botSeats.length)].player = null;
}

for (const seed of [1, 7, 42, 2026, 31337]) {
  test(`20 queued players, seats opening in random order (seed ${seed}): served in arrival order within each pool`, () => {
    const rng = seededRng(seed);
    const { tables, sources } = busyPools(10);
    let clock = 0;
    const { pool, transfers } = poolWorld(tables, { now: () => ++clock, refill: true });
    const order = [...sources].sort(() => rng() - 0.5); // random arrival order across both pools
    const arrived = [];
    for (let step = 0; step < 2000 && transfers.length < sources.length; step++) {
      const roll = rng();
      if (roll < 0.4 && arrived.length < order.length) {
        const next = order[arrived.length];
        arrived.push(next);
        pool.moveQueued(next.table);
      } else if (roll < 0.7) {
        openRandomSeat(rng, tables); // a seat opens; the next flush (or a newer folder) may see it
      } else {
        pool.flush();
      }
      for (const stake of POOLS) {
        assert.ok(pool.poolQueue(poolKeyOf(stake)).every((w) => w.passes === 0), 'nobody is passed over when every hand has ended');
      }
    }

    assert.equal(transfers.length, sources.length, 'every player is eventually served');
    const poolOfTable = new Map(tables.map((t) => [t.cfg.id, poolKeyOf(t.cfg)]));
    for (const t of transfers) assert.equal(poolOfTable.get(t.to), poolOfTable.get(t.from), `no cross-pool move for ${t.userId}`);
    for (const stake of POOLS) {
      const key = poolKeyOf(stake);
      const arrivalOrder = arrived.filter((s) => s.poolKey === key).map((s) => s.userId);
      const serviceOrder = transfers.filter((t) => poolOfTable.get(t.from) === key).map((t) => t.userId);
      assert.deepEqual(serviceOrder, arrivalOrder, `service order = arrival order in ${key}`);
    }
    assert.deepEqual(pool.waitingList(), []);
  });
}

test('a new folder joins the back of a non-empty queue instead of taking an open seat first', () => {
  const { tables, sources } = busyPools(2);
  let clock = 0;
  const { pool, transfers } = poolWorld(tables, { now: () => ++clock, refill: true });
  pool.moveQueued(sources[0].table); // user 1 waits: the pool is full
  tables.find((t) => t.cfg.id === 't0-0').seats[0].player = null; // a seat opens before the next flush
  pool.moveQueued(sources[1].table); // user 2 folds now
  assert.deepEqual(transfers, [], 'user 2 does not jump user 1');
  assert.deepEqual(pool.poolQueue('rush:500/1000').map((w) => [w.userId, w.position]), [[1, 1], [2, 2]]);
  pool.flush();
  assert.deepEqual(transfers.map((t) => t.userId), [1]);
  assert.deepEqual(pool.poolQueue('rush:500/1000').map((w) => w.userId), [2]);
});

test('a re-queued player keeps their original place and arrival time', () => {
  const { tables, sources } = busyPools(2);
  let clock = 100;
  const { pool } = poolWorld(tables, { now: () => ++clock, refill: true });
  pool.moveQueued(sources[0].table);
  pool.moveQueued(sources[1].table);
  pool.moveQueued(sources[0].table); // the next hand at user 1's old table ends
  assert.deepEqual(pool.poolQueue('rush:500/1000').map((w) => [w.userId, w.since]), [[1, 101], [2, 102]]);
});

test(`starvation bound: a waiting player mid-hand is passed over at most ${RUSH_MAX_PASSES} flushes`, () => {
  const { tables, sources } = busyPools(5);
  let clock = 0;
  const { pool, transfers } = poolWorld(tables, { now: () => ++clock, refill: true });
  const key = 'rush:500/1000';
  for (const s of sources.filter((x) => x.poolKey === key)) pool.moveQueued(s.table);
  const oldest = sources[0];
  oldest.table.street = 'flop'; // their old table dealt a new hand before they could move
  const target = tables.find((t) => t.cfg.id === 't0-0');
  const openSeat = () => { target.seats.find((s) => s.player?.isBot).player = null; };
  const served = () => transfers.map((t) => t.userId);
  const passesOfOldest = () => pool.poolQueue(key).find((w) => w.userId === oldest.userId)?.passes;

  openSeat(); pool.flush();
  assert.deepEqual(served(), [2]);
  assert.equal(passesOfOldest(), 1);
  openSeat(); pool.flush();
  assert.deepEqual(served(), [2, 3]);
  assert.equal(passesOfOldest(), RUSH_MAX_PASSES);

  openSeat(); pool.flush(); pool.flush();
  assert.deepEqual(served(), [2, 3], 'the open seat is held for the oldest player');
  assert.equal(passesOfOldest(), RUSH_MAX_PASSES, 'never passed over a third time');

  oldest.table.street = 'ended';
  pool.flush();
  assert.deepEqual(served(), [2, 3, 1]);
  openSeat(); pool.flush();
  assert.deepEqual(served(), [2, 3, 1, 4]);
  for (const t of transfers) assert.equal(poolKeyOf(tables.find((x) => x.cfg.id === t.to).cfg), key);
});

test('a waiting player whose old seat is gone leaves the queue without blocking the next one', () => {
  const { tables, sources } = busyPools(2);
  let clock = 0;
  const { pool, transfers } = poolWorld(tables, { now: () => ++clock, refill: true });
  pool.moveQueued(sources[0].table);
  pool.moveQueued(sources[1].table);
  sources[0].table.seats[0].player = null; // user 1 left the room
  tables.find((t) => t.cfg.id === 't0-1').seats[2].player = null;
  pool.flush();
  assert.deepEqual(transfers.map((t) => t.userId), [2]);
  assert.deepEqual(pool.waitingList(), []);
});

test('a Rush move carries the player\'s Time Bank Cards and refill progress', () => {
  const from = fakeTable({ id: 'p1', sb: 500, bb: 1000, players: [{ ...human(1), timeBankCards: 1, timeBankHands: 7 }, bot(90)] });
  const to = fakeTable({ id: 'p2', sb: 500, bb: 1000, players: [bot(91)] });
  const { pool, seatedUsers } = poolWorld([from, to]);
  pool.moveQueued(from);
  assert.deepEqual([seatedUsers[0].timeBankCards, seatedUsers[0].timeBankHands], [1, 7]);
});
