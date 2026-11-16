import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';
import { spinOutcome } from './spin.js';
import { activateSpinTable, syncSpinPresentation } from './spin-runtime.js';

function fixture(ticket = 5) {
  const outcome = spinOutcome(5000, ticket);
  const event = {
    event_id: 'event-runtime', revision: 1, draw_ticket: ticket,
    config_json: JSON.stringify({ outcome }),
    presentation_json: JSON.stringify({ presentationStartedAt: 1000, barrierOpensAt: 11000, acknowledgements: {}, insuranceByRegistration: { r1: true } }),
  };
  const table = new PokerTable({ id: 'spin:event-runtime', name: 'Spin runtime', game: 'spingold', sb: 10, bb: 20, min_buyin: 5000, max_buyin: 5000, seats: 3 });
  table.spinClock = () => 5000;
  const users = [1, 2, 3].map((id) => ({ id, nick: `P${id}`, registration: { registration_id: `r${id}`, entrant_order: id - 1 } }));
  activateSpinTable(table, event, users);
  table.spinTicket = () => { throw new Error('committed outcome must not be redrawn'); };
  return { table, event };
}

test('matched activation seats everyone away and all-ready opens the committed first hand', () => {
  const { table, event } = fixture();
  assert.equal(table.occupiedSeats().length, 3);
  assert.equal(table.handNo, 0);
  assert.equal(table.spinMultiplier, 100);
  assert.ok(table.seats.every((seat) => seat.player.away && seat.player.sittingOut));
  assert.deepEqual(table.snapshotFor(1).spin.presentation.acknowledgements, []);
  assert.equal(table.snapshotFor(1).spin.presentation.insured, true);
  for (const [index, actorId] of [1, 2, 3].entries()) {
    const acknowledgements = Object.fromEntries(Array.from({ length: index + 1 }, (_, i) => [i + 1, ['wheel', 'ready']]));
    syncSpinPresentation(table, { ...event, revision: index + 2, presentation_json: JSON.stringify({ ...JSON.parse(event.presentation_json), acknowledgements }) });
    table.maybeStart();
    assert.equal(table.handNo, index < 2 ? 0 : 1);
  }
  assert.equal(table.spinPrize, 500000);
  assert.deepEqual([...table.spinPayouts], [300000, 150000, 50000]);
  assert.equal(table.snapshotFor(1).spin.presentation.revision, 4);
});

test('the persisted deadline opens a minute-based Spin without ready acknowledgements', () => {
  const { table } = fixture(99_999_999);
  let now = 5000;
  table.spinClock = () => now;
  table.maybeStart();
  assert.equal(table.handNo, 0);
  now = 10999;
  table.maybeStart();
  assert.equal(table.handNo, 0);
  now = 11000;
  table.maybeStart();
  assert.equal(table.handNo, 1);
  assert.equal(table.spinStartedAt, 11000);
  assert.equal(table.snapshotFor().spin.blindLevel, 1);
  assert.equal(table.snapshotFor().spin.smallBlind, 10);
  assert.equal(table.snapshotFor().spin.presentation.ready, true);
});
