// Engine-to-room integration: real PokerTable instances driven by the room.
//
// These tests exercise the wiring that index.js performs in production (bust
// hook, flight-settled hook, table creation) without HTTP or sockets, so a
// regression in the managed-tournament path fails fast.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';
import { TournamentRoom } from './tournament-room.js';

function wire({ seats = 2, prizePool = 10000, mode = 'STANDARD', maxTables = 4 } = {}) {
  const tables = new Map();
  const calls = { busts: [], winners: [], moves: [], closed: [] };
  let room;
  const hooks = {
    onEvent: () => {},
    onTournamentBust: (table, player) => room.onBust(table.cfg.id, player),
    onFlightSettled: () => room.onFlightSettled(),
    onTournamentPayout: () => { throw new Error('a managed table must not pay out locally'); },
    onTournamentEnd: () => { throw new Error('a managed table must not end the event locally'); },
  };
  const ops = {
    table: (id) => tables.get(id) || null,
    createTable: ({ tableId, index, tournament }) => {
      const table = new PokerTable({
        id: tableId,
        name: 'Flight',
        game: 'holdem',
        sb: 50,
        bb: 100,
        seats,
        min_buyin: 1000,
        max_buyin: 1000,
        flightIndex: index,
        tournament,
      }, hooks);
      // Deal nothing; these tests drive eliminations directly.
      table.holdStart = true;
      tables.set(tableId, table);
      return table;
    },
    closeTable: (id) => { tables.delete(id); calls.closed.push(id); },
    broadcast: () => {},
    evictBot: (table) => {
      // Mirrors index.js: prefer a bot that is not in the running hand.
      const bots = table.occupiedSeats().filter((s) => s.player.isBot);
      if (!bots.length) return false;
      const idle = bots.find((s) => !table.handInProgress() || !s.player.inHand || s.player.folded);
      table.stand((idle || bots[0]).player.id);
      return true;
    },
    notifyPlayer: (userId, message) => calls.moves.push({ userId, ...message }),
    persistBust: (record) => calls.busts.push(record),
    persistWinner: (record) => calls.winners.push(record),
  };
  room = new TournamentRoom({ id: 't1', seats, maxTables, tournament: { prizePool, mode }, ops });
  return { room, tables, calls };
}

/** Clear a stack and let the real table tick run its elimination pass. */
function bust(table, playerId) {
  table.seatOf(playerId).player.stack = 0;
  table.street = 'ended';
  table.nextHandAt = 1;
  table.tick(2);
}

const player = (n) => ({ id: `p${n}`, nick: `P${n}`, avatar: '' });

test('a managed table hands its busts to the room and pays nobody itself', () => {
  const { room, tables, calls } = wire();
  for (let i = 1; i <= 4; i += 1) room.seat(player(i), { stack: 1000 });
  assert.equal(room.flights.length, 2);

  bust(tables.get('tourney-t1'), 'p2');

  assert.equal(calls.busts.length, 1);
  assert.equal(calls.busts[0].playerId, 'p2');
  assert.equal(calls.busts[0].place, 4, 'place is counted across both flights');
  assert.equal(room.winner, null, 'the other flight still has players');
});

test('the last standing player wins across flights and the event closes', () => {
  const { room, tables, calls } = wire();
  room.seat(player(1), { stack: 1000 });
  room.seat(player(2), { stack: 1000 });
  const table = tables.get('tourney-t1');
  table.handNo = 1;
  bust(table, 'p2');

  // DanGG rule, two-player band: 62.5% / 37.5%, the whole pool paid out.
  assert.deepEqual(calls.busts.map((b) => [b.place, b.payout]), [[2, 3750]]);
  assert.equal(room.winner.id, 'p1');
  assert.equal(calls.winners.length, 1);
  assert.equal(calls.winners[0].prize, 6250);
});

test('a balancing move carries the stack to the real target table', () => {
  const { room, tables, calls } = wire({ seats: 3 });
  for (let i = 1; i <= 6; i += 1) room.seat(player(i), { stack: 1000 });
  const flight1 = tables.get('tourney-t1'); // p1, p2, p3
  const flight2 = tables.get('tourney-t1-1'); // p4, p5, p6
  assert.equal(flight1.occupiedSeats().length, 3);
  flight1.seatOf('p1').player.stack = 1750;
  flight1.stand('p2');
  flight1.stand('p3');

  // 1 vs 3 players: the sweep pulls one across, with their stack.
  room.sweep();
  assert.equal(flight1.occupiedSeats().length, 2);
  const movedId = ['p4', 'p5', 'p6'].find((id) => flight1.seatOf(id));
  assert.ok(movedId, 'a player was balanced onto the short flight');
  assert.equal(flight1.seatOf(movedId).player.stack, 1000);
  assert.equal(flight2.seatOf(movedId), undefined);
  const notice = calls.moves.find((m) => m.type === 'table_move' && m.userId === movedId);
  assert.ok(notice, 'the moved player is told to rebind');
  assert.equal(notice.reason, 'balance');
});
