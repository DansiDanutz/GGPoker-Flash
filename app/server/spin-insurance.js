import { addTransactionEx } from './db.js';
import { withGameReceipt } from './game-receipts.js';
import { consumeHouseReservation, releaseHouse, requireHouseResult } from './house-bank.js';
import { spinInsuranceMultiplier, spinInsuranceScope } from './spin-six.js';

export function ensureSpinInsurance(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS spin_insurance_settlements (
    event_id TEXT NOT NULL,
    registration_id TEXT PRIMARY KEY,
    draw_ticket INTEGER NOT NULL,
    multiplier INTEGER NOT NULL,
    payout INTEGER NOT NULL CHECK(payout>=0),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

export function settleSpinInsurance(db, event, registration) {
  if (!registration.insurance) return null;
  ensureSpinInsurance(db);
  const { outcome } = JSON.parse(event.config_json);
  const payout = outcome.multiplier === spinInsuranceMultiplier(event.mode) ? JSON.parse(event.config_json).insurance.payout : 0;
  const operationId = `spin-insurance-settlement:${event.event_id}:${registration.registration_id}`;
  return withGameReceipt(db, {
    actorId: registration.actor_id,
    operationId,
    scope: `spin-event:${event.event_id}:insurance`,
    request: { eventId: event.event_id, registrationId: registration.registration_id, drawTicket: event.draw_ticket },
  }, () => {
    const reservation = {
      scope: spinInsuranceScope(event.mode, event.stake),
      actorId: registration.actor_id,
      operationId,
      reservationId: registration.insurance_reservation_id,
    };
    if (payout) {
      requireHouseResult(consumeHouseReservation(db, { ...reservation, amount: payout }));
      const credit = addTransactionEx(registration.actor_id, 'spin_insurance_payout', payout, 'Spin & Gold x2 insurance', 'USD', {
        reference: `spin:insurance-payout:${registration.registration_id}`,
        joinTransaction: true,
        database: db,
        onDuplicate: 'skip',
      });
      if (!credit.applied) throw Object.assign(new Error('Insurance payout was already closed without a settlement'), { status: 409 });
    } else {
      requireHouseResult(releaseHouse(db, reservation));
    }
    db.prepare(`INSERT INTO spin_insurance_settlements
      (event_id,registration_id,draw_ticket,multiplier,payout) VALUES (?,?,?,?,?)`)
      .run(event.event_id, registration.registration_id, event.draw_ticket, outcome.multiplier, payout);
    return {
      revision: event.revision,
      state: { registrationId: registration.registration_id, multiplier: outcome.multiplier, payout },
    };
  });
}
