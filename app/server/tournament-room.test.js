import test from 'node:test';
import assert from 'node:assert/strict';
import { TournamentRoom, MAX_FLIGHTS } from './tournament-room.js';
import { payoutTable } from './tournament.js';
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
  assert.deepEqual(room.onBust('tourney-t1', player(1)), { id: 'p1', nick: 'P1', place: 8, payout: 0, tableId: 'tourney-t1' });
  // The engine clears the seat right after the hook, inside the same tick.
  flight1.stand('p1');

  flight2.seatOf('p7').player.stack = 0;
  assert.deepEqual(room.onBust('tourney-t1-1', player(7)), { id: 'p7', nick: 'P7', place: 7, payout: 0, tableId: 'tourney-t1-1' });
  assert.equal(room.finished.length, 2);
});

test('players busting in the same hand still get distinct places', () => {
  const { room, tables } = harness();
  for (let i = 1; i <= 8; i += 1) room.seat(player(i), { stack: 1000 });
  const flight = tables.get('tourney-t1');
  flight.seatOf('p1').player.stack = 0;
  flight.seatOf('p2').player.stack = 0;
  const first = room.onBust('tourney-t1', player(1));
  // The first report ranks every bust of the hand; the second finds it done.
  assert.equal(room.onBust('tourney-t1', player(2)), null);
  const second = room.finished.find((r) => r.id === 'p2');
  assert.deepEqual([first.place, second.place], [7, 8]);
  assert.equal(room.finished.length, 2);
});

test('a bust is recorded once with its field-wide place', () => {
  const { room, tables } = harness();
  for (let i = 1; i <= 3; i += 1) room.seat(player(i), { stack: 1000 });
  const table = tables.get('tourney-t1');
  table.handNo = 1;
  table.seatOf('p3').player.stack = 0;
  assert.equal(room.onBust('tourney-t1', player(3)).place, 3);
  assert.equal(room.onBust('tourney-t1', player(3)), null, 'a bust is only recorded once');
});

test('20 entrants: every paid place is credited exactly once and the ledger equals the pool', () => {
  const prizePool = 123457;
  const { room, tables, calls } = harness({ prizePool });
  for (let i = 1; i <= 20; i += 1) room.seat(player(i), { stack: 1000 });
  for (const table of tables.values()) table.handNo = 1;

  // Bust p20 down to p2, one at a time; p1 is the last player standing.
  for (let i = 20; i >= 2; i -= 1) {
    const id = `p${i}`;
    const table = room.tableOf(id);
    table.seatOf(id).player.stack = 0;
    room.onBust(table.cfg.id, player(i));
    table.stand(id);
  }
  room.checkWinner();

  const ledger = [
    ...calls.busts.filter((b) => b.payout > 0).map((b) => ({ place: b.place, amount: b.payout })),
    ...calls.winners.map((w) => ({ place: w.place, amount: w.prize })),
  ].sort((a, b) => a.place - b.place);
  assert.deepEqual(ledger, payoutTable(20, prizePool));
  assert.deepEqual(ledger.map((row) => row.place), [1, 2, 3], 'each paid place exactly once');
  assert.equal(ledger.reduce((total, row) => total + row.amount, 0), prizePool);
  assert.deepEqual(calls.busts.map((b) => b.place), Array.from({ length: 19 }, (_, i) => 20 - i));
  assert.equal(room.winner.id, 'p1');
});

test('a satellite room pays the seat as a ticket and no chips down the field', () => {
  const { room, tables, calls } = harness({ mode: 'SATELLITE' });
  for (let i = 1; i <= 4; i += 1) room.seat(player(i), { stack: 1000 });
  tables.get('tourney-t1').handNo = 1;
  for (let i = 4; i >= 2; i -= 1) {
    const table = room.tableOf(`p${i}`);
    table.seatOf(`p${i}`).player.stack = 0;
    room.onBust(table.cfg.id, player(i));
    table.stand(`p${i}`);
  }
  room.checkWinner();
  assert.ok(calls.busts.every((b) => b.payout === 0));
  assert.equal(calls.winners[0].prize, 0);
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
  flight2.inHand = true;
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
  // Two entrants: DanGG rule two-player band, 62.5% to the winner.
  assert.equal(room.winner.prize, 6250);
  assert.equal(calls.winners.length, 1);
  assert.equal(calls.winners[0].playerId, 'p1');
  assert.equal(calls.winners[0].prize, 6250);
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
function liveHarness({ seats = 6, prizePool = 0, showdownDelay = 0, settleRoom = false } = {}) {
  const tables = new Map();
  const busts = [];
  const winners = [];
  let room;
  const hooks = {
    onEvent: () => {},
    onTournamentBust: (table, p) => room.onBust(table.cfg.id, p),
    onFlightSettled: () => { if (settleRoom) room.onFlightSettled(); },
  };
  room = new TournamentRoom({
    id: 't1',
    seats,
    maxTables: 4,
    tournament: { prizePool, mode: 'STANDARD', blindEvery: 5 },
    ops: {
      table: (id) => tables.get(id) || null,
      createTable: ({ tableId, index, tournament }) => {
        const table = new PokerTable({
          id: tableId, name: 'Flight', game: 'holdem', sb: 50, bb: 100, seats,
          min_buyin: 1500, max_buyin: 1500, flightIndex: index, tournament,
        }, hooks);
        table.showdownDelay = showdownDelay;
        tables.set(tableId, table);
        return table;
      },
      closeTable: (id) => tables.delete(id),
      broadcast: () => {},
      evictBot: () => false,
      notifyPlayer: () => {},
      persistBust: (record) => busts.push(record),
      persistWinner: (record) => winners.push(record),
    },
  });
  return { room, tables, busts, winners };
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

/* ------------------------- soak regressions (T3) ------------------------- */

test('a stale inHand flag does not block a move once no hand is running', () => {
  const { room, tables } = harness();
  for (let i = 1; i <= 8; i += 1) room.seat(player(i), { stack: 1000 });
  const flight1 = tables.get('tourney-t1');
  // p6 played the last hand on flight 1; the flag outlives the hand.
  flight1.seatOf('p6').player.inHand = true;

  flight1.inHand = true; // a hand is running: never pull a player out of it
  assert.equal(room.movePlayer({ playerId: 'p6', from: 'tourney-t1', to: 'tourney-t1-1' }, 'balance'), null);

  flight1.inHand = false; // between hands: the flag is stale
  const moved = room.movePlayer({ playerId: 'p6', from: 'tourney-t1', to: 'tourney-t1-1' }, 'balance');
  assert.equal(moved?.to, 'tourney-t1-1');
  assert.ok(tables.get('tourney-t1-1').seatOf('p6'));
});

test('a busted seat waiting to be cleared is never moved and its table is not half broken', () => {
  const { room, tables } = harness();
  for (let i = 1; i <= 8; i += 1) room.seat(player(i), { stack: 1000 });
  const short = tables.get('tourney-t1-1');
  short.seatOf('p8').player.stack = 0;
  assert.equal(room.breakFlight('tourney-t1-1'), false);
  assert.deepEqual(short.occupiedSeats().map((s) => s.player.id), ['p7', 'p8'], 'nobody left the table');
});

test('a finished hand clears inHand on a real table once its delay runs out', () => {
  const table = new PokerTable({
    id: 'cash-inhand', name: 'Cash', game: 'holdem', sb: 50, bb: 100, seats: 6,
    min_buyin: 1500, max_buyin: 1500,
  }, { onEvent: () => {} });
  table.sit({ id: 'a', nick: 'A' }, 0, 1500);
  table.sit({ id: 'b', nick: 'B' }, 1, 1500);
  assert.ok(table.handInProgress(), 'two players start a hand');
  assert.equal(table.act(table.actor, 'fold').ok, true);
  assert.equal(table.handInProgress(), false);
  const survivor = table.occupiedSeats().find((s) => s.player.id === 'a').player;
  table.stand('b'); // leave between hands so no new deal follows
  assert.equal(survivor.inHand, true, 'the flag still describes the last hand during its delay');
  table.tick(table.nextHandAt + 1);
  assert.equal(survivor.inHand, false, 'the hand is over and the flag is cleared');
});

test('simultaneous busts on two tables get unique places by starting stack', () => {
  const { room, tables, calls } = harness();
  for (let i = 1; i <= 8; i += 1) room.seat(player(i), { stack: 1000 });
  const flight1 = tables.get('tourney-t1');
  const flight2 = tables.get('tourney-t1-1');
  // Both hands are over; each table still shows its busted seat at 0.
  flight1.handStartStack = { p1: 400 };
  flight2.handStartStack = { p7: 900 };
  flight1.seatOf('p1').player.stack = 0;
  flight2.seatOf('p7').player.stack = 0;

  // Flight 2 ticks first, then flight 1; the order must not change the places.
  const p7 = room.onBust('tourney-t1-1', player(7));
  flight2.stand('p7');
  assert.equal(room.onBust('tourney-t1', player(1)), null, 'p1 was ranked in the same pass');
  flight1.stand('p1');

  assert.equal(p7.place, 7, 'the larger starting stack finishes higher');
  assert.deepEqual(calls.busts.map((b) => [b.playerId, b.place]), [['p1', 8], ['p7', 7]]);
  assert.deepEqual(room.finished.map((r) => r.place).sort(), [7, 8]);
});

test('equal starting stacks bust together rank clockwise from the button', () => {
  const { room, tables, calls } = harness();
  for (let i = 1; i <= 6; i += 1) room.seat(player(i), { stack: 1000 });
  const flight = tables.get('tourney-t1');
  flight.button = 2; // seat 3 (p4) is first clockwise from the button
  flight.handStartStack = { p2: 500, p4: 500 };
  flight.seatOf('p2').player.stack = 0;
  flight.seatOf('p4').player.stack = 0;
  room.onBust('tourney-t1', player(2));
  room.onBust('tourney-t1', player(4));
  assert.deepEqual(calls.busts.map((b) => [b.playerId, b.place]), [['p2', 6], ['p4', 5]]);
});

test('the winner waits for the final hand to resolve so 2nd place is recorded', () => {
  const prizePool = 10000;
  const { room, tables, calls } = harness({ prizePool });
  room.seat(player(1), { stack: 1000 });
  room.seat(player(2), { stack: 1000 });
  const table = tables.get('tourney-t1');
  table.handNo = 1;
  // The final hand is in its showdown delay: p2 has 0 chips but is still seated.
  table.nextHandAt = Date.now() + 4000;
  table.seatOf('p2').player.stack = 0;
  assert.equal(room.checkWinner(), null, 'no winner during the showdown delay');
  room.sweep();
  assert.equal(room.winner, null);

  table.nextHandAt = 0; // the delay ran out: the table clears the bust
  assert.equal(room.onBust('tourney-t1', player(2)).place, 2);
  table.stand('p2');
  assert.equal(room.checkWinner().id, 'p1');
  const paid = calls.busts.reduce((sum, b) => sum + b.payout, 0) + calls.winners[0].prize;
  assert.equal(paid, prizePool);
});

test('a heads-up finish on real tables pays 2nd and 1st and the ledger equals the pool', () => {
  const prizePool = 10000;
  const { room, tables, busts, winners } = liveHarness({ prizePool, showdownDelay: 4200, settleRoom: true });
  room.seatRegistrants(field(2), { stack: 1500 });
  const table = tables.get('tourney-t1');
  for (const seat of table.occupiedSeats()) Object.assign(seat.player, { isBot: true, away: false, sittingOut: false });
  let now = Date.now();
  // Tables tick every 260 ms and the room sweeps every 2 s, as in index.js.
  for (let i = 0; i < 200000 && !room.winner; i += 1) {
    now += 260;
    table.tick(now);
    if (i % 8 === 0) room.sweep();
  }
  assert.ok(room.winner, 'the event finished');
  assert.equal(busts.length, 1);
  assert.equal(busts[0].place, 2);
  assert.equal(winners.length, 1);
  assert.deepEqual([winners[0].prize, busts[0].payout], payoutTable(2, prizePool).map((row) => row.amount));
  assert.equal(busts[0].payout + winners[0].prize, prizePool);
  assert.equal(table.seatOf(room.winner.id).player.stack, 3000, 'every chip ends with the winner');
});


test('a room snapshot restores seats, stacks, level and finishes', () => {
  const { room, tables } = harness();
  room.tournament.level = 3;
  room.tournament.levelStartedAt = 1_700_000_000_000;
  room.seat(player(1), { stack: 900 });
  room.seat(player(2), { stack: 800 });
  room.finished.push({ id: 'p9', nick: 'P9', place: 5, payout: 100, tableId: 'tourney-t1' });
  tables.get('tourney-t1').finished = [];

  const snapshot = room.snapshot();
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.level, 3);
  assert.equal(snapshot.flights[0].players.find((p) => p.id === 'p1').stack, 900);

  const restoredHarness = harness();
  assert.equal(restoredHarness.room.restore(snapshot), true);
  const table = restoredHarness.tables.get('tourney-t1');
  assert.equal(table.seatOf('p1').player.stack, 900);
  assert.equal(table.seatOf('p2').player.stack, 800);
  assert.equal(restoredHarness.room.tournament.level, 3);
  assert.equal(restoredHarness.room.tournament.levelStartedAt, 1_700_000_000_000);
  assert.deepEqual(restoredHarness.room.finished.map((r) => r.place), [5]);
  assert.deepEqual(table.finished.map((r) => r.id), ['p9']);
});

test('a malformed or older room snapshot is ignored', () => {
  const { room } = harness();
  assert.equal(room.restore(null), false);
  assert.equal(room.restore({ version: 0 }), false);
  assert.equal(room.restore({ version: 1, flights: [] }), true);
});
