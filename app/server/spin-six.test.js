import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spinSixBlindLevel, spinSixConfiguration, spinSixOutcome } from './spin-six.js';
import { fundHouse, houseAccount } from './house-bank.js';

process.env.GGPOKER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-spin-six-'));
const { db, addTransactionEx } = await import('./db.js');
const { saveSpinRules } = await import('./spin-config.js');
const { registerSpin, cancelSpinRegistration, spinQueueState, settleSpinEntrant, ensureSpinStore, spinPlaceExposures } = await import('./spin-queue.js');
const { activateSpinTable } = await import('./spin-runtime.js');
const { PokerTable } = await import('./table.js');
ensureSpinStore(db);

const config = {
  mode: 'local-practice', seats: 6, buyIn: 5000, smallBlinds: [10, 20, 40],
  clock: { actionSeconds: 15, freeTimeChipSecondsPerUnit: 10, maxTimeChipsPerAction: 3 },
  outcomes: [
    { multiplier: 2, frequency: 50000000, prizeShares: [100], startingChips: 500, timeBankCards: 3, noDealing: false, unit: 'minutes', interval: 1 },
    { multiplier: 50, frequency: 50000000, prizeShares: [50, 30, 20], startingChips: 500, timeBankCards: 3, noDealing: false, unit: 'minutes', interval: 2 },
  ],
};

test('six-seat configuration validates complete independent odds and exact prizes', () => {
  const valid = spinSixConfiguration(config);
  assert.equal(valid.outcomes.length, 2);
  assert.equal(spinSixOutcome(valid, 49999999).multiplier, 2);
  assert.equal(spinSixOutcome(valid, 50000000).multiplier, 50);
  assert.deepEqual(spinSixOutcome(valid, 50000000).prizes, [125000, 75000, 50000, 0, 0, 0]);
  assert.deepEqual(spinPlaceExposures([125000, 75000, 50000, 0, 0, 0], 5000), [120000, 70000, 30000, 0, 0, 0]);
  assert.deepEqual(spinSixBlindLevel(valid, 50, { startedAt: 0, now: 120000, completedHands: 0 }), { level: 2, smallBlind: 20, bigBlind: 40, unit: 'minutes', interval: 2 });
  assert.throws(() => spinSixConfiguration({ ...config, outcomes: [{ ...config.outcomes[0], frequency: 1 }] }), /complete/);
  assert.throws(() => spinSixConfiguration({ ...config, clock: { ...config.clock, actionSeconds: 0 } }), /complete/);
  assert.throws(() => spinSixConfiguration({ ...config, outcomes: [{ ...config.outcomes[0], prizeShares: [100, ,] }] }), /complete/);
  assert.throws(() => spinSixOutcome(valid, 100000000));
});

test('six funded registrations create six-seat play and settle each place exactly once', () => {
  const playerIds = [];
  for (let id = 1; id <= 6; id++) playerIds.push(Number(db.prepare('INSERT INTO users (login,nick,password,balance) VALUES (?,?,?,1000000)').run(`six_${process.pid}_${id}`, `Six${id}`, 'x').lastInsertRowid));
  fundHouse(db, { scope: 'spin6:5000', actorId: 0, operationId: 'fund-six', amount: 1000000000 });
  const rules = saveSpinRules(db, { actorId: 0, mode: '6max', stake: 5000, expectedRevision: 0, operationId: 'rules-six', config, insurance: null });
  assert.equal(rules.status, 200, JSON.stringify(rules.body));
  let eventId;
  for (const [index, id] of playerIds.entries()) {
    const result = registerSpin(db, { actorId: id, operationId: `register-six-${id}`, mode: '6max', stake: 5000, expectedRevision: index, ruleRevision: 1, insurance: false }, { drawTicket: 50000000 });
    assert.equal(result.status, 200, `${id}: ${JSON.stringify(result.body)}`);
    eventId = result.body.state.eventId || eventId;
  }
  assert.ok(eventId);
  const queue = spinQueueState(db, { actorId: playerIds[0], mode: '6max', stake: 5000 });
  assert.equal(queue.complete, true);
  assert.equal(queue.registrations.length, 1);
  const event = db.prepare('SELECT * FROM spin_events WHERE event_id = ?').get(eventId);
  assert.equal(event.seats, 6);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM spin_event_entrants WHERE event_id = ?').get(eventId).count, 6);
  const users = db.prepare(`SELECT u.*,e.entrant_order,r.registration_id FROM spin_event_entrants e JOIN spin_registrations r ON r.registration_id = e.registration_id JOIN users u ON u.id = r.actor_id WHERE e.event_id = ? ORDER BY e.entrant_order`).all(eventId);
  const table = new PokerTable({ id: `spin:${eventId}`, name: 'Six Spin', game: 'spingold', sb: 10, bb: 20, min_buyin: 5000, max_buyin: 5000, seats: 6 }, {
    onSpinPayout: (table, finish) => {
      const result = settleSpinEntrant(db, table, finish, () => addTransactionEx(finish.id, 'spin_payout', finish.payout, 'Six Spin prize', 'USD', { reference: `spin:payout:${eventId}:${finish.id}`, joinTransaction: true, database: db, onDuplicate: 'skip' }));
      if (result.status !== 200) throw new Error(result.body.message);
    },
  });
  activateSpinTable(table, event, users.map((user) => ({ ...user, registration: { registration_id: user.registration_id, entrant_order: user.entrant_order } })));
  assert.equal(table.actionTimeMs, 15000);
  assert.equal(table.spinTimeBankSeconds, 10);
  assert.equal(table.spinMaxTimeBankCards, 3);
  table.spinStartedAt = 0;
  table.spinClock = () => 120000;
  table.applySpinBlinds();
  assert.equal(table.spinLevel, 2);
  assert.equal(table.sb, 20);
  table.spinClock = () => Date.now();
  table.spinReady = new Set(users.map((user) => user.id));
  table.maybeStart();
  for (let iteration = 0; iteration < 100 && !table.spinWinner; iteration++) {
    if (table.actor) table.act(table.actor, 'allin');
    else table.tick(Date.now() + 10000);
  }
  assert.ok(table.spinWinner);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM spin_registrations WHERE event_id = ? AND status = ?').get(eventId, 'settled').count, 6, JSON.stringify({ finishes: table.finished, registrations: db.prepare('SELECT actor_id,status FROM spin_registrations WHERE event_id = ?').all(eventId) }));
  assert.equal(db.prepare('SELECT status FROM spin_events WHERE event_id = ?').get(eventId).status, 'finished');
  assert.equal(houseAccount(db, 'spin6:5000').reserved, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM transactions WHERE kind = ?').get('spin_payout').count, 6);
});

test('six-seat insurance pays only its configured x4 outcome', () => {
  const insuredConfig = { ...config, outcomes: [{ ...config.outcomes[0], multiplier: 4, frequency: 100000000 }] };
  const rules = saveSpinRules(db, { actorId: 0, mode: '6max', stake: 5000, expectedRevision: 1, operationId: 'rules-six-insured', config: insuredConfig, insurance: { premium: 100, payout: 1000 } });
  assert.equal(rules.status, 200, JSON.stringify(rules.body));
  fundHouse(db, { scope: 'spin6-insurance:5000', actorId: 0, operationId: 'fund-six-insurance', amount: 1000000 });
  let eventId;
  for (let index = 0; index < 6; index++) {
    const login = `six_insured_${process.pid}_${index}`;
    const actorId = Number(db.prepare('INSERT INTO users (login,nick,password,balance) VALUES (?,?,?,1000000)').run(login, login, 'x').lastInsertRowid);
    const revision = spinQueueState(db, { actorId, mode: '6max', stake: 5000 }).revision;
    const result = registerSpin(db, { actorId, operationId: `register-six-insured-${actorId}`, mode: '6max', stake: 5000, expectedRevision: revision, ruleRevision: 2, insurance: true }, { drawTicket: 0 });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    eventId = result.body.state.eventId || eventId;
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM spin_insurance_settlements WHERE event_id = ? AND payout = 1000').get(eventId).count, 6);
  assert.equal(houseAccount(db, 'spin6-insurance:5000').reserved, 0);
});

test('entry-funded waiting registration cancels without a zero-value prize reservation', () => {
  const actorId = Number(db.prepare('INSERT INTO users (login,nick,password,balance) VALUES (?,?,?,1000000)').run(`six_cancel_${process.pid}`, 'Six cancel', 'x').lastInsertRowid);
  const revision = spinQueueState(db, { actorId, mode: '6max', stake: 5000 }).revision;
  const registered = registerSpin(db, { actorId, operationId: 'register-six-cancel', mode: '6max', stake: 5000, expectedRevision: revision, ruleRevision: 2, insurance: true });
  assert.equal(registered.status, 200, JSON.stringify(registered.body));
  const registrationId = registered.body.state.registrationId;
  const cancelled = cancelSpinRegistration(db, { actorId, registrationId, expectedRevision: 0, operationId: 'cancel-six-waiting' });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = ?').get(actorId).balance, 1000000);
  assert.equal(cancelSpinRegistration(db, { actorId, registrationId, expectedRevision: 0, operationId: 'cancel-six-waiting' }).replayed, true);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = ?').get(actorId).balance, 1000000);
});
