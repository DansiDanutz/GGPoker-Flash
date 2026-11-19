import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createOrganizerChips } from './organizer-chips.js';
import { createOrganizerSpinTickets } from './organizer-spin-tickets.js';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,banned INTEGER DEFAULT 0,deleted_at TEXT);
    INSERT INTO users VALUES(1,0,NULL),(2,0,NULL),(3,0,NULL);
    CREATE TABLE organizer_billing_memberships(user_id INTEGER,role TEXT,active INTEGER,expires_at TEXT);
    INSERT INTO organizer_billing_memberships VALUES(1,'organizer',1,'2099-01-01T00:00:00Z');
    CREATE TABLE tables(id TEXT PRIMARY KEY,owner_id INTEGER,private INTEGER,chip_economy INTEGER,enabled INTEGER,game TEXT,min_buyin INTEGER,max_buyin INTEGER);
    INSERT INTO tables VALUES('spin-a',1,1,1,1,'spingold',5000,5000),('spin-b',1,1,1,1,'spingold',5000,5000),('spin-c',3,1,1,1,'spingold',5000,5000);`);
  const chips = createOrganizerChips({ db });
  db.prepare("INSERT INTO organizer_chip_accounts VALUES(1,'wallet:1',20000)").run();
  const tickets = createOrganizerSpinTickets({ db, chips });
  const ticket = tickets.issue({ userId: 1, tableId: 'spin-a', key: 'issue' });
  tickets.transfer({ userId: 1, ticketId: ticket.id, toUserId: 2, key: 'give' });
  return { db, chips, tickets, ticket, seat: { organizerId: 1, userId: 2, tableId: 'spin-a', sessionId: 'seat-a', amount: 5000 } };
}

test('ticket escrow cannot escape when seat creation fails, and a retry consumes exactly once', () => {
  const f = fixture();
  try {
    const broken = createOrganizerSpinTickets({ db: f.db, chips: { ...f.chips, openSeat: () => { throw new Error('seat write failed'); } } });
    const before = f.db.prepare('SELECT count(*) n FROM organizer_chip_journals').get().n;
    assert.throws(() => broken.openSeat(f.seat), /seat write failed/);
    assert.equal(f.chips.balance(1, 2), 0);
    assert.equal(f.tickets.list(2)[0].state, 'issued');
    assert.equal(f.db.prepare('SELECT count(*) n FROM organizer_chip_journals').get().n, before);
    f.tickets.openSeat(f.seat);
    assert.equal(f.tickets.openSeat(f.seat).applied, false);
    assert.equal(f.chips.balance(1, 2), 0);
    assert.equal(f.tickets.list(2)[0].state, 'consumed');
    assert.throws(() => f.tickets.openSeat({ ...f.seat, userId: 3 }), /different details/);
    assert.throws(() => f.tickets.openSeat({ ...f.seat, tableId: 'spin-b' }), /different details/);
    assert.throws(() => f.tickets.refund({ userId: 2, ticketId: f.ticket.id }), /unused/);
    f.chips.closeSeat(f.seat);
    assert.equal(f.chips.balance(1, 2), 5000, 'failed seat or prestart leave returns chips once');
    f.chips.closeSeat(f.seat);
    assert.equal(f.chips.balance(1, 2), 5000);
    assert.equal(f.tickets.list(2)[0].state, 'consumed');
  } finally { f.db.close(); }
});

test('table, owner, stake, operation and holder boundaries preserve ticket funds', () => {
  const f = fixture();
  try {
    assert.throws(() => f.tickets.openSeat({ ...f.seat, tableId: 'spin-b' }), /Insufficient/i);
    assert.throws(() => f.tickets.openSeat({ ...f.seat, tableId: 'spin-c', organizerId: 3 }), /Insufficient/i);
    assert.throws(() => f.tickets.openSeat({ ...f.seat, amount: 10000 }), /terms changed/);
    assert.throws(() => f.tickets.issue({ userId: 1, tableId: 'spin-b', key: 'issue' }), /different details/);
    assert.throws(() => f.tickets.transfer({ userId: 1, ticketId: f.ticket.id, toUserId: 3, key: 'give' }), /different details/);
    assert.throws(() => f.tickets.refund({ userId: 1, ticketId: f.ticket.id }), /not found/);
    f.tickets.refundTable('spin-a'); f.tickets.refundTable('spin-a');
    assert.equal(f.chips.balance(1, 2), 5000);
    assert.equal(f.chips.balance(3, 2), 0);
    assert.equal(f.tickets.list(2)[0].state, 'refunded');
    const bought = f.tickets.issue({ userId: 2, tableId: 'spin-a', key: 'player-purchase' });
    assert.equal(f.chips.balance(1, 2), 0);
    f.db.prepare("UPDATE organizer_billing_memberships SET expires_at='2000-01-01T00:00:00Z'").run();
    assert.throws(() => f.tickets.issue({ userId: 1, tableId: 'spin-a', key: 'expired' }), /membership/);
    f.tickets.refund({ userId: 2, ticketId: bought.id });
    assert.equal(f.chips.balance(1, 2), 5000, 'expiry cannot trap an existing ticket refund');
  } finally { f.db.close(); }
});

test('active session credit blocks Spin ticket transfers without changing ownership', () => {
  const f = fixture();
  try {
    f.db.exec("CREATE TABLE organizer_session_credits(id TEXT,organizer_id INTEGER,user_id INTEGER,state TEXT); INSERT INTO organizer_session_credits VALUES('locked',1,3,'active')");
    assert.throws(() => f.tickets.transfer({ userId: 2, ticketId: f.ticket.id, toUserId: 3, key: 'locked-transfer' }), (error) => error.code === 'session_credit_locked');
    assert.equal(f.tickets.list(2)[0].holder_id, 2); assert.equal(f.tickets.list(3).length, 0);
    f.db.prepare('UPDATE organizer_session_credits SET user_id=2').run();
    assert.throws(() => f.tickets.openSeat(f.seat), (error) => error.code === 'session_credit_locked');
    assert.equal(f.tickets.list(2)[0].state, 'issued'); assert.equal(f.db.prepare('SELECT COUNT(*) n FROM organizer_chip_sessions').get().n, 0);
  } finally { f.db.close(); }
});
