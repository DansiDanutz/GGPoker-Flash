import test from 'node:test';
import assert from 'node:assert/strict';
import { TournamentRoom, MAX_FLIGHTS, payoutFor } from './tournament-room.js';
import { PokerTable } from './table.js';

// A fake PokerTable with just the surface the room uses. Bots are only added
// when a test asks for them, so seat and place assertions stay readable.
class FakeTable {
  constructor(id, seats = 6) {
    this.cfg = { id, seats };
    this.players = [];
    this.handNo = 0;
    this.inHand = false;
    this.autofill = false;
    this.events = [];
  }

  occupiedSeats() {
    return this.players.map((player, index) => ({ index, player }));
  }

  humans() {
    return this.players.filter((p) => !p.isBot);
  }

  seatOf(id) {
    const index = this.players.findIndex((p) => p.id === id);
    return index >= 0 ? { index, player: this.players[index] } : null;
  }

  sit(player, seat, stack) {
    if (this.seatOf(player.id)) return { ok: false, error: 'already seated' };
    if (this.players.length >= this.cfg.seats) return { ok: false, error: 'table full' };
    this.players.push({
      ...player,
      stack: stack ?? 1000,
      inHand: false,
      disconnected: false,
      disconnectedAt: 0,
      sittingOut: false,
    });
    return { ok: true, seat: this.players.length - 1 };
  }

  stand(id) {
    const index = this.players.findIndex((p) => p.id === id);
    if (index < 0) return { ok: false };
    const [player] = this.players.splice(index, 1);
    return { ok: true, stack: player.stack };
  }

  fillBots(count) {
    let added = 0;
    while (this.autofill && added < count && this.players.length < this.cfg.seats) {
      this.players.push({ id: `bot-${this.cfg.id}-${this.players.length}`, nick: 'Bot', isBot: true, stack: 1000, inHand: false });
      added += 1;
    }
    return added;
  }

  handInProgress() {
    return this.inHand;
  }

  maybeStart() {}

  emit(evt) {
    this.events.push(evt);
  }
}

function harness({ seats = 6, maxTables = 4, prizePool = 10000, mode = 'STANDARD' } = {}) {
  const tables = new Map();
  const calls = { busts: [], winners: [], moves: [], closed: [], broadcasts: [], created: [] };
  const ops = {
    table: (id) => tables.get(id) || null,
    createTable: ({ tableId }) => {
      const table = new FakeTable(tableId, seats);
      tables.set(tableId, table);
      calls.created.push(tableId);
      return table;
    },
    closeTable: (id) => { tables.delete(id); calls.closed.push(id); },
    broadcast: (id) => calls.broadcasts.push(id),
    evictBot: (table) => {
      const bot = table.players.find((p) => p.isBot && !p.inHand);
      if (!bot) return false;
      table.stand(bot.id);
      return true;
    },
    notifyPlayer: (userId, message) => calls.moves.push({ userId, ...message }),
    persistBust: (record) => calls.busts.push(record),
    persistWinner: (record) => calls.winners.push(record),
  };
  const room = new TournamentRoom({
    id: 't1',
    seats,
    maxTables,
    tournament: { prizePool, mode },
    ops,
  });
  return { room, tables, calls };
}

const player = (n) => ({ id: `p${n}`, nick: `P${n}`, avatar: '' });

test('humans fill one flight before another opens, with the legacy id first', () => {
  const { room, calls } = harness();
  const ids = [];
  for (let i = 1; i <= 7; i += 1) {
    const res = room.seat(player(i), { stack: 1000 });
    assert.equal(res.ok, true, `player ${i}`);
    ids.push(res.tableId);
  }
  assert.deepEqual(ids.slice(0, 6), Array(6).fill('tourney-t1'));
  assert.equal(ids[6], 'tourney-t1-1');
  assert.deepEqual(calls.created, ['tourney-t1', 'tourney-t1-1']);
  assert.equal(room.stats().tables, 2);
  assert.equal(room.stats().humansLeft, 7);
});

test('a human takes a bot seat instead of scattering to a new flight', () => {
  const { room, tables } = harness();
  const first = room.seat(player(1), { stack: 1000 });
  const table = tables.get(first.tableId);
  table.autofill = true;
  assert.equal(table.fillBots(5), 5);
  assert.equal(table.occupiedSeats().length, 6);
  const second = room.seat(player(2), { stack: 1000 });
  assert.equal(second.tableId, 'tourney-t1');
  assert.equal(second.index, 1);
  const humans = table.humans().map((p) => p.id).sort();
  assert.deepEqual(humans, ['p1', 'p2']);
});

test('re-seating a player returns their table instead of a second seat', () => {
  const { room } = harness();
  room.seat(player(1), { stack: 1000 });
  const again = room.seat(player(1), { stack: 1000 });
  assert.equal(again.ok, true);
  assert.equal(again.reconnect, true);
  assert.equal(again.tableId, 'tourney-t1');
});

test('the flight cap refuses a field that cannot be seated', () => {
  const { room } = harness({ seats: 2, maxTables: 2 });
  for (let i = 1; i <= 4; i += 1) assert.equal(room.seat(player(i)).ok, true);
  const overflow = room.seat(player(5));
  assert.equal(overflow.ok, false);
  assert.match(overflow.error, /full/);
});

test('places count down across the whole field, not per table', () => {
  const { room, tables } = harness();
  for (let i = 1; i <= 8; i += 1) room.seat(player(i), { stack: 1000 });
  const flight1 = tables.get('tourney-t1');
  const flight2 = tables.get('tourney-t1-1');
  assert.equal(flight1.occupiedSeats().length, 6);
  assert.equal(flight2.occupiedSeats().length, 2);

  // Busted seats stay at stack 0 until the table clears them.
  flight1.seatOf('p1').player.stack = 0;
  assert.deepEqual(room.onBust('tourney-t1', player(1)), { id: 'p1', nick: 'P1', place: 8, payout: 0 });
  // The engine clears the seat right after the hook, inside the same tick.
  flight1.stand('p1');

  flight2.seatOf('p7').player.stack = 0;
  assert.deepEqual(room.onBust('tourney-t1-1', player(7)), { id: 'p7', nick: 'P7', place: 7, payout: 0 });
  assert.equal(room.finished.length, 2);
});

test('players busting in the same hand still get distinct places', () => {
  const { room, tables } = harness();
  for (let i = 1; i <= 8; i += 1) room.seat(player(i), { stack: 1000 });
  const flight = tables.get('tourney-t1');
  flight.seatOf('p1').player.stack = 0;
  flight.seatOf('p2').player.stack = 0;
  const first = room.onBust('tourney-t1', player(1));
  const second = room.onBust('tourney-t1', player(2));
  assert.deepEqual([first.place, second.place], [7, 8]);
  assert.equal(room.finished.length, 2);
});

test('payouts follow the place: 30% for second, 20% for third, 50% for the win', () => {
  assert.equal(payoutFor(10000, 1), 5000);
  assert.equal(payoutFor(10000, 2), 3000);
  assert.equal(payoutFor(10000, 3), 2000);
  assert.equal(payoutFor(10000, 4), 0);

  const { room, tables } = harness();
  for (let i = 1; i <= 3; i += 1) room.seat(player(i), { stack: 1000 });
  const table = tables.get('tourney-t1');
  table.handNo = 1;
  table.seatOf('p3').player.stack = 0;
  assert.equal(room.onBust('tourney-t1', player(3)).place, 3);
  assert.equal(room.onBust('tourney-t1', player(3)), null, 'a bust is only recorded once');
});

test('balancing moves a player off the bigger table and tells their client', () => {
  const { room, tables, calls } = harness();
  for (let i = 1; i <= 12; i += 1) room.seat(player(i), { stack: 1000 });
  const flight1 = tables.get('tourney-t1');
  const flight2 = tables.get('tourney-t1-1');
  for (const id of ['p1', 'p2', 'p3']) flight1.stand(id);
  assert.equal(flight1.occupiedSeats().length, 3);
  assert.equal(flight2.occupiedSeats().length, 6);

  const moves = room.balance();
  assert.equal(moves.length, 1);
  assert.equal(moves[0].from, 'tourney-t1-1');
  assert.equal(moves[0].to, 'tourney-t1');
  assert.equal(flight1.occupiedSeats().length, 4);
  assert.equal(flight2.occupiedSeats().length, 5);
  const notice = calls.moves.find((m) => m.type === 'table_move');
  assert.ok(notice, 'the moved player is told where to reconnect');
  assert.equal(notice.tableId, 'tourney-t1');
  assert.equal(notice.reason, 'balance');
});

test('a player in a running hand is never pulled off a table', () => {
  const { room, tables } = harness();
  for (let i = 1; i <= 12; i += 1) room.seat(player(i), { stack: 1000 });
  const flight1 = tables.get('tourney-t1');
  const flight2 = tables.get('tourney-t1-1');
  for (const id of ['p1', 'p2', 'p3']) flight1.stand(id);
  // Every candidate on the table that would donate a player is in a hand.
  for (const p of flight2.players) p.inHand = true;
  const moves = room.balance();
  assert.equal(moves.length, 0);
  assert.equal(flight1.occupiedSeats().length, 3);
});

test('a short table breaks into the others and its players are moved', () => {
  const { room, tables, calls } = harness();
  for (let i = 1; i <= 12; i += 1) room.seat(player(i), { stack: 1000 });
  const flight1 = tables.get('tourney-t1');
  const flight2 = tables.get('tourney-t1-1');
  for (const id of ['p1', 'p2', 'p3', 'p4']) flight1.stand(id);
  for (const id of ['p7', 'p8', 'p9', 'p10', 'p11']) flight2.stand(id);
  // flight 1: p5,p6 (2 players) · flight 2: p12 (1 player) → one table must go.
  const broken = room.breakShortTables();
  assert.equal(broken.length, 1);
  const survivor = tables.get(broken[0] === 'tourney-t1' ? 'tourney-t1-1' : 'tourney-t1');
  assert.ok(survivor);
  assert.equal(room.stats().playersLeft, 3);
  assert.ok(calls.closed.includes(broken[0]));
  const notices = calls.moves.filter((m) => m.type === 'table_move' && m.reason === 'break');
  assert.ok(notices.length >= 1);
});

test('a short table is kept alive when the other tables are full', () => {
  const { room, tables } = harness();
  for (let i = 1; i <= 12; i += 1) room.seat(player(i), { stack: 1000 });
  const flight2 = tables.get('tourney-t1-1');
  for (const id of ['p7', 'p8', 'p9', 'p10', 'p11']) flight2.stand(id);
  const broken = room.breakShortTables();
  assert.deepEqual(broken, []);
  assert.equal(room.stats().playersLeft, 7);
});

test('the last player standing wins the whole prize pool once play has started', () => {
  const { room, tables, calls } = harness();
  room.seat(player(1), { stack: 1000 });
  room.seat(player(2), { stack: 1000 });
  const table = tables.get('tourney-t1');
  table.handNo = 1;
  table.seatOf('p2').player.stack = 0;
  room.onBust('tourney-t1', player(2));
  room.sweep();
  assert.equal(room.winner.id, 'p1');
  assert.equal(room.winner.prize, 5000);
  assert.equal(calls.winners.length, 1);
  assert.equal(calls.winners[0].playerId, 'p1');
  assert.equal(calls.winners[0].prize, 5000);
});

test('a satellite winner gets a ticket instead of a cash prize', () => {
  const { room, tables, calls } = harness({ mode: 'SATELLITE' });
  room.seat(player(1), { stack: 1000 });
  room.seat(player(2), { stack: 1000 });
  const table = tables.get('tourney-t1');
  table.handNo = 1;
  table.seatOf('p2').player.stack = 0;
  room.onBust('tourney-t1', player(2));
  room.sweep();
  assert.equal(room.winner.prize, 0);
  assert.equal(calls.winners[0].prize, 0);
});

test('no winner is crowned before a single hand is dealt', () => {
  const { room } = harness();
  room.seat(player(1), { stack: 1000 });
  room.sweep();
  assert.equal(room.winner, null);
});

test('a mid-hand all-in keeps the field alive until the hand settles', () => {
  const { room, tables } = harness();
  room.seat(player(1), { stack: 1000 });
  room.seat(player(2), { stack: 1000 });
  const table = tables.get('tourney-t1');
  table.handNo = 1;
  table.inHand = true;
  // p2 pushed everything into the pot: 0 behind, still contesting the hand.
  table.seatOf('p2').player.stack = 0;
  assert.equal(room.alivePlayers().length, 2, 'an all-in player is still in the event');
  assert.equal(room.checkWinner(), null);
  table.inHand = false;
  room.onBust('tourney-t1', player(2));
  assert.equal(room.checkWinner().id, 'p1');
});

test('the blind clock catches up across flights that open late', () => {
  const { room } = harness();
  room.tournament.blindEvery = 10;
  room.tournament.level = 1;
  room.tournament.levelStartedAt = Date.now() - 25 * 60000;
  assert.equal(room.syncLevel(), 3);
  assert.equal(room.tournament.level, 3);
  const drift = Date.now() - room.tournament.levelStartedAt;
  assert.ok(drift >= 5 * 60000 && drift < 6 * 60000, 'the clock lands on a whole level boundary');
});

test('a flight closed underneath the room is forgotten and reopened on demand', () => {
  const { room, tables } = harness();
  room.seat(player(1), { stack: 1000 });
  tables.delete('tourney-t1'); // an admin close or an idle sweep
  assert.equal(room.pruneClosedFlights(), 1);
  assert.equal(room.flights.length, 0);
  const again = room.seat(player(2), { stack: 1000 });
  assert.equal(again.ok, true);
  assert.equal(again.tableId, 'tourney-t1');
});

test('the room never opens more flights than its cap', () => {
  const { room } = harness({ seats: 2, maxTables: 2 });
  assert.equal(MAX_FLIGHTS, 24);
  for (let i = 1; i <= 4; i += 1) room.seat(player(i));
  assert.equal(room.flights.length, 2);
  assert.equal(room.ensureFlight(3), null);
});

/* ------------------------- seat all registrants (T1) ------------------------- */

const field = (count) => Array.from({ length: count }, (_, i) => player(i + 1));

test('14 registrants with nobody online are all seated across three flights at the start', () => {
  const { room, tables, calls } = harness();
  const { seated, failed } = room.seatRegistrants(field(14), { stack: 1500 });

  assert.deepEqual(failed, []);
  assert.equal(seated.length, 14);
  assert.deepEqual(calls.created, ['tourney-t1', 'tourney-t1-1', 'tourney-t1-2']);
  assert.deepEqual(seated.map((s) => s.index), [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3]);
  assert.deepEqual([...tables.values()].map((t) => t.occupiedSeats().length), [6, 6, 2]);
  for (const table of tables.values()) {
    for (const { player: p } of table.occupiedSeats()) {
      assert.equal(p.stack, 1500, `${p.id} gets the starting stack`);
      assert.equal(p.away, true, `${p.id} is marked away`);
      assert.equal(p.sittingOut, true, `${p.id} sits out until they open the table`);
      assert.ok(!p.isBot, 'no bots are added to a scheduled field');
    }
  }
  assert.equal(room.stats().humansLeft, 14);
});

test('seating the field twice keeps every existing seat', () => {
  const { room, tables } = harness();
  room.seat(player(3), { stack: 1500 }); // an early opener is already playing
  const { seated } = room.seatRegistrants(field(4), { stack: 1500 });
  const again = room.seatRegistrants(field(4), { stack: 1500 });

  assert.deepEqual(seated.map((s) => s.reconnect), [false, false, true, false]);
  assert.ok(again.seated.every((s) => s.reconnect), 'a second pass seats nobody twice');
  const flight = tables.get('tourney-t1');
  assert.equal(flight.occupiedSeats().length, 4);
  assert.ok(!flight.seatOf('p3').player.away, 'a player already at the table is not marked away');
  assert.equal(room.seat(player(1), { stack: 1500 }).tableId, 'tourney-t1', '/play returns the existing seat');
});

/** A room wired to real PokerTables that deal immediately, for blind-out play. */
function liveHarness({ seats = 6 } = {}) {
  const tables = new Map();
  const busts = [];
  let room;
  const hooks = {
    onEvent: () => {},
    onTournamentBust: (table, p) => room.onBust(table.cfg.id, p),
    onFlightSettled: () => {},
  };
  room = new TournamentRoom({
    id: 't1',
    seats,
    maxTables: 4,
    tournament: { prizePool: 0, mode: 'STANDARD', blindEvery: 5 },
    ops: {
      table: (id) => tables.get(id) || null,
      createTable: ({ tableId, index, tournament }) => {
        const table = new PokerTable({
          id: tableId, name: 'Flight', game: 'holdem', sb: 50, bb: 100, seats,
          min_buyin: 1500, max_buyin: 1500, flightIndex: index, tournament,
        }, hooks);
        table.showdownDelay = 0;
        tables.set(tableId, table);
        return table;
      },
      closeTable: (id) => tables.delete(id),
      broadcast: () => {},
      evictBot: () => false,
      notifyPlayer: () => {},
      persistBust: (record) => busts.push(record),
      persistWinner: () => {},
    },
  });
  return { room, tables, busts };
}

test('an absent player is dealt in, blinds down and is eliminated in the right place', () => {
  const { room, tables, busts } = liveHarness();
  room.seatRegistrants(field(14), { stack: 1500 });
  const short = tables.get('tourney-t1-2');
  assert.deepEqual(short.occupiedSeats().map((s) => s.player.id), ['p13', 'p14']);
  assert.ok(short.handNo >= 1, 'the absent pair is dealt in at the start');

  // Only the third flight plays; the clock runs a minute per tick so the blinds climb.
  let now = Date.now();
  for (let i = 0; i < 20000 && !busts.length; i += 1) {
    now += 60000;
    short.tick(now);
  }

  assert.equal(busts.length, 1, 'one absent player blinded out');
  const [bust] = busts;
  assert.ok(['p13', 'p14'].includes(bust.playerId));
  assert.equal(bust.place, 14, 'the first player out of a 14-player field finishes 14th');
  assert.ok(short.handNo > 1, 'the absent players played several hands');
  const survivor = short.occupiedSeats().map((s) => s.player).find((p) => p.stack > 0);
  assert.equal(survivor.sittingOut, true, 'the other absent player is still sitting out');
  assert.equal(survivor.stack, 3000, 'every chip stayed on the table');
});
