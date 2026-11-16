import { randomInt, randomUUID } from 'node:crypto';
import { addTransactionEx } from './db.js';
import { withGameReceipt } from './game-receipts.js';
import { creditHouse, debitHouse, ensureHouseBank, fundHouse, releaseHouse, reserveHouse, consumeHouseReservation, houseAccount, requireHouseResult } from './house-bank.js';
import { isSpinStake, spinOutcome, spinPayouts, SPIN_TICKET_TOTAL, spinSmallBlinds } from './spin.js';
import { ensureSpinInsurance, settleSpinInsurance } from './spin-insurance.js';
import { spinRulesComplete, validateSpinRules } from './spin-config.js';
import { spinInsuranceMultiplier, spinInsuranceScope, spinModeSeats, spinPrizeScope, spinSixConfiguration, spinSixOutcome } from './spin-six.js';

function transaction(db, callback) {
  if (db.isTransaction) return callback();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function ensureSpinStore(db) {
  ensureHouseBank(db);
  ensureSpinInsurance(db);
  db.exec(`CREATE TABLE IF NOT EXISTS aggregate_revisions (
    scope TEXT PRIMARY KEY,
    revision INTEGER NOT NULL CHECK(revision>=0)
  );
  CREATE TABLE IF NOT EXISTS spin_rules (
    mode TEXT NOT NULL,
    stake INTEGER NOT NULL,
    revision INTEGER NOT NULL,
    config_json TEXT,
    insurance_json TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(mode,stake)
  );
  CREATE TABLE IF NOT EXISTS spin_events (
    event_id TEXT PRIMARY KEY,
    stake INTEGER NOT NULL,
    mode TEXT NOT NULL,
    seats INTEGER NOT NULL,
    rule_revision INTEGER NOT NULL,
    config_json TEXT NOT NULL,
    status TEXT NOT NULL,
    draw_ticket INTEGER,
    presentation_json TEXT NOT NULL,
    reservation_id TEXT,
    revision INTEGER NOT NULL,
    presentation_revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS spin_registrations (
    registration_id TEXT PRIMARY KEY,
    event_id TEXT,
    actor_id INTEGER NOT NULL,
    operation_id TEXT NOT NULL,
    stake INTEGER NOT NULL,
    mode TEXT NOT NULL,
    rule_revision INTEGER NOT NULL,
    insurance INTEGER NOT NULL,
    prize_reservation_id TEXT NOT NULL,
    insurance_reservation_id TEXT,
    insurance_premium INTEGER,
    status TEXT NOT NULL CHECK(status IN ('waiting','matched','cancelled','settled')),
    revision INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(actor_id,operation_id)
  );
  CREATE INDEX IF NOT EXISTS idx_spin_fifo ON spin_registrations(mode,stake,rule_revision,status,created_at,registration_id);
  CREATE TABLE IF NOT EXISTS spin_event_entrants (
    event_id TEXT NOT NULL,
    registration_id TEXT NOT NULL UNIQUE,
    entrant_order INTEGER NOT NULL,
    PRIMARY KEY(event_id,registration_id),
    UNIQUE(event_id,entrant_order)
  );`);
  try { db.exec('ALTER TABLE spin_events ADD COLUMN presentation_revision INTEGER NOT NULL DEFAULT 1'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE spin_registrations ADD COLUMN insurance_premium INTEGER'); } catch { /* already exists */ }
  for (const stake of [5000, 10000]) {
    db.prepare(`INSERT OR IGNORE INTO spin_rules (mode,stake,revision,config_json,insurance_json,updated_at)
      VALUES ('3max',?,1,?,NULL,datetime('now'))`).run(stake, JSON.stringify({ rows: spinPayouts(stake) }));
  }
}

function revision(db, scope) {
  return db.prepare('SELECT revision FROM aggregate_revisions WHERE scope = ?').get(scope)?.revision || 0;
}

function bumpRevision(db, scope) {
  db.prepare(`INSERT INTO aggregate_revisions (scope,revision) VALUES (?,1)
    ON CONFLICT(scope) DO UPDATE SET revision = revision + 1`).run(scope);
  return revision(db, scope);
}

function registerIdentity(body) {
  const { mode = '3max', stake, insurance = false, expectedRevision, ruleRevision, operationId } = body;
  if (!['3max', '6max'].includes(mode) || !isSpinStake(stake) || typeof operationId !== 'string' || !operationId.trim() || operationId.length > 100) throw Object.assign(Error('Invalid Spin registration'), { status: 400 });
  if (!Number.isSafeInteger(expectedRevision) || !Number.isSafeInteger(ruleRevision) || typeof insurance !== 'boolean') throw Object.assign(Error('Invalid Spin registration'), { status: 400 });
  return { mode, stake, insurance, expectedRevision, ruleRevision, operationId };
}

export function registerSpin(db, body, options = {}) {
  ensureSpinStore(db);
  const input = registerIdentity(body);
  return withGameReceipt(db, { actorId: body.actorId, operationId: input.operationId, scope: `spin-queue:${input.mode}:${input.stake}`, request: input }, () => transaction(db, () => {
    const scope = `spin-queue:${input.mode}:${input.stake}`;
    if (revision(db, scope) !== input.expectedRevision) throw Object.assign(Error('Spin queue revision changed'), { status: 409 });
    const rules = db.prepare('SELECT * FROM spin_rules WHERE mode = ? AND stake = ?').get(input.mode, input.stake);
    if (!rules || rules.revision !== input.ruleRevision || !rules.config_json) throw Object.assign(Error('Spin rules changed or incomplete'), { status: 409 });
    let config;
    try { config = input.mode === '6max' ? spinSixConfiguration(JSON.parse(rules.config_json)) : validateSpinRules(JSON.parse(rules.config_json), input.stake); }
    catch { throw Object.assign(Error('Spin rules changed or incomplete'), { status: 409 }); }
    const insuranceRules = rules.insurance_json ? JSON.parse(rules.insurance_json) : null;
    if (input.insurance && !insuranceRules) throw Object.assign(Error('Spin insurance is unavailable'), { status: 409 });
    const cost = input.stake + (input.insurance ? insuranceRules.premium : 0);
    const wallet = db.prepare('SELECT balance FROM users WHERE id = ?').get(body.actorId);
    if (!wallet || wallet.balance < cost) throw Object.assign(Error('Insufficient player funds'), { status: 409 });
    const active = db.prepare("SELECT COUNT(*) AS count FROM spin_registrations WHERE actor_id = ? AND mode = ? AND stake = ? AND status IN ('waiting','matched')").get(body.actorId, input.mode, input.stake).count;
    if (active >= 4) throw Object.assign(Error('At most four active Spin registrations are allowed'), { status: 409 });
    const registrationId = randomUUID();
    const prizeReservationId = `spin-registration:${registrationId}`;
    const insuranceReservationId = input.insurance ? `spin-insurance:${registrationId}` : null;
    const prizePools = input.mode === '6max' ? config.outcomes.map((row) => config.buyIn * row.multiplier) : config.rows.map((row) => row.prizePool);
    const maxPrize = Math.max(...prizePools);
    const seats = spinModeSeats(input.mode);
    const exposure = Math.max(0, maxPrize - seats * input.stake);
    const share = Math.ceil(exposure / seats);
    if (share > 0) requireHouseResult(reserveHouse(db, { scope: spinPrizeScope(input.mode, input.stake), actorId: body.actorId, operationId: input.operationId, reservationId: prizeReservationId, amount: share }));
    if (input.insurance) requireHouseResult(reserveHouse(db, { scope: spinInsuranceScope(input.mode, input.stake), actorId: body.actorId, operationId: input.operationId, reservationId: insuranceReservationId, amount: insuranceRules.payout }));
    addTransactionEx(body.actorId, 'spin_entry', -input.stake, 'Spin & Gold entry', 'USD', { reference: `spin:entry:${registrationId}`, joinTransaction: true, database: db });
    if (input.insurance) {
      addTransactionEx(body.actorId, 'spin_insurance', -insuranceRules.premium, 'Spin insurance premium', 'USD', { reference: `spin:insurance:${registrationId}`, joinTransaction: true, database: db });
      requireHouseResult(creditHouse(db, { scope: spinInsuranceScope(input.mode, input.stake), actorId: body.actorId, operationId: input.operationId, amount: insuranceRules.premium, entityId: registrationId }));
    }
    db.prepare(`INSERT INTO spin_registrations
      (registration_id,event_id,actor_id,operation_id,stake,mode,rule_revision,insurance,prize_reservation_id,insurance_reservation_id,insurance_premium,status,revision,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,datetime('now'))`).run(registrationId, null, body.actorId, input.operationId, input.stake, input.mode, input.ruleRevision, input.insurance ? 1 : 0, prizeReservationId, insuranceReservationId, input.insurance ? insuranceRules.premium : null, 'waiting');
    bumpRevision(db, scope);
    const waiting = db.prepare("SELECT * FROM spin_registrations WHERE mode = ? AND stake = ? AND rule_revision = ? AND status = 'waiting' ORDER BY created_at,registration_id").all(input.mode, input.stake, input.ruleRevision);
    const cohort = [];
    const actors = new Set();
    for (const registration of waiting) {
      if (actors.has(registration.actor_id)) continue;
      actors.add(registration.actor_id);
      cohort.push(registration);
      if (cohort.length === spinModeSeats(input.mode)) break;
    }
    let eventId = null;
    if (cohort.length === spinModeSeats(input.mode)) eventId = createSpinEvent(db, { ...input, config, insuranceRules, registrations: cohort, drawTicket: options.drawTicket });
    return { revision: revision(db, scope), state: { registrationId, eventId, status: eventId ? 'matched' : 'waiting' } };
  }));
}

function createSpinEvent(db, { mode, config, insuranceRules, registrations, drawTicket }) {
  const first = registrations[0];
  const eventId = randomUUID();
  const ticket = drawTicket === undefined ? randomInt(SPIN_TICKET_TOTAL) : drawTicket;
  const drawn = mode === '6max' ? spinSixOutcome(config, ticket) : spinOutcome(first.stake, ticket);
  const outcome = { ...drawn, ...(mode === '6max' ? drawn : config.rows.find((row) => row.multiplier === drawn.multiplier)) };
  const reservationId = `spin-event:${eventId}`;
  const seats = spinModeSeats(mode);
  const registrationExposure = Math.max(0, Math.max(...(mode === '6max' ? config.outcomes.map((row) => config.buyIn * row.multiplier) : config.rows.map((row) => row.prizePool))) - seats * first.stake);
  if (registrationExposure > 0) for (const registration of registrations) requireHouseResult(releaseHouse(db, { scope: spinPrizeScope(mode, first.stake), actorId: 0, operationId: `spin-cohort:${eventId}:release-initial:${registration.registration_id}`, reservationId: registration.prize_reservation_id }));
  const actualExposure = Math.max(0, outcome.prizePool - seats * first.stake);
  if (actualExposure > 0) requireHouseResult(reserveHouse(db, { scope: spinPrizeScope(mode, first.stake), actorId: 0, operationId: `spin-cohort:${eventId}`, reservationId, amount: actualExposure }));
  const now = Date.now();
  db.prepare(`INSERT INTO spin_events
    (event_id,stake,mode,seats,rule_revision,config_json,status,draw_ticket,presentation_json,reservation_id,revision,presentation_revision,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).run(eventId, first.stake, first.mode, seats, first.rule_revision,
    JSON.stringify({ config, insurance: insuranceRules, outcome }), 'presentation', ticket,
    JSON.stringify({ presentationStartedAt: now, barrierOpensAt: now + 10000, acknowledgements: {}, insuranceByRegistration: Object.fromEntries(registrations.map((registration) => [registration.registration_id, !!registration.insurance])), insuranceMultiplier: spinInsuranceMultiplier(mode) }), reservationId, 1, 1);
  registrations.forEach((registration, index) => {
    db.prepare('INSERT INTO spin_event_entrants (event_id,registration_id,entrant_order) VALUES (?,?,?)').run(eventId, registration.registration_id, index);
    db.prepare("UPDATE spin_registrations SET event_id = ?, status = 'matched', revision = revision + 1 WHERE registration_id = ?").run(eventId, registration.registration_id);
  });
  const event = db.prepare('SELECT * FROM spin_events WHERE event_id = ?').get(eventId);
  for (const registration of registrations) {
    const result = settleSpinInsurance(db, event, registration);
    if (result) requireHouseResult(result);
  }
  const smallBlind = mode === '6max' ? config.smallBlinds[0] : spinSmallBlinds[0];
  db.prepare(`INSERT INTO tables (id,name,game,category,sb,bb,ante,min_buyin,max_buyin,seats,speed,featured,enabled,sort,rimt_mode)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(`spin:${eventId}`, `Spin & Gold ${seats}-Max ${outcome.multiplier}x`, 'spingold', 'Spin', smallBlind, smallBlind * 2, 0, first.stake, first.stake, seats, 'Fast', 0, 1, 0, 'off');
  return eventId;
}

export function spinQueueState(db, { actorId, mode = '3max', stake }) {
  ensureSpinStore(db);
  if (!['3max', '6max'].includes(mode) || !isSpinStake(stake)) return null;
  const rules = db.prepare('SELECT * FROM spin_rules WHERE mode = ? AND stake = ?').get(mode, stake);
  if (!rules) return null;
  const registrations = db.prepare(`SELECT registration_id,event_id,status,revision,insurance FROM spin_registrations
    WHERE actor_id = ? AND mode = ? AND stake = ? AND status IN ('waiting','matched') ORDER BY created_at,registration_id`).all(actorId, mode, stake);
  return {
    mode,
    stake,
    revision: revision(db, `spin-queue:${mode}:${stake}`),
    ruleRevision: rules.revision,
    complete: spinRulesComplete(JSON.parse(rules.config_json)),
    maxActive: 4,
    insurance: rules.insurance_json ? JSON.parse(rules.insurance_json) : null,
    registrations: registrations.map((row) => ({ registrationId: row.registration_id, eventId: row.event_id, status: row.status, revision: row.revision, insurance: !!row.insurance })),
  };
}

export function spinRegistration(db, actorId, registrationId) {
  ensureSpinStore(db);
  const registration = db.prepare('SELECT * FROM spin_registrations WHERE registration_id = ? AND actor_id = ?').get(registrationId, actorId);
  if (!registration) return null;
  return { registrationId, eventId: registration.event_id, status: registration.status, revision: registration.revision };
}

export function cancelSpinRegistration(db, { actorId, registrationId, expectedRevision, operationId }) {
  ensureSpinStore(db);
  return withGameReceipt(db, { actorId, operationId, scope: `spin-registration:${registrationId}`, request: { registrationId, expectedRevision } }, () => transaction(db, () => {
    const registration = db.prepare("SELECT * FROM spin_registrations WHERE registration_id = ? AND actor_id = ? AND status = 'waiting'").get(registrationId, actorId);
    if (!registration || registration.revision !== expectedRevision) throw Object.assign(Error('Waiting registration changed'), { status: 409 });
    const prizeReservation = db.prepare("SELECT 1 FROM house_reservations WHERE reservation_id = ? AND status = 'active'").get(registration.prize_reservation_id);
    if (prizeReservation) requireHouseResult(releaseHouse(db, { scope: spinPrizeScope(registration.mode, registration.stake), actorId, operationId, reservationId: registration.prize_reservation_id }));
    if (registration.insurance_reservation_id) requireHouseResult(releaseHouse(db, { scope: spinInsuranceScope(registration.mode, registration.stake), actorId, operationId, reservationId: registration.insurance_reservation_id }));
    addTransactionEx(actorId, 'spin_refund', registration.stake, 'Spin registration cancellation', 'USD', { reference: `spin:refund:${registrationId}`, joinTransaction: true, database: db });
    if (registration.insurance) {
      if (!Number.isSafeInteger(registration.insurance_premium)) throw Object.assign(Error('Purchased insurance terms are unavailable'), { status: 409 });
      requireHouseResult(debitHouse(db, { scope: spinInsuranceScope(registration.mode, registration.stake), actorId, operationId, amount: registration.insurance_premium, entityId: registrationId }));
      addTransactionEx(actorId, 'spin_insurance_refund', registration.insurance_premium, 'Spin insurance cancellation', 'USD', { reference: `spin:insurance-refund:${registrationId}`, joinTransaction: true, database: db });
    }
    db.prepare("UPDATE spin_registrations SET status = 'cancelled', revision = revision + 1 WHERE registration_id = ?").run(registrationId);
    bumpRevision(db, `spin-registration:${registrationId}`);
    return { revision: registration.revision + 1, state: { registrationId, eventId: null, status: 'cancelled' } };
  }));
}

export function acknowledgeSpin(db, { actorId, eventId, expectedRevision, operationId, stage }) {
  ensureSpinStore(db);
  if (!['wheel', 'insurance', 'ready'].includes(stage)) throw Object.assign(Error('Invalid presentation stage'), { status: 400 });
  return withGameReceipt(db, { actorId, operationId, scope: `spin-event:${eventId}`, request: { eventId, expectedRevision, stage } }, () => transaction(db, () => {
    const event = db.prepare('SELECT * FROM spin_events WHERE event_id = ?').get(eventId);
    if (!event || (event.presentation_revision ?? event.revision) !== expectedRevision) throw Object.assign(Error('Spin presentation revision changed'), { status: 409 });
    const entrant = db.prepare(`SELECT e.registration_id,r.insurance FROM spin_event_entrants e
      JOIN spin_registrations r ON r.registration_id = e.registration_id
      WHERE e.event_id = ? AND r.actor_id = ?`).get(eventId, actorId);
    if (!entrant) throw Object.assign(Error('Not a Spin entrant'), { status: 403 });
    if (stage === 'insurance' && !entrant.insurance) throw Object.assign(Error('Insurance was not purchased'), { status: 409 });
    const presentation = JSON.parse(event.presentation_json);
    const current = presentation.acknowledgements[actorId] || [];
    if (current.includes(stage)) throw Object.assign(Error('Presentation stage was already acknowledged'), { status: 409 });
    const required = stage === 'wheel' ? [] : stage === 'insurance' ? ['wheel'] : entrant.insurance ? ['wheel', 'insurance'] : ['wheel'];
    if (required.some((item, index) => current[index] !== item)) throw Object.assign(Error('Presentation stage is out of order'), { status: 409 });
    presentation.acknowledgements[actorId] = [...current, stage];
    const nextRevision = (event.presentation_revision ?? event.revision) + 1;
    db.prepare('UPDATE spin_events SET presentation_json = ?, presentation_revision = ? WHERE event_id = ?')
      .run(JSON.stringify(presentation), nextRevision, eventId);
    return { revision: nextRevision, state: { eventId, acknowledgements: presentation.acknowledgements } };
  }));
}

export function spinPlaceExposures(prizes, stake) {
  const totalPrize = prizes.reduce((total, prize) => total + prize, 0);
  if (totalPrize <= prizes.length * stake) return prizes.map(() => 0);
  let remainingEntries = prizes.length * stake;
  const entryAllocations = Array(prizes.length).fill(0);
  for (let place = prizes.length - 1; place >= 0; place--) {
    const allocation = Math.min(stake, prizes[place], remainingEntries);
    entryAllocations[place] = allocation;
    remainingEntries -= allocation;
  }
  for (let place = prizes.length - 1; place >= 0 && remainingEntries > 0; place--) {
    const allocation = Math.min(prizes[place] - entryAllocations[place], remainingEntries);
    entryAllocations[place] += allocation;
    remainingEntries -= allocation;
  }
  return prizes.map((prize, place) => prize - entryAllocations[place]);
}

export function settleSpinEntrant(db, table, finish, settlePayout) {
  ensureSpinStore(db);
  const eventId = table.cfg.eventId || table.cfg.id.replace(/^spin:/, '');
  const entrant = db.prepare('SELECT r.* FROM spin_registrations r JOIN spin_event_entrants e ON e.registration_id = r.registration_id WHERE e.event_id = ? AND r.actor_id = ?').get(eventId, finish.id);
  if (!entrant) return { applied: false, reason: 'no entrant' };
  const operationId = `spin-payout:${eventId}:${entrant.registration_id}`;
  return withGameReceipt(db, { actorId: finish.id, operationId, scope: `spin-event:${eventId}`, request: { eventId, registrationId: entrant.registration_id, place: finish.place, payout: finish.payout } }, () => transaction(db, () => {
    const event = db.prepare('SELECT * FROM spin_events WHERE event_id = ?').get(eventId);
    const credit = settlePayout();
    if (!credit.applied) throw Object.assign(new Error(`Spin wallet settlement failed: ${credit.reason || 'duplicate session close'}`), { status: 409 });
    const exposure = spinPlaceExposures(JSON.parse(event.config_json).outcome.prizes, event.stake)[finish.place - 1];
    if (exposure > 0) {
      requireHouseResult(consumeHouseReservation(db, { scope: spinPrizeScope(event.mode, event.stake), actorId: finish.id, operationId, reservationId: event.reservation_id, amount: exposure }));
    }
    const updated = db.prepare("UPDATE spin_registrations SET status = 'settled', revision = revision + 1 WHERE registration_id = ? AND status = 'matched'").run(entrant.registration_id);
    if (updated.changes !== 1) throw Object.assign(new Error('Spin entrant was already settled'), { status: 409 });
    const remaining = db.prepare("SELECT COUNT(*) AS count FROM spin_registrations WHERE event_id = ? AND status = 'matched'").get(eventId).count;
    const status = remaining ? event.status : 'finished';
    db.prepare('UPDATE spin_events SET status = ?, revision = revision + 1 WHERE event_id = ?').run(status, eventId);
    return { revision: event.revision + 1, state: { registrationId: entrant.registration_id, place: finish.place, payout: finish.payout, houseExposure: exposure, eventStatus: status } };
  }));
}

export function cancelQuarantinedSpin(db, { actorId, eventId, expectedRevision, operationId }) {
  ensureSpinStore(db);
  return withGameReceipt(db, { actorId, operationId, scope: `spin-event:${eventId}:quarantine-cancel`, request: { eventId, expectedRevision } }, () => transaction(db, () => {
    const event = db.prepare('SELECT * FROM spin_events WHERE event_id = ?').get(eventId);
    if (!event || event.revision !== expectedRevision) throw Object.assign(Error('Spin event revision changed'), { status: 409 });
    const quarantined = db.prepare("SELECT 1 FROM game_checkpoints WHERE room_id = ? AND kind = 'spin' AND status = 'quarantined'").get(`spin:${eventId}`);
    if (!quarantined) throw Object.assign(Error('Spin event is not quarantined'), { status: 409 });
    const settled = db.prepare("SELECT COUNT(*) AS count FROM spin_registrations WHERE event_id = ? AND status = 'settled'").get(eventId).count;
    if (settled) throw Object.assign(Error('A Spin with place settlements requires manual audit'), { status: 409 });
    const registrations = db.prepare("SELECT * FROM spin_registrations WHERE event_id = ? AND status = 'matched' ORDER BY created_at,registration_id").all(eventId);
    let refundedEntries = 0;
    let refundedPremiums = 0;
    for (const registration of registrations) {
      const entryReference = `spin:refund:${registration.registration_id}`;
      if (!db.prepare('SELECT 1 FROM transactions WHERE user_id = ? AND reference = ?').get(registration.actor_id, entryReference)) {
        addTransactionEx(registration.actor_id, 'spin_refund', registration.stake, 'Quarantined Spin entry refund', 'USD', { reference: entryReference, joinTransaction: true, database: db, onDuplicate: 'skip' });
        refundedEntries++;
      }
      const initialHold = db.prepare("SELECT 1 FROM house_reservations WHERE reservation_id = ? AND status = 'active'").get(registration.prize_reservation_id);
      if (initialHold) requireHouseResult(releaseHouse(db, { scope: spinPrizeScope(event.mode, event.stake), actorId, operationId, reservationId: registration.prize_reservation_id }));
      if (registration.insurance_reservation_id) {
        const active = db.prepare("SELECT 1 FROM house_reservations WHERE reservation_id = ? AND status = 'active'").get(registration.insurance_reservation_id);
        if (active) requireHouseResult(releaseHouse(db, { scope: spinInsuranceScope(event.mode, event.stake), actorId, operationId, reservationId: registration.insurance_reservation_id }));
      }
      const insuranceSettlement = db.prepare('SELECT 1 FROM spin_insurance_settlements WHERE registration_id = ?').get(registration.registration_id);
      if (registration.insurance && !insuranceSettlement) {
        if (!Number.isSafeInteger(registration.insurance_premium)) throw Object.assign(Error('Purchased insurance terms are unavailable'), { status: 409 });
        requireHouseResult(debitHouse(db, { scope: spinInsuranceScope(event.mode, event.stake), actorId, operationId, amount: registration.insurance_premium, entityId: registration.registration_id }));
        addTransactionEx(registration.actor_id, 'spin_insurance_refund', registration.insurance_premium, 'Quarantined Spin premium refund', 'USD', { reference: `spin:insurance-refund:${registration.registration_id}`, joinTransaction: true, database: db, onDuplicate: 'skip' });
        refundedPremiums++;
      }
    }
    if (event.reservation_id) {
      const active = db.prepare("SELECT 1 FROM house_reservations WHERE reservation_id = ? AND status = 'active'").get(event.reservation_id);
      if (active) requireHouseResult(releaseHouse(db, { scope: spinPrizeScope(event.mode, event.stake), actorId, operationId, reservationId: event.reservation_id }));
    }
    db.prepare("UPDATE spin_registrations SET status = 'cancelled',revision=revision+1 WHERE event_id = ? AND status = 'matched'").run(eventId);
    db.prepare("UPDATE spin_events SET status = 'cancelled',revision=revision+1 WHERE event_id = ?").run(eventId);
    db.prepare("UPDATE game_checkpoints SET status = 'terminal',reason = 'Administrator quarantine cancellation',updated_at=datetime('now') WHERE room_id = ? AND kind = 'spin' AND status = 'quarantined'").run(`spin:${eventId}`);
    return { revision: event.revision + 1, state: { eventId, status: 'cancelled', refundedEntries, refundedPremiums } };
  }));
}

export { fundHouse, houseAccount };
