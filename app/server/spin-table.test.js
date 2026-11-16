// P0 slices S1b/S1c: the live Jackpot SNG table draws from the verified table (server/spin.js),
// pays places 1-3 through the ledger exactly once and steps the verified blind schedule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const serverDir = import.meta.dirname;
process.env.GGPOKER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-spin-table-'));
const { db, addTransactionEx } = await import('./db.js');
const { PokerTable } = await import('./table.js');
const { settleSpinPayout, closeSpinSession } = await import('./spin-ledger.js');
const { isSpinStake, spinOutcome, spinPayouts } = await import('./spin.js');
const { registerSpin, spinQueueState, settleSpinEntrant, fundHouse, houseAccount, ensureSpinStore } = await import('./spin-queue.js');

const STAKE = 10000;
const TICKET_100X = 5; // first ticket of the 100x row (60/30/10)
const TICKET_10X = 12005; // first ticket of the 10x row (80/20)
const TICKET_2X = 99_999_999; // last ticket, the 2x row (1-minute levels)
const MINUTE = 60_000;
let userSeq = 0;
let tableSeq = 0;

function makeUser() {
  userSeq += 1;
  const login = `spin_s1b_${userSeq}`;
  const info = db.prepare('INSERT INTO users (login, nick, password, balance) VALUES (?,?,?,?)')
    .run(login, `Spinner${userSeq}`, 'x', 100000);
  return Number(info.lastInsertRowid);
}

const balance = (id) => db.prepare('SELECT balance FROM users WHERE id = ?').get(id).balance;

// Seats three humans the way index.js seatHuman does: buy-in debit on a session, then sit.
function spinTable({ stake = STAKE, ticket = TICKET_100X, clock = null } = {}) {
  tableSeq += 1;
  const id = `spin-test-${tableSeq}`;
  const t = new PokerTable({
    id, name: `Spin Test ${tableSeq}`, game: 'spingold', category: 'Spin', sb: 10, bb: 20, ante: 0,
    min_buyin: stake, max_buyin: stake, seats: 3, speed: 'Fast',
  });
  const tickets = [];
  t.spinTicket = () => { tickets.push(ticket); return ticket; };
  if (clock) t.spinClock = () => clock.now;
  t.hooks = { onSpinPayout: (table, p) => settleSpinPayout(table, p), onHandComplete: () => {} };
  const users = [makeUser(), makeUser(), makeUser()];
  const start = users.map(balance);
  t.holdStart = true;
  users.forEach((uid, i) => {
    const sessionId = `${id}:s${i}`;
    addTransactionEx(uid, 'buyin', -stake, 'Buy-in', 'USD', { sessionId, reference: `in:${sessionId}:1`, onDuplicate: 'skip' });
    t.sit({ id: uid, nick: `Spinner${uid}` }, i, stake, sessionId);
  });
  t.holdStart = false;
  t.maybeStart();
  return { t, users, start, tickets };
}

const playerOf = (t, uid) => t.seatOf(uid)?.player;

// End the running hand with the given stacks, then let the table settle eliminations.
function settleHand(t, stacks) {
  for (const [uid, stack] of stacks) {
    const p = playerOf(t, uid);
    if (p) Object.assign(p, { stack, inHand: false, folded: true });
  }
  t.street = 'ended';
  t.nextHandAt = 1;
  t.tick(2);
}

const paidTotal = (users, start) => users.reduce((sum, uid, i) => sum + balance(uid) - (start[i] - STAKE), 0);

test('a full spin draws once from the verified table and pays 1st/2nd/3rd exactly', () => {
  const { t, users, start, tickets } = spinTable();
  const expected = spinOutcome(STAKE, TICKET_100X);
  assert.equal(tickets.length, 1, 'one ticket per Spin');
  assert.equal(t.spinMultiplier, 100);
  assert.equal(t.spinPrize, 1_000_000);
  assert.deepEqual([...t.spinPayouts], expected.prizes);
  assert.deepEqual([...t.spinPayouts], [600000, 300000, 100000]);

  const [first, second, third] = users;
  settleHand(t, [[third, 0], [first, 20000], [second, 10000]]);
  assert.equal(balance(third), start[2] - STAKE + 100000, '3rd place paid on bust');
  settleHand(t, [[second, 0], [first, 30000]]);
  assert.equal(balance(second), start[1] - STAKE + 300000, '2nd place paid on bust');
  assert.equal(balance(first), start[0] - STAKE + 600000, 'winner paid 1st place');
  assert.deepEqual(t.spinWinner, { nick: `Spinner${first}`, id: first, prize: 600000 });
  assert.deepEqual(t.finished.map((f) => [f.id, f.place, f.payout]),
    [[third, 3, 100000], [second, 2, 300000], [first, 1, 600000]]);
  assert.equal(paidTotal(users, start), t.spinPrize, 'payouts sum to the prize pool');

  // No double pay: re-awarding, re-settling and the winner cashing out change nothing.
  t.awardSpinWinner();
  for (const f of t.finished) {
    assert.equal(settleSpinPayout(t, { ...f, sessionId: `${t.cfg.id}:s${users.indexOf(f.id)}`, isBot: false }).applied, false);
  }
  assert.equal(closeSpinSession(first, `${t.cfg.id}:s0`, 'Cash-out').applied, false);
  t.leaveSpin(first);
  assert.equal(t.finished.length, 3);
  assert.equal(paidTotal(users, start), t.spinPrize);
  const outs = db.prepare("SELECT COUNT(*) c FROM transactions WHERE session_id LIKE ? AND reference LIKE 'out:%'").get(`${t.cfg.id}:%`).c;
  assert.equal(outs, 3, 'one closing transaction per seat');
});

test('a registered cohort pays real table finishers and conserves the funded house account', () => {
  ensureSpinStore(db);
  const config = { rows: spinPayouts(STAKE).map((row) => ({ ...row, startingChips: 500, timeBankCards: 3, actionSeconds: 15, secondsPerCard: 10, maxCardsPerAction: 3 })) };
  db.prepare("UPDATE spin_rules SET config_json = ? WHERE mode = '3max' AND stake = ?").run(JSON.stringify(config), STAKE);
  fundHouse(db, { scope: 'spin3:10000', actorId: 0, operationId: `fund-registered-${tableSeq}`, amount: 200000000 });
  const users = [makeUser(), makeUser(), makeUser()];
  const starting = users.map(balance);
  let eventId;
  users.forEach((uid, index) => {
    const result = registerSpin(db, {
      actorId: uid, operationId: `registered-table-${tableSeq}-${index}`, mode: '3max', stake: STAKE,
      expectedRevision: index, ruleRevision: 1, insurance: false,
    }, { drawTicket: TICKET_100X });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    eventId = result.body.state.eventId;
  });
  const cfg = db.prepare('SELECT * FROM tables WHERE id = ?').get(`spin:${eventId}`);
  const t = new PokerTable(cfg);
  const event = db.prepare('SELECT * FROM spin_events WHERE event_id = ?').get(eventId);
  t.spinTicket = () => event.draw_ticket;
  t.hooks = {
    onSpinPayout: (table, finish) => {
      const result = settleSpinEntrant(db, table, finish, () => settleSpinPayout(table, finish, { database: db, joinTransaction: true }));
      if (result.status !== 200) throw new Error(result.body.message);
    },
    onHandComplete: () => {},
  };
  const entrants = db.prepare(`SELECT r.actor_id,r.registration_id,e.entrant_order FROM spin_registrations r
    JOIN spin_event_entrants e ON e.registration_id = r.registration_id WHERE e.event_id = ? ORDER BY e.entrant_order`).all(eventId);
  t.holdStart = true;
  for (const entrant of entrants) {
    t.sit({ id: entrant.actor_id, nick: `Spinner${entrant.actor_id}` }, entrant.entrant_order, STAKE, `${cfg.id}:${entrant.registration_id}`);
  }
  t.holdStart = false;
  t.maybeStart();
  const [first, second, third] = users;
  settleHand(t, [[third, 0], [first, 20000], [second, 10000]]);
  settleHand(t, [[second, 0], [first, 30000]]);
  assert.deepEqual(users.map(balance), [
    starting[0] - STAKE + 600000,
    starting[1] - STAKE + 300000,
    starting[2] - STAKE + 100000,
  ]);
  assert.equal(db.prepare('SELECT status FROM spin_events WHERE event_id = ?').get(eventId).status, 'finished');
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM spin_registrations WHERE event_id = ? AND status = 'settled'").get(eventId).count, 3);
  assert.equal(houseAccount(db, 'spin3:10000').reserved, 0);
  assert.equal(houseAccount(db, 'spin3:10000').settled_net, -970000);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM house_reservations WHERE reservation_id = ? AND status = 'active'").get(event.reservation_id).count, 0);
  t.awardSpinWinner();
  assert.deepEqual(users.map(balance), [starting[0] + 590000, starting[1] + 290000, starting[2] + 90000]);
});

test('two players busting in one hand take 2nd and 3rd and the winner is crowned', () => {
  const { t, users, start } = spinTable({ ticket: TICKET_10X });
  assert.deepEqual([...t.spinPayouts], [80000, 20000, 0]);
  const [first, second, third] = users;
  settleHand(t, [[second, 0], [third, 0], [first, 30000]]);
  const places = Object.fromEntries(t.finished.map((f) => [f.id, f.place]));
  assert.deepEqual(places, { [second]: 2, [third]: 3, [first]: 1 });
  assert.equal(balance(first), start[0] - STAKE + 80000);
  assert.equal(balance(second), start[1] - STAKE + 20000);
  assert.equal(balance(third), start[2] - STAKE, '3rd is unpaid on an 80/20 row; session closed at 0');
  assert.equal(paidTotal(users, start), t.spinPrize);
  const close = db.prepare('SELECT kind, amount FROM transactions WHERE reference = ?').get(`out:${t.cfg.id}:s2`);
  assert.deepEqual({ ...close }, { kind: 'session_close', amount: 0 });
});

test('leaving a running spin takes the lowest open place, never a cash-out of chips', () => {
  const { t, users, start } = spinTable();
  const [first, second, third] = users;
  t.leaveSpin(third);
  closeSpinSession(third, `${t.cfg.id}:s2`, 'Cash-out');
  assert.equal(balance(third), start[2] - STAKE + 100000, 'leaver paid 3rd, chips not cashed out');
  settleHand(t, [[second, 0], [first, 30000]]);
  assert.equal(t.spinWinner.id, first);
  assert.equal(paidTotal(users, start), t.spinPrize);
});

test('snapshot exposes the drawn multiplier, prize and per-place payouts', () => {
  const { t } = spinTable();
  const spin = t.snapshotFor().spin;
  assert.equal(spin.multiplier, 100);
  assert.equal(spin.prize, 1_000_000);
  assert.equal(spin.buyIn, STAKE);
  assert.deepEqual([...spin.payouts], [600000, 300000, 100000]);
  assert.equal(spin.winner, null);
});

test('a finished spin with no humans left resets to a fresh, undrawn table', () => {
  const { t, users } = spinTable();
  settleHand(t, [[users[1], 0], [users[2], 0], [users[0], 30000]]);
  assert.ok(t.spinWinner);
  t.leaveSpin(users[0]);
  assert.equal(t.resetSpinIfIdle(), true);
  assert.equal(t.spinStarted(), false);
  assert.deepEqual([t.spinPayouts, t.spinWinner, t.finished.length, t.handNo], [null, null, 0, 0]);
});

test('an unobserved stake never deals or draws', () => {
  assert.equal(isSpinStake(5000), true);
  assert.equal(isSpinStake(10000, 10000), true);
  assert.equal(isSpinStake(15000), false);
  assert.equal(isSpinStake(5000, 10000), false, 'a variable buy-in is not a Spin stake');
  const { t, tickets } = spinTable({ stake: 15000 });
  assert.equal(t.spinStakeValid(), false);
  assert.equal(t.street, 'idle');
  assert.equal(t.handNo, 0);
  assert.equal(t.spinPayouts, null);
  assert.equal(tickets.length, 0);
});

test('a spin waits for all three seats before drawing', () => {
  const t = new PokerTable({ id: 'spin-two', name: 'Two', game: 'spingold', sb: 10, bb: 20, min_buyin: 5000, max_buyin: 5000, seats: 3 });
  t.sit({ id: 'a', nick: 'A', isBot: true }, 0, 5000);
  t.sit({ id: 'b', nick: 'B', isBot: true }, 1, 5000);
  assert.equal(t.handNo, 0);
  assert.equal(t.spinStarted(), false);
  t.sit({ id: 'c', nick: 'C', isBot: true }, 2, 5000);
  assert.equal(t.handNo, 1);
  assert.equal(t.spinStarted(), true);
});

// Boots db.js in a fresh process on `dataDir` and reports the Spin rows and a re-run of the migration.
function boot(dataDir, before = '') {
  const script = `
    const { db, ensureSpinTables } = await import('./db.js');
    ${before}
    const again = ensureSpinTables();
    const rows = db.prepare("SELECT id, sb, bb, min_buyin, max_buyin, seats, enabled FROM tables WHERE game = 'spingold' ORDER BY id").all();
    process.stdout.write(JSON.stringify({ rows, again }));`;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: serverDir, env: { ...process.env, GGPOKER_DATA: dataDir }, encoding: 'utf8',
  }));
}

test('Spin seed: observed 3-max 5,000/10,000 tables only, idempotent across boots', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-spin-seed-'));
  try {
    const first = boot(dataDir);
    const enabled = first.rows.filter((r) => r.enabled);
    assert.equal(enabled.length, 8);
    assert.equal(first.rows.length, 8, 'a fresh database gets no 15,000 or 6-max rows');
    assert.deepEqual([...new Set(enabled.map((r) => r.min_buyin))].sort((a, b) => a - b), [5000, 10000]);
    for (const r of enabled) {
      assert.equal(r.max_buyin, r.min_buyin);
      assert.equal(r.seats, 3);
      assert.deepEqual([r.sb, r.bb], [10, 20]);
    }
    assert.deepEqual(first.again, { inserted: 0, disabled: 0 });
    const second = boot(dataDir);
    assert.deepEqual(second.rows, first.rows);
    assert.deepEqual(second.again, { inserted: 0, disabled: 0 });
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Spin migration disables legacy 15,000 and 6-max rows and backfills missing ones', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-spin-seed-'));
  try {
    boot(dataDir);
    const legacy = `
      const ins = db.prepare("INSERT INTO tables (id,name,game,category,sb,bb,ante,min_buyin,max_buyin,seats,speed,featured,sort) VALUES (?,?,'spingold','Spin',500,1000,0,?,?,?,'Fast',0,1)");
      ins.run('spingold-1', 'Jackpot SNG 1', 15000, 15000, 3);
      ins.run('spingold6-1', 'Jackpot SNG 6-Max 1', 30000, 30000, 6);
      db.prepare("DELETE FROM tables WHERE id = 'spingold-5000-2'").run();`;
    const migrated = boot(dataDir, legacy);
    // The boot itself ran the migration before the legacy rows existed, so the re-run does the work.
    assert.deepEqual(migrated.again, { inserted: 1, disabled: 2 });
    const byId = Object.fromEntries(migrated.rows.map((r) => [r.id, r]));
    assert.equal(byId['spingold-1'].enabled, 0);
    assert.equal(byId['spingold6-1'].enabled, 0);
    assert.equal(byId['spingold-5000-2'].enabled, 1);
    const third = boot(dataDir);
    assert.deepEqual(third.again, { inserted: 0, disabled: 0 }, 'a later boot finds nothing to do');
    assert.deepEqual(third.rows, migrated.rows);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

// S1c: verified blind schedule. `clock.now` is the injected spin clock in ms.
const blindsOf = (t) => {
  const { blindLevel, smallBlind, bigBlind } = t.snapshotFor().spin;
  return [blindLevel, smallBlind, bigBlind];
};
const keepPlaying = (t, users) => settleHand(t, users.map((uid) => [uid, 10000]));

test('a 2x spin steps blinds by elapsed minutes, not hands', () => {
  const clock = { now: 5_000_000 };
  const { t, users } = spinTable({ ticket: TICKET_2X, clock });
  assert.equal(t.spinMultiplier, 2);
  assert.equal(t.spinStartedAt, 5_000_000);
  assert.deepEqual(blindsOf(t), [1, 10, 20]);
  for (let i = 0; i < 12; i += 1) keepPlaying(t, users);
  assert.deepEqual(blindsOf(t), [1, 10, 20], 'hands alone never raise a minute-based row');
  clock.now += MINUTE - 1;
  keepPlaying(t, users);
  assert.deepEqual(blindsOf(t), [1, 10, 20]);
  clock.now += 1;
  keepPlaying(t, users);
  assert.deepEqual(blindsOf(t), [2, 15, 30]);
  assert.deepEqual([t.sb, t.bb, t.minRaise], [15, 30, 30]);
  clock.now = 5_000_000 + 5 * MINUTE;
  keepPlaying(t, users);
  assert.deepEqual(blindsOf(t), [6, 50, 100]);
});

test('a 10x spin steps blinds every 10 completed hands, not minutes', () => {
  const clock = { now: 1_000 };
  const { t, users } = spinTable({ ticket: TICKET_10X, clock });
  assert.equal(t.spinMultiplier, 10);
  clock.now += 60 * MINUTE;
  for (let i = 0; i < 9; i += 1) keepPlaying(t, users);
  assert.equal(t.handNo, 10);
  assert.deepEqual(blindsOf(t), [1, 10, 20], 'time alone never raises a hand-based row');
  keepPlaying(t, users);
  assert.equal(t.spinCompletedHands, 10);
  assert.deepEqual(blindsOf(t), [2, 15, 30]);
  for (let i = 0; i < 10; i += 1) keepPlaying(t, users);
  assert.deepEqual(blindsOf(t), [3, 20, 40]);
});

test('the spin blind schedule caps at the last level', () => {
  const clock = { now: 0 };
  const timed = spinTable({ ticket: TICKET_2X, clock });
  clock.now = 10_000 * MINUTE;
  keepPlaying(timed.t, timed.users);
  assert.deepEqual(blindsOf(timed.t), [26, 1500, 3000]);

  const counted = spinTable({ ticket: TICKET_10X });
  counted.t.handNo = 5_000;
  keepPlaying(counted.t, counted.users);
  assert.deepEqual(blindsOf(counted.t), [26, 1500, 3000]);
});

test('a reset spin clears its blind clock and level', () => {
  const clock = { now: 0 };
  const { t, users } = spinTable({ ticket: TICKET_2X, clock });
  clock.now = 3 * MINUTE;
  settleHand(t, [[users[1], 0], [users[2], 0], [users[0], 30000]]);
  t.leaveSpin(users[0]);
  assert.equal(t.resetSpinIfIdle(), true);
  assert.deepEqual([t.spinStartedAt, t.spinLevel, t.sb, t.bb], [0, 0, 10, 20]);
  assert.deepEqual(blindsOf(t), [null, null, null]);
});

test('non-spin tables keep their configured blinds and expose no spin schedule', () => {
  tableSeq += 1;
  const t = new PokerTable({
    id: `holdem-s1c-${tableSeq}`, name: 'Holdem S1c', game: 'holdem', category: 'Cash', sb: 25, bb: 50, ante: 0,
    min_buyin: 1000, max_buyin: 5000, seats: 6, speed: 'Fast',
  });
  t.spinClock = () => { throw new Error('non-spin tables never read the spin clock'); };
  t.hooks = { onHandComplete: () => {} };
  const users = [makeUser(), makeUser()];
  t.holdStart = true;
  users.forEach((uid, i) => t.sit({ id: uid, nick: `Cash${uid}` }, i, 5000, `cash-${tableSeq}:${i}`));
  t.holdStart = false;
  t.maybeStart();
  for (let i = 0; i < 20; i += 1) keepPlaying(t, users);
  assert.ok(t.handNo >= 20);
  assert.deepEqual([t.sb, t.bb], [25, 50]);
  assert.equal(t.snapshotFor().spin, null);
});


test('a failed place payout does not mark the finisher and can be retried once', () => {
  const { t, users, start } = spinTable();
  const [first, second, third] = users;
  let failures = 0;
  t.hooks.onSpinPayout = (table, finish) => {
    if (!failures++) throw new Error('injected wallet failure');
    return settleSpinPayout(table, finish);
  };
  settleHand(t, [[third, 0], [first, 20000], [second, 10000]]);
  assert.equal(t.finished.length, 0);
  assert.equal(balance(third), start[2] - STAKE);
  settleHand(t, [[third, 0], [first, 20000], [second, 10000]]);
  assert.equal(t.finished.length, 1);
  assert.equal(balance(third), start[2] - STAKE + 100000);
  settleHand(t, [[third, 0], [first, 20000], [second, 10000]]);
  assert.equal(balance(third), start[2] - STAKE + 100000);
});

test('restart preserves the per-action time-card count and actor deadline', () => {
  const { t } = spinTable();
  assert.equal(t.useTimeBank(t.actor).ok, true);
  const actor = t.actor;
  const endsAt = t.actionEndsAt;
  const restored = new PokerTable(t.cfg);
  restored.restoreRecoveryState(t.recoveryState());
  assert.deepEqual(restored.timeBankAction, { playerId: actor, used: 1 });
  assert.equal(restored.actionEndsAt, endsAt);
  assert.equal(restored.useTimeBank(actor).ok, true);
  assert.equal(restored.useTimeBank(actor).ok, false);
});


function registeredCohort(ticket = TICKET_100X) {
  ensureSpinStore(db);
  const config = { rows: spinPayouts(STAKE).map((row) => ({ ...row, startingChips: 500, timeBankCards: 3, actionSeconds: 15, secondsPerCard: 10, maxCardsPerAction: 3 })) };
  db.prepare("UPDATE spin_rules SET config_json = ? WHERE mode = '3max' AND stake = ?").run(JSON.stringify(config), STAKE);
  fundHouse(db, { scope: 'spin3:10000', actorId: 0, operationId: `fund-cohort-failure-${tableSeq}`, amount: 200000000 });
  const users = [makeUser(), makeUser(), makeUser()];
  const starting = users.map(balance);
  let eventId;
  users.forEach((uid, index) => {
    const result = registerSpin(db, { actorId: uid, operationId: `failure-cohort-${tableSeq}-${ticket}-${index}`, mode: '3max', stake: STAKE, expectedRevision: spinQueueState(db, { actorId: uid, mode: '3max', stake: STAKE }).revision, ruleRevision: 1, insurance: false }, { drawTicket: ticket });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    eventId = result.body.state.eventId;
  });
  const cfg = db.prepare('SELECT * FROM tables WHERE id = ?').get(`spin:${eventId}`);
  const t = new PokerTable(cfg);
  t.spinTicket = () => ticket;
  const entrants = db.prepare(`SELECT r.actor_id,r.registration_id,e.entrant_order FROM spin_registrations r JOIN spin_event_entrants e ON e.registration_id = r.registration_id WHERE e.event_id = ? ORDER BY e.entrant_order`).all(eventId);
  t.holdStart = true;
  for (const entrant of entrants) t.sit({ id: entrant.actor_id, nick: `Spinner${entrant.actor_id}` }, entrant.entrant_order, STAKE, `${cfg.id}:${entrant.registration_id}`);
  t.holdStart = false;
  t.maybeStart();
  return { t, users, starting, eventId };
}

function registeredLedger(t, eventId, failOnce = null) {
  const failures = new Set();
  t.hooks.onSpinPayout = (table, finish) => {
    if (failOnce === finish.id && !failures.has(finish.id)) {
      failures.add(finish.id);
      throw new Error('injected place payout failure');
    }
    const result = settleSpinEntrant(db, table, finish, () => settleSpinPayout(table, finish, { database: db, joinTransaction: true }));
    if (result.status !== 200) throw new Error(`${result.body.message}: ${JSON.stringify({ finish, house: houseAccount(db, 'spin3:10000') })}`);
  };
}

test('simultaneous bust retries preserve unique places and the exact prize pool', () => {
  const { t, users, starting, eventId } = registeredCohort();
  const [first, second, third] = users;
  registeredLedger(t, eventId, third);
  settleHand(t, [[third, 0], [second, 0], [first, 30000]]);
  const secondPlace = t.finished.find((finish) => finish.id === second).place;
  assert.equal(balance(second), starting[1] - STAKE + t.spinPayouts[secondPlace - 1]);
  assert.equal(balance(third), starting[2] - STAKE);
  assert.ok(t.seatOf(third));
  t.tick(300);
  const thirdPlace = 5 - secondPlace;
  assert.equal(balance(third), starting[2] - STAKE + t.spinPayouts[thirdPlace - 1]);
  assert.deepEqual(users.map(balance), [starting[0] - STAKE + 600000, starting[1] - STAKE + t.spinPayouts[secondPlace - 1], starting[2] - STAKE + t.spinPayouts[thirdPlace - 1]]);
  assert.deepEqual(t.finished.map((finish) => [finish.id, finish.place]).sort((a, b) => a[0] - b[0]), [[first, 1], [second, secondPlace], [third, thirdPlace]]);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE kind = 'spin_payout' AND user_id = ?").get(third).count, 1);
  assert.equal(houseAccount(db, 'spin3:10000').reserved, 0);
});

test('a failed leave payout keeps the seat and permits a successful retry', () => {
  const { t, users, starting, eventId } = registeredCohort();
  const third = users[2];
  registeredLedger(t, eventId, third);
  const sessionId = `${t.cfg.id}:${db.prepare('SELECT registration_id FROM spin_registrations WHERE actor_id = ? AND event_id = ?').get(third, eventId).registration_id}`;
  const left = t.leaveSpin(third);
  assert.equal(left.ok, false);
  assert.ok(t.seatOf(third));
  assert.equal(balance(third), starting[2] - STAKE);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM transactions WHERE user_id = ? AND reference = ?').get(third, `out:${sessionId}`).count, 0);
  const retried = t.leaveSpin(third);
  assert.equal(retried.ok, true);
  assert.equal(balance(third), starting[2] - STAKE + 100000);
  assert.equal(t.seatOf(third), undefined);
});


test('a failed leave releases its unsettled reservation and retries in finish order', () => {
  const { t, users, starting, eventId } = registeredCohort();
  const [first, second, third] = users;
  registeredLedger(t, eventId, third);
  assert.equal(t.leaveSpin(third).ok, false);
  settleHand(t, [[second, 0], [first, 30000]]);
  assert.equal(t.finished.find((finish) => finish.id === second).place, 3);
  assert.equal(balance(second), starting[1] - STAKE + 100000);
  assert.equal(t.leaveSpin(third).ok, true);
  assert.equal(balance(third), starting[2] - STAKE + 300000);
  settleHand(t, [[first, 30000]]);
  assert.ok(t.spinWinner);
  assert.deepEqual(t.finished.map((finish) => [finish.id, finish.place]), [[second, 3], [third, 2], [first, 1]]);
  assert.equal(new Set(t.finished.map((finish) => finish.place)).size, 3);
  assert.deepEqual(users.map(balance), [starting[0] + 590000, starting[1] + 90000, starting[2] + 290000]);
});

test('continued play after a failed leave pays the actual winner first prize', () => {
  const { t, users, starting, eventId } = registeredCohort();
  const [first, second, third] = users;
  registeredLedger(t, eventId, third);
  assert.equal(t.leaveSpin(third).ok, false);
  settleHand(t, [[second, 0]]);
  settleHand(t, [[first, 0]]);
  assert.equal(t.spinWinner.id, third);
  assert.equal(t.spinWinner.prize, 600000);
  assert.deepEqual(t.finished.map((finish) => [finish.id, finish.place]), [[second, 3], [first, 2], [third, 1]]);
  assert.deepEqual(users.map(balance), [starting[0] + 290000, starting[1] + 90000, starting[2] + 590000]);
});


test('a committed payout retries before later places when checkpoint persistence fails', () => {
  const { t, users, starting, eventId } = registeredCohort();
  const [first, second, third] = users;
  let checkpointFailures = 0;
  t.hooks.onSpinPayout = (table, finish) => {
    const result = settleSpinEntrant(db, table, finish, () => settleSpinPayout(table, finish, { database: db, joinTransaction: true }));
    if (result.status !== 200) throw new Error(result.body.message);
    if (finish.id === third && checkpointFailures++ === 0) {
      const error = new Error('injected post-commit checkpoint failure');
      error.spinPayoutCommitted = true;
      throw error;
    }
  };
  assert.equal(t.leaveSpin(third).ok, false);
  assert.equal(t.spinPlaceAssignments.get(third), 3);
  assert.equal(balance(third), starting[2] - STAKE + 100000);
  settleHand(t, [[second, 0]]);
  assert.equal(t.seatOf(third), undefined);
  assert.equal(t.finished.find((finish) => finish.id === third).place, 3);
  assert.equal(t.finished.find((finish) => finish.id === second).place, 2);
  assert.equal(t.spinWinner.id, first);
  assert.deepEqual(t.finished.map((finish) => [finish.id, finish.place]), [[third, 3], [second, 2], [first, 1]]);
  assert.deepEqual(users.map(balance), [starting[0] + 590000, starting[1] + 290000, starting[2] + 90000]);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE kind = 'spin_payout' AND user_id = ?").get(third).count, 1);
});

test('a committed winner payout replay crowns the winner without a duplicate payout', () => {
  const { t, users, start } = spinTable();
  const [first, second, third] = users;
  playerOf(t, second).stack = 0;
  playerOf(t, third).stack = 0;
  t.street = 'ended';
  t.nextHandAt = 0;
  let checkpointFailures = 0;
  t.hooks.onSpinPayout = (table, finish) => {
    const result = settleSpinPayout(table, finish);
    if (finish.id === first && checkpointFailures++ === 0) {
      const error = new Error('injected committed winner checkpoint failure');
      error.spinPayoutCommitted = true;
      throw error;
    }
    return result;
  };
  t.awardSpinWinner();
  assert.equal(t.spinWinner, null);
  t.tick(Date.now() + 300);
  assert.equal(t.spinWinner.id, first);
  assert.equal(t.spinWinner.prize, 600000);
  assert.equal(balance(first), start[0] - STAKE + 600000);
  assert.equal(t.finished.filter((finish) => finish.id === first).length, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE kind = 'spin_payout' AND user_id = ?").get(first).count, 1);
});

test('a failed winner payout schedules and completes its retry', () => {
  const { t, users, start } = spinTable();
  const [first, second, third] = users;
  playerOf(t, second).stack = 0;
  playerOf(t, third).stack = 0;
  t.street = 'ended';
  t.nextHandAt = 0;
  let calls = 0;
  t.hooks.onSpinPayout = (table, finish) => {
    if (finish.id === first && ++calls === 1) throw new Error('injected winner failure');
    return settleSpinPayout(table, finish);
  };
  t.awardSpinWinner();
  assert.equal(t.spinWinner, null);
  assert.ok(t.nextHandAt > 0);
  t.tick(Date.now() + 300);
  assert.ok(t.spinWinner);
  assert.equal(balance(first), start[0] - STAKE + 600000);
  assert.equal(calls, 2);
});
