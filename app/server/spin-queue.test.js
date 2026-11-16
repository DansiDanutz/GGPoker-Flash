import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ensureSpinStore, registerSpin, cancelSpinRegistration, cancelQuarantinedSpin, acknowledgeSpin, spinRegistration, settleSpinEntrant, spinPlaceExposures, fundHouse, houseAccount } from './spin-queue.js';
import { quarantineGameCheckpoint, saveGameCheckpoint } from './game-checkpoints.js';
import { PokerTable } from './table.js';
import { activateSpinTable, syncSpinPresentation } from './spin-runtime.js';
import { persistSpinCheckpoint, restoreSpinCheckpoint } from './spin-recovery.js';
import { spinPayouts } from './spin.js';

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, balance INTEGER NOT NULL);
    CREATE TABLE tables (id TEXT PRIMARY KEY, name TEXT, game TEXT, category TEXT, sb INTEGER, bb INTEGER, ante INTEGER, min_buyin INTEGER, max_buyin INTEGER, seats INTEGER, speed TEXT, featured INTEGER, enabled INTEGER, sort INTEGER, rimt_mode TEXT);
    CREATE TABLE transactions (id INTEGER PRIMARY KEY, user_id INTEGER, kind TEXT, currency TEXT, amount INTEGER, balance_after INTEGER, memo TEXT, session_id TEXT, reference TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE UNIQUE INDEX idx_transactions_reference ON transactions(user_id, reference);`);
  ensureSpinStore(db);
  for (let id = 1; id <= 4; id++) db.prepare('INSERT INTO users (id,balance) VALUES (?,1000000)').run(id);
  fundHouse(db, { scope: 'spin3:5000', actorId: 1, operationId: 'fund-spin', amount: 200000000 });
  fundHouse(db, { scope: 'spin3-insurance:5000', actorId: 1, operationId: 'fund-insurance', amount: 1000000 });
  const config = { rows: spinPayouts(5000).map((row) => ({ ...row, startingChips: 500, timeBankCards: 3, actionSeconds: 15, secondsPerCard: 10, maxCardsPerAction: 3 })) };
  db.prepare("UPDATE spin_rules SET config_json = ?, insurance_json = '{\"premium\":100,\"payout\":1000}' WHERE mode = '3max' AND stake = 5000").run(JSON.stringify(config));
  return db;
}

test('three independent registrations create one funded cohort and replay safely', () => {
  const db = setup();
  let eventId;
  for (let actorId = 1; actorId <= 3; actorId++) {
    const result = registerSpin(db, { actorId, operationId: `register-${actorId}`, mode: '3max', stake: 5000, expectedRevision: actorId - 1, ruleRevision: 1, insurance: false });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    eventId = result.body.state.eventId;
    if (actorId < 3) assert.equal(result.body.state.status, 'waiting');
  }
  assert.ok(eventId);
  const event = db.prepare('SELECT * FROM spin_events WHERE event_id = ?').get(eventId);
  assert.equal(event.status, 'presentation');
  assert.ok(Number.isSafeInteger(event.draw_ticket));
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM spin_event_entrants WHERE event_id = ?').get(eventId).count, 3);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 3').get().balance, 995000);
  const replay = registerSpin(db, { actorId: 3, operationId: 'register-3', mode: '3max', stake: 5000, expectedRevision: 2, ruleRevision: 1, insurance: false });
  assert.deepEqual(replay.body.state, { registrationId: replay.body.state.registrationId, eventId, status: 'matched' });
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 3').get().balance, 995000);
});

test('waiting cancellation refunds entry and premium once and releases holds', () => {
  const db = setup();
  const registered = registerSpin(db, { actorId: 1, operationId: 'register-cancel', mode: '3max', stake: 5000, expectedRevision: 0, ruleRevision: 1, insurance: true });
  const registrationId = registered.body.state.registrationId;
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 1').get().balance, 994900);
  const cancelled = cancelSpinRegistration(db, { actorId: 1, registrationId, expectedRevision: 0, operationId: 'cancel-1' });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(cancelled.body.state.status, 'cancelled');
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 1').get().balance, 1000000);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM house_reservations WHERE reservation_id LIKE 'spin-%' AND status = 'active'").get().count, 0);
  assert.equal(cancelSpinRegistration(db, { actorId: 1, registrationId, expectedRevision: 0, operationId: 'cancel-1' }).body.state.status, 'cancelled');
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 1').get().balance, 1000000);
});

test('a fifth active registration is rejected before charging and presentation is ordered', () => {
  const db = setup();
  for (let index = 0; index < 3; index++) registerSpin(db, { actorId: index + 1, operationId: `active-${index}`, mode: '3max', stake: 5000, expectedRevision: index, ruleRevision: 1, insurance: false });
  registerSpin(db, { actorId: 1, operationId: 'active-3', mode: '3max', stake: 5000, expectedRevision: 3, ruleRevision: 1, insurance: false });
  registerSpin(db, { actorId: 1, operationId: 'active-4', mode: '3max', stake: 5000, expectedRevision: 4, ruleRevision: 1, insurance: false });
  registerSpin(db, { actorId: 1, operationId: 'active-4b', mode: '3max', stake: 5000, expectedRevision: 5, ruleRevision: 1, insurance: false });
  const fifth = registerSpin(db, { actorId: 1, operationId: 'active-5', mode: '3max', stake: 5000, expectedRevision: 6, ruleRevision: 1, insurance: false });
  assert.equal(fifth.status, 409);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 1').get().balance, 980000);
  const eventId = db.prepare("SELECT event_id FROM spin_registrations WHERE operation_id = 'active-0'").get().event_id;
  assert.equal(acknowledgeSpin(db, { actorId: 1, eventId, expectedRevision: 1, operationId: 'present-wheel', stage: 'wheel' }).status, 200);
  assert.equal(acknowledgeSpin(db, { actorId: 1, eventId, expectedRevision: 2, operationId: 'present-insurance', stage: 'insurance' }).status, 409);
  assert.equal(acknowledgeSpin(db, { actorId: 1, eventId, expectedRevision: 2, operationId: 'present-ready', stage: 'ready' }).status, 200);
  assert.equal(acknowledgeSpin(db, { actorId: 1, eventId, expectedRevision: 3, operationId: 'present-ready-again', stage: 'ready' }).status, 409);
  assert.equal(acknowledgeSpin(db, { actorId: 1, eventId, expectedRevision: 2, operationId: 'present-ready', stage: 'ready' }).status, 200);
  assert.equal(spinRegistration(db, 1, db.prepare("SELECT registration_id FROM spin_registrations WHERE operation_id = 'active-0'").get().registration_id).eventId, eventId);
});


test('x2 insurance pays once at outcome commit and presentation follows each purchase', () => {
  const db = setup();
  let eventId;
  for (const actorId of [1, 2, 3]) {
    const result = registerSpin(db, { actorId, operationId: `insured-${actorId}`, mode: '3max', stake: 5000, expectedRevision: actorId - 1, ruleRevision: 1, insurance: actorId !== 2 }, { drawTicket: 99_999_999 });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    eventId = result.body.state.eventId;
  }
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 1').get().balance, 995900);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 2').get().balance, 995000);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 3').get().balance, 995900);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM spin_insurance_settlements WHERE event_id = ? AND payout = 1000').get(eventId).count, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM house_reservations WHERE scope = 'spin3-insurance:5000' AND status = 'active'").get().count, 0);
  assert.equal(houseAccount(db, 'spin3-insurance:5000').settled_net, -1800);
  assert.equal(acknowledgeSpin(db, { actorId: 1, eventId, expectedRevision: 1, operationId: 'insured-wheel', stage: 'wheel' }).status, 200);
  assert.equal(acknowledgeSpin(db, { actorId: 1, eventId, expectedRevision: 2, operationId: 'insured-ready-early', stage: 'ready' }).status, 409);
  assert.equal(acknowledgeSpin(db, { actorId: 1, eventId, expectedRevision: 2, operationId: 'insured-stage', stage: 'insurance' }).status, 200);
  assert.equal(acknowledgeSpin(db, { actorId: 1, eventId, expectedRevision: 3, operationId: 'insured-ready', stage: 'ready' }).status, 200);
  assert.equal(acknowledgeSpin(db, { actorId: 2, eventId, expectedRevision: 4, operationId: 'uninsured-wheel', stage: 'wheel' }).status, 200);
  assert.equal(acknowledgeSpin(db, { actorId: 2, eventId, expectedRevision: 5, operationId: 'uninsured-ready', stage: 'ready' }).status, 200);
});

test('all three places consume only house exposure and finish the event without duplicate credits', () => {
  const db = setup();
  let eventId;
  for (const actorId of [1, 2, 3]) {
    const result = registerSpin(db, { actorId, operationId: `settle-${actorId}`, mode: '3max', stake: 5000, expectedRevision: actorId - 1, ruleRevision: 1, insurance: false }, { drawTicket: 5 });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    eventId = result.body.state.eventId;
  }
  assert.deepEqual(spinPlaceExposures([300000, 150000, 50000], 5000), [295000, 145000, 45000]);
  assert.equal(houseAccount(db, 'spin3:5000').reserved, 485000);
  const table = { cfg: { id: `spin:${eventId}` } };
  const finishes = [
    { id: 2, place: 3, payout: 50000, remaining: 440000 },
    { id: 3, place: 2, payout: 150000, remaining: 295000 },
    { id: 1, place: 1, payout: 300000, remaining: 0 },
  ];
  let credits = 0;
  for (const finish of finishes) {
    const result = settleSpinEntrant(db, table, finish, () => { credits++; return { applied: true }; });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.state.houseExposure, finish.payout - 5000);
    assert.equal(db.prepare('SELECT status FROM spin_registrations WHERE actor_id = ? AND event_id = ?').get(finish.id, eventId).status, 'settled');
    assert.equal(houseAccount(db, 'spin3:5000').reserved, finish.remaining);
  }
  assert.equal(credits, 3);
  assert.equal(db.prepare('SELECT status FROM spin_events WHERE event_id = ?').get(eventId).status, 'finished');
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM spin_registrations WHERE event_id = ? AND status = 'settled'").get(eventId).count, 3);
  assert.equal(houseAccount(db, 'spin3:5000').settled_net, -485000);
  const replay = settleSpinEntrant(db, table, finishes[2], () => { credits++; return { applied: true }; });
  assert.equal(replay.status, 200);
  assert.equal(replay.replayed, true);
  assert.equal(credits, 3);
});

test('zero-exposure prizes and insufficient house funds never create liability or charge a player', () => {
  const db = setup();
  assert.deepEqual(spinPlaceExposures([10000, 0, 0], 5000), [0, 0, 0]);
  db.prepare('DELETE FROM house_accounts WHERE scope = ?').run('spin3:5000');
  db.prepare('INSERT INTO house_accounts (scope,available,reserved,funded,settled_net,revision) VALUES (?,0,0,0,0,0)').run('spin3:5000');
  const rejected = registerSpin(db, { actorId: 1, operationId: 'underfunded', mode: '3max', stake: 5000, expectedRevision: 0, ruleRevision: 1, insurance: false });
  assert.equal(rejected.status, 409, JSON.stringify(rejected.body));
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 1').get().balance, 1000000);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM spin_registrations').get().count, 0);
  const recapitalized = fundHouse(db, { scope: 'spin3:5000', actorId: 0, operationId: 'refund-capital', amount: 200000000 });
  assert.equal(recapitalized.status, 200, JSON.stringify(recapitalized.body));
  assert.equal(houseAccount(db, 'spin3:5000').available, 200000000);
  const retry = registerSpin(db, { actorId: 1, operationId: 'underfunded', mode: '3max', stake: 5000, expectedRevision: 0, ruleRevision: 1, insurance: false });
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 1').get().balance, 995000);
});


test('incomplete owner timing keeps registration closed without charging', () => {
  const db = setup();
  db.prepare("UPDATE spin_rules SET config_json = ? WHERE mode = '3max' AND stake = 5000").run(JSON.stringify({ rows: spinPayouts(5000) }));
  const result = registerSpin(db, { actorId: 1, operationId: 'incomplete-rules', mode: '3max', stake: 5000, expectedRevision: 0, ruleRevision: 1, insurance: false });
  assert.equal(result.status, 409);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 1').get().balance, 1000000);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM spin_registrations').get().count, 0);
});


test('insufficient player funds and receipt write failures leave no financial mutation', () => {
  const db = setup();
  db.prepare('UPDATE users SET balance = 4999 WHERE id = 1').run();
  const underfunded = registerSpin(db, { actorId: 1, operationId: 'underfunded-player', mode: '3max', stake: 5000, expectedRevision: 0, ruleRevision: 1, insurance: false });
  assert.equal(underfunded.status, 409);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 1').get().balance, 4999);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM spin_registrations').get().count, 0);
  db.prepare('UPDATE users SET balance = 1000000 WHERE id = 1').run();
  db.exec("CREATE TRIGGER reject_receipt BEFORE INSERT ON operation_receipts BEGIN SELECT RAISE(ABORT,'injected receipt failure'); END");
  const failed = registerSpin(db, { actorId: 1, operationId: 'atomic-receipt', mode: '3max', stake: 5000, expectedRevision: 0, ruleRevision: 1, insurance: false });
  assert.equal(failed.status, 500);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 1').get().balance, 1000000);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM spin_registrations').get().count, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM house_ledger WHERE operation_id = 'atomic-receipt'").get().count, 0);
  db.exec('DROP TRIGGER reject_receipt');
  const retry = registerSpin(db, { actorId: 1, operationId: 'atomic-receipt', mode: '3max', stake: 5000, expectedRevision: 0, ruleRevision: 1, insurance: false });
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(registerSpin(db, { actorId: 1, operationId: 'atomic-receipt', mode: '3max', stake: 5000, expectedRevision: 0, ruleRevision: 1, insurance: false }).replayed, true);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 1').get().balance, 995000);
});

test('waiting cancellation refunds the purchased premium after owner terms change', () => {
  const db = setup();
  const registered = registerSpin(db, { actorId: 1, operationId: 'immutable-premium', mode: '3max', stake: 5000, expectedRevision: 0, ruleRevision: 1, insurance: true });
  const registrationId = registered.body.state.registrationId;
  db.prepare("UPDATE spin_rules SET insurance_json = NULL WHERE mode = '3max' AND stake = 5000").run();
  const cancelled = cancelSpinRegistration(db, { actorId: 1, registrationId, expectedRevision: 0, operationId: 'cancel-immutable-premium' });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 1').get().balance, 1000000);
  assert.equal(houseAccount(db, 'spin3-insurance:5000').settled_net, 0);
});

test('quarantine cancellation refunds entries and only unreceipted premiums once', () => {
  const db = setup();
  let eventId;
  for (const actorId of [1, 2, 3]) {
    const result = registerSpin(db, { actorId, operationId: `quarantine-${actorId}`, mode: '3max', stake: 5000, expectedRevision: actorId - 1, ruleRevision: 1, insurance: actorId !== 2 }, { drawTicket: 99999999 });
    eventId = result.body.state.eventId;
  }
  db.prepare('DELETE FROM spin_insurance_settlements WHERE registration_id = (SELECT registration_id FROM spin_registrations WHERE actor_id = 1 AND event_id = ?)').run(eventId);
  saveGameCheckpoint(db, { roomId: `spin:${eventId}`, kind: 'spin', operationId: 'quarantine-fixture', rules: {}, state: {} });
  quarantineGameCheckpoint(db, `spin:${eventId}`, 'spin', 'injected recovery failure');
  const cancelled = cancelQuarantinedSpin(db, { actorId: 99, eventId, expectedRevision: 1, operationId: 'cancel-quarantined-event' });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.deepEqual(cancelled.body.state, { eventId, status: 'cancelled', refundedEntries: 3, refundedPremiums: 1 });
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 1').get().balance, 1001000);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 2').get().balance, 1000000);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 3').get().balance, 1000900);
  assert.equal(houseAccount(db, 'spin3:5000').reserved, 0);
  assert.equal(houseAccount(db, 'spin3-insurance:5000').settled_net, -1900);
  const replay = cancelQuarantinedSpin(db, { actorId: 99, eventId, expectedRevision: 1, operationId: 'cancel-quarantined-event' });
  assert.equal(replay.replayed, true);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 1').get().balance, 1001000);
});

test('quarantine cancellation is blocked after any actual place settlement', () => {
  const db = setup();
  let eventId;
  for (const actorId of [1, 2, 3]) eventId = registerSpin(db, { actorId, operationId: `settled-quarantine-${actorId}`, mode: '3max', stake: 5000, expectedRevision: actorId - 1, ruleRevision: 1, insurance: false }, { drawTicket: 5 }).body.state.eventId;
  assert.equal(settleSpinEntrant(db, { cfg: { id: `spin:${eventId}` } }, { id: 1, place: 3, payout: 50000 }, () => ({ applied: true })).status, 200);
  saveGameCheckpoint(db, { roomId: `spin:${eventId}`, kind: 'spin', operationId: 'settled-quarantine-fixture', rules: {}, state: {} });
  quarantineGameCheckpoint(db, `spin:${eventId}`, 'spin', 'injected recovery failure');
  const cancelled = cancelQuarantinedSpin(db, { actorId: 99, eventId, expectedRevision: 2, operationId: 'blocked-settled-quarantine' });
  assert.equal(cancelled.status, 409);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM spin_registrations WHERE event_id = ? AND status = 'matched'").get(eventId).count, 2);
});


test('a multi-place checkpoint remains restorable after the first payout', () => {
  const db = setup();
  let eventId;
  for (const actorId of [1, 2, 3]) eventId = registerSpin(db, { actorId, operationId: `restart-after-place-${actorId}`, mode: '3max', stake: 5000, expectedRevision: actorId - 1, ruleRevision: 1, insurance: false }, { drawTicket: 5 }).body.state.eventId;
  const users = db.prepare(`SELECT u.*,e.entrant_order,r.registration_id FROM spin_event_entrants e JOIN spin_registrations r ON r.registration_id=e.registration_id JOIN users u ON u.id=r.actor_id WHERE e.event_id=? ORDER BY e.entrant_order`).all(eventId).map((user) => ({ ...user, registration: { registration_id: user.registration_id, entrant_order: user.entrant_order } }));
  const cfg = db.prepare('SELECT * FROM tables WHERE id = ?').get(`spin:${eventId}`);
  const table = new PokerTable(cfg);
  activateSpinTable(table, db.prepare('SELECT * FROM spin_events WHERE event_id = ?').get(eventId), users);
  assert.equal(settleSpinEntrant(db, table, { id: 2, place: 3, payout: 50000 }, () => ({ applied: true })).status, 200);
  table.seats[table.seatOf(2).index].player = null;
  const event = db.prepare('SELECT * FROM spin_events WHERE event_id = ?').get(eventId);
  syncSpinPresentation(table, event);
  persistSpinCheckpoint(db, table, 'first-place-payout');
  const restored = new PokerTable(cfg);
  activateSpinTable(restored, event, users);
  assert.doesNotThrow(() => restoreSpinCheckpoint(db, restored, event));
  assert.equal(restored.spinPresentation.revision, event.presentation_revision);
});


test('a cohort requires distinct authenticated accounts and leaves later entries waiting', () => {
  const db = setup();
  for (let index = 0; index < 4; index++) {
    const result = registerSpin(db, { actorId: 1, operationId: `duplicate-account-${index}`, mode: '3max', stake: 5000, expectedRevision: index, ruleRevision: 1, insurance: false });
    assert.equal(result.status, 200, JSON.stringify(result.body));
  }
  for (let index = 0; index < 2; index++) {
    const result = registerSpin(db, { actorId: 2, operationId: `second-account-${index}`, mode: '3max', stake: 5000, expectedRevision: 4 + index, ruleRevision: 1, insurance: false });
    assert.equal(result.status, 200, JSON.stringify(result.body));
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM spin_events').get().count, 0);
  fundHouse(db, { scope: 'spin3:5000', actorId: 0, operationId: 'fund-distinct-cohort', amount: 200000000 });
  const third = registerSpin(db, { actorId: 3, operationId: 'third-account', mode: '3max', stake: 5000, expectedRevision: 6, ruleRevision: 1, insurance: false });
  assert.equal(third.status, 200, JSON.stringify({ result: third.body, house: houseAccount(db, 'spin3:5000') }));
  const eventId = third.body.state.eventId;
  assert.ok(eventId);
  assert.deepEqual(db.prepare('SELECT DISTINCT actor_id FROM spin_registrations WHERE event_id = ? ORDER BY actor_id').all(eventId).map((row) => row.actor_id), [1, 2, 3]);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM spin_registrations WHERE event_id IS NULL AND status = 'waiting'").get().count, 4);
});
