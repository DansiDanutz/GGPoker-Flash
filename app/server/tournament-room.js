// Live multi-table tournament room.
//
// `tournament.js` is the pure seating engine: it decides who belongs at which
// table. A room is the live counterpart: it owns the flights of one tournament,
// moves real players between live tables, assigns finish places across the
// whole field and calls back into the server for persistence and sockets.
//
// Every table operation goes through `ops`, so the room is testable with fake
// tables (see tournament-room.test.js) and the server keeps all database and
// transport code in index.js. Stacks live on the tables, never in the room.

import {
  balanceAll,
  flightTableId,
  nextFlightIndex,
  tablesToBreak,
  MIN_TABLE_SIZE,
  payoutFor,
  payoutTable,
} from './tournament.js';

export const MAX_FLIGHTS = 24;

export class TournamentRoom {
  /**
   * @param {object} options
   * @param {string} options.id                tournament id
   * @param {number} options.seats             seats per flight
   * @param {object} options.tournament        shared descriptor handed to every flight table
   * @param {number} [options.maxTables]       flight cap for this event
   * @param {object} options.ops               server operations (see index.js)
   */
  constructor({ id, seats, tournament, maxTables = MAX_FLIGHTS, ops }) {
    if (!id) throw new Error('id is required');
    if (!Number.isInteger(seats) || seats < 2) throw new Error('seats must be at least 2');
    if (!ops) throw new Error('ops are required');
    this.id = id;
    this.seats = seats;
    this.maxTables = maxTables;
    this.tournament = tournament || {};
    this.ops = ops;
    this.tournament.managed = true;
    this.flights = []; // [{ index, id }] ascending by index
    this.finished = []; // busted players, newest last: { id, nick, place, payout }
    this.winner = null;
  }

  /* ------------------------------ inventory ------------------------------ */

  flightIndexOf(tableId) {
    return this.flights.find((f) => f.id === tableId)?.index ?? null;
  }

  tableOf(playerId) {
    for (const flight of this.flights) {
      const table = this.ops.table(flight.id);
      if (table?.seatOf(playerId)) return table;
    }
    return null;
  }

  /** A serializable room snapshot for restart recovery (stacks at the last save). */
  snapshot() {
    return {
      version: 1,
      savedAt: Date.now(),
      level: Number(this.tournament.level) || 1,
      levelStartedAt: Number(this.tournament.levelStartedAt) || null,
      entrants: this.tournament.entrants ?? null,
      winner: this.winner,
      finished: this.finished.map((record) => ({ ...record })),
      flights: this.flightState().map((flight) => ({
        index: flight.index,
        id: flight.id,
        players: flight.players.map((p) => ({
          id: p.id, nick: p.nick, avatar: p.avatar, stack: p.stack,
          seat: p.seat, away: p.away, sittingOut: p.sittingOut,
        })),
      })),
    };
  }

  /**
   * Rebuild a room from a snapshot taken after a hand. The interrupted hand is
   * not replayed: players return with the recorded stacks and the blind clock
   * resumes where it was. Missing/older snapshots are ignored.
   */
  restore(snapshot) {
    if (!snapshot || snapshot.version !== 1) return false;
    const level = Math.max(1, Number(snapshot.level) || 1);
    this.tournament.level = level;
    this.tournament.levelStartedAt = Number(snapshot.levelStartedAt) || Date.now();
    if (snapshot.entrants != null) this.tournament.entrants = snapshot.entrants;
    this.finished = Array.isArray(snapshot.finished) ? snapshot.finished.map((record) => ({ ...record })) : [];
    this.winner = snapshot.winner || null;
    const tables = [];
    for (const flight of Array.isArray(snapshot.flights) ? snapshot.flights : []) {
      const table = this.ensureFlight(Number(flight.index));
      if (!table) continue;
      table.holdStart = true;
      for (const p of Array.isArray(flight.players) ? flight.players : []) {
        if (table.seatOf(p.id)) continue;
        const stack = Number(p.stack) >= 0 ? Number(p.stack) : 0;
        let result = table.sit({ id: p.id, nick: p.nick, avatar: p.avatar || '' }, Number.isInteger(p.seat) ? p.seat : null, stack);
        if (!result.ok) {
          console.error('tournament restore seat', this.id, table.cfg.id, p.nick, result.error);
          result = table.sit({ id: p.id, nick: p.nick, avatar: p.avatar || '' }, null, stack);
        }
        const seated = table.seatOf(p.id)?.player;
        if (seated) {
          seated.away = !!p.away;
          seated.sittingOut = !!(p.sittingOut || p.away);
        }
      }
      table.finished = this.finished
        .filter((record) => record.tableId === flight.id)
        .map((record) => ({ id: record.id, nick: record.nick, place: record.place, payout: record.payout }));
      tables.push(table);
    }
    for (const table of tables) {
      table.holdStart = false;
      table.maybeStart?.();
      this.ops.broadcast(table.cfg.id);
      console.log('tournament restore seated', this.id, table.cfg.id, table.occupiedSeats().length);
    }
    return true;
  }

  /** Seats per flight, read from the live tables. */
  flightState() {
    return this.flights.map((flight) => {
      const table = this.ops.table(flight.id);
      const handLive = !!table?.handInProgress();
      return {
        id: flight.id,
        index: flight.index,
        players: table ? table.occupiedSeats().map((seat) => ({
          id: seat.player.id,
          nick: seat.player.nick,
          avatar: seat.player.avatar || '',
          stack: seat.player.stack,
          isBot: !!seat.player.isBot,
          inHand: !!seat.player.inHand,
          movable: isMovable(seat.player, handLive),
          seat: seat.index,
          away: !!seat.player.away,
          sittingOut: !!seat.player.sittingOut,
        })) : [],
      };
    });
  }

  /**
   * The paid places for this field (DanGG rule, see tournament.js). The field
   * is the registered entrants, or everyone seated or busted so far if more;
   * `minField` covers a bust that is not recorded yet.
   */
  payouts(minField = 0) {
    const seen = this.alivePlayers().length + this.finished.length;
    const field = Math.max(Number(this.tournament.entrants) || 0, seen, minField);
    return payoutTable(field, this.tournament.prizePool, { mode: this.tournament.mode, ticket: this.tournament.ticket });
  }

  /** Field-wide status for the table snapshot and the lobby. */
  stats() {
    const alive = this.alivePlayers();
    return {
      tables: this.flights.length,
      playersLeft: alive.length,
      humansLeft: alive.filter((p) => !p.isBot).length,
      finished: this.finished.length,
      winner: this.winner,
    };
  }

  /* -------------------------------- seating -------------------------------- */

  /**
   * Catch the blind clock up when the first flight of an event opens after its
   * scheduled start. Every flight shares the descriptor, so one clock rules all.
   */
  syncLevel(now = Date.now()) {
    const interval = Number(this.tournament.blindEvery) * 60000;
    const startedAt = Number(this.tournament.levelStartedAt);
    if (!interval || !startedAt) return this.tournament.level || 1;
    const elapsed = now - startedAt;
    if (elapsed >= interval) {
      const levels = Math.floor(elapsed / interval);
      this.tournament.level = (Number(this.tournament.level) || 1) + levels;
      this.tournament.levelStartedAt = startedAt + levels * interval;
    }
    return this.tournament.level || 1;
  }

  /** Create a flight table if it is not open yet. */
  ensureFlight(index) {
    const existing = this.flights.find((f) => f.index === index);
    if (existing) {
      const open = this.ops.table(existing.id);
      if (open) return open;
      // The table was closed underneath us (an admin close, an idle sweep):
      // forget the stale flight and open a fresh table at the same index.
      this.flights = this.flights.filter((f) => f.index !== index);
    }
    if (index > this.maxTables) return null;
    this.syncLevel();
    const tableId = flightTableId(this.id, index);
    const table = this.ops.createTable({ tableId, index, tournament: this.tournament, room: this });
    if (!table) return null;
    this.flights.push({ index, id: tableId });
    this.flights.sort((a, b) => a.index - b.index);
    return table;
  }

  /**
   * Seat a human. Humans fill a flight before another one is opened, even when
   * that flight is already full of bots: a bot makes room. Returns the table id
   * so the caller can send the client there.
   */
  seat(player, { stack } = {}) {
    const placed = this.allocate(player, stack);
    if (!placed.ok || placed.reconnect) return placed.response;
    const { table } = placed;
    // Keep the flight full the way the single-table tournament did.
    const free = table.cfg.seats - table.occupiedSeats().length;
    if (free > 0) table.fillBots(free);
    table.maybeStart();
    this.ops.broadcast(table.cfg.id);
    return placed.response;
  }

  /**
   * Seat the whole registered field at the scheduled start, online or not.
   * Each registrant goes through the same flight allocation as `seat()`, but
   * arrives away and sitting out: an elimination table still deals them in and
   * auto-folds or auto-checks for them until they open the table. No bots are
   * added; the sweep balances the real field across its flights.
   *
   * @param {Array<{id: number|string, nick: string, avatar?: string}>} registrants
   * @param {{stack?: number}} [options]
   * @returns {{seated: Array<{id, tableId, index, seat, reconnect: boolean}>, failed: Array<{id, error}>}}
   */
  seatRegistrants(registrants, { stack } = {}) {
    const seated = [];
    const failed = [];
    const touched = new Set();
    for (const registrant of registrants || []) {
      const placed = this.allocate(registrant, stack);
      if (!placed.ok) {
        failed.push({ id: registrant.id, error: placed.response.error });
        continue;
      }
      const { response, table } = placed;
      if (!response.reconnect) {
        const sat = table.seatOf(registrant.id)?.player;
        if (sat) Object.assign(sat, { away: true, sittingOut: true });
      }
      touched.add(table.cfg.id);
      seated.push({
        id: registrant.id,
        tableId: response.tableId,
        index: response.index,
        seat: response.seat,
        reconnect: !!response.reconnect,
      });
    }
    for (const tableId of touched) {
      this.ops.table(tableId)?.maybeStart();
      this.ops.broadcast(tableId);
    }
    return { seated, failed };
  }

  /**
   * Find (or open) the flight for one player and sit them there. An already
   * seated player gets their existing seat back with `reconnect: true`.
   */
  allocate(player, stack) {
    const refuse = (error) => ({ ok: false, response: { ok: false, error } });
    if (this.winner) return refuse('This tournament has finished');
    const seated = this.tableOf(player.id);
    if (seated) {
      return {
        ok: true,
        reconnect: true,
        table: seated,
        response: {
          ok: true,
          tableId: seated.cfg.id,
          index: this.flightIndexOf(seated.cfg.id),
          seat: seated.seatOf(player.id)?.index ?? null,
          reconnect: true,
        },
      };
    }
    const humansByIndex = new Map();
    for (const flight of this.flights) {
      const table = this.ops.table(flight.id);
      humansByIndex.set(flight.index, table ? table.humans().length : 0);
    }
    const index = nextFlightIndex(humansByIndex, this.seats, this.maxTables);
    if (index == null) return refuse('This tournament is full');
    const table = this.ensureFlight(index);
    if (!table) return refuse('No table available');
    if (table.occupiedSeats().length >= table.cfg.seats && !this.ops.evictBot(table)) {
      return refuse('No seat available at this table');
    }
    const result = table.sit({ id: player.id, nick: player.nick, avatar: player.avatar || '' }, null, stack);
    if (!result.ok) return { ok: false, response: result };
    return { ok: true, table, response: { ok: true, tableId: table.cfg.id, index, seat: result.seat } };
  }

  /* ------------------------------ elimination ------------------------------ */

  /**
   * Record a bust across the whole field: places run from the field size down,
   * so the first player out of a twelve-player event finishes 12th, not 6th.
   *
   * Every busted player waiting to be cleared on any settled flight is ranked
   * in the same pass, so busts that land together on different tables get
   * unique places: the smaller starting stack finishes lower, then the seat
   * farther clockwise from its button (see `compareBustOrder`). A table that
   * reports a player the room already ranked gets `null`.
   */
  onBust(tableId, player) {
    if (this.winner) return null;
    if (this.isFinished(player.id)) return null;
    const pending = this.pendingBusts();
    if (!pending.some((bust) => bust.id === player.id)) {
      // Reported by a table the room cannot see as settled: rank it first (lowest).
      pending.unshift({ id: player.id, nick: player.nick, tableId, startStack: -1, seatOrder: Infinity, flightIndex: Infinity });
    }
    const ordered = [...pending].sort(compareBustOrder);
    const remaining = this.playersRemaining() + (this.tableOf(player.id) ? 0 : 1);
    const field = remaining + this.finished.length;
    const records = ordered.map((bust, i) => this.recordBust(bust, remaining - i, field));
    return records.find((record) => record.id === player.id) || null;
  }

  recordBust(bust, place, field) {
    const payout = payoutFor(this.payouts(field), place);
    const record = { id: bust.id, nick: bust.nick, place, payout, tableId: bust.tableId };
    this.finished.push(record);
    this.ops.persistBust({
      tournamentId: this.id, tableId: bust.tableId, playerId: bust.id, nick: bust.nick, place, payout,
    });
    return record;
  }

  isFinished(playerId) {
    return this.finished.some((record) => record.id === playerId);
  }

  /** Seated players not yet recorded out: the places still to be given. */
  playersRemaining() {
    let count = 0;
    for (const flight of this.flights) {
      const table = this.ops.table(flight.id);
      if (!table) continue;
      count += table.occupiedSeats().filter((seat) => seat.player && !this.isFinished(seat.player.id)).length;
    }
    return count;
  }

  /**
   * Players with no chips at a flight whose hand is over, not yet ranked.
   * They are out; their table clears the seat on its next tick.
   */
  pendingBusts() {
    const pending = [];
    for (const flight of this.flights) {
      const table = this.ops.table(flight.id);
      if (!table || table.handInProgress()) continue;
      const size = Number(table.cfg?.seats) || 1;
      const button = Number.isInteger(table.button) ? table.button : -1;
      for (const seat of table.occupiedSeats()) {
        const p = seat.player;
        if (!p || Number(p.stack) > 0 || this.isFinished(p.id)) continue;
        pending.push({
          id: p.id,
          nick: p.nick,
          tableId: flight.id,
          startStack: Number(table.handStartStack?.[p.id]) || 0,
          seatOrder: (((seat.index - button - 1) % size) + size) % size,
          flightIndex: flight.index,
        });
      }
    }
    return pending;
  }

  /**
   * Everyone still in the event. A player with no chips is only out once their
   * table has settled: mid-hand an all-in player has 0 behind but is very much
   * still in, so a table with a running hand counts all of its seats.
   */
  alivePlayers() {
    const alive = [];
    for (const flight of this.flights) {
      const table = this.ops.table(flight.id);
      if (!table) continue;
      const handLive = table.handInProgress();
      for (const seat of table.occupiedSeats()) {
        const p = seat.player;
        if (!p) continue;
        if (handLive || Number(p.stack) > 0) {
          alive.push({ id: p.id, nick: p.nick, isBot: !!p.isBot, stack: p.stack, tableId: flight.id, index: flight.index });
        }
      }
    }
    return alive;
  }

  anyHandInProgress() {
    return this.flights.some((flight) => this.ops.table(flight.id)?.handInProgress());
  }

  /** A flight ran out of opponents; the room decides whether the event is over. */
  onFlightSettled() {
    this.sweep();
  }

  /**
   * The last player standing wins the whole field once play has started. The
   * guard keeps a freshly seated field from "winning" before a hand is dealt,
   * and covers a field emptied by forfeits rather than by busts.
   */
  checkWinner() {
    if (this.winner) return this.winner;
    if (!this.finished.length && !this.anyHandDealt()) return null;
    // Chips leave the stack when they are bet, so wait for every table to be
    // between hands before calling anyone the last player standing.
    if (this.anyHandInProgress()) return null;
    // The final hand is resolved only once its table cleared the post-hand
    // delay and every bust from it is ranked, so 2nd place is always paid.
    if (this.anyHandPending() || this.pendingBusts().length) return null;
    const alive = this.alivePlayers();
    if (alive.length !== 1) return null;
    const winner = alive[0];
    this.winner = {
      id: winner.id,
      nick: winner.nick,
      prize: payoutFor(this.payouts(), 1),
      tableId: winner.tableId,
      place: 1,
    };
    this.ops.persistWinner({
      tournamentId: this.id,
      playerId: winner.id,
      nick: winner.nick,
      prize: this.winner.prize,
      tableId: winner.tableId,
      place: 1,
    });
    this.closeEmptyFlights();
    return this.winner;
  }

  /** A flight between hands whose showdown delay has not run out yet. */
  anyHandPending() {
    return this.flights.some((flight) => Number(this.ops.table(flight.id)?.nextHandAt) > 0);
  }

  anyHandDealt() {
    return this.flights.some((flight) => {
      const table = this.ops.table(flight.id);
      return table && Number(table.handNo) > 0;
    });
  }

  /* ------------------------- balancing and breaks ------------------------- */

  /**
   * Run one balance pass and break every short table that can be absorbed.
   * Players in a running hand are never moved; the next sweep retries.
   */
  sweep() {
    if (this.winner) return { moves: [], broken: [] };
    this.pruneClosedFlights();
    this.checkWinner();
    if (this.winner) return { moves: [], broken: [] };
    const moves = this.balance();
    const broken = this.breakShortTables();
    return { moves, broken };
  }

  /** Drop flights whose table was closed by something other than the room. */
  pruneClosedFlights() {
    const before = this.flights.length;
    this.flights = this.flights.filter((flight) => this.ops.table(flight.id));
    return before - this.flights.length;
  }

  balance() {
    const moves = [];
    if (this.flights.length < 2) return moves;
    const snapshot = this.flightState();
    const { moves: plan } = balanceAll(snapshot, { canMove: (p) => p.movable });
    for (const move of plan) {
      const applied = this.movePlayer(move, 'balance');
      if (applied) moves.push(applied);
    }
    return moves;
  }

  breakShortTables() {
    const broken = [];
    const snapshot = this.flightState();
    const idle = snapshot.filter((flight) => {
      const table = this.ops.table(flight.id);
      return table && !table.handInProgress();
    });
    for (const id of tablesToBreak(idle)) {
      // A previous break in this loop may already have topped this table up.
      const source = this.ops.table(id);
      if (!source || source.occupiedSeats().length >= MIN_TABLE_SIZE) continue;
      if (this.breakFlight(id)) broken.push(id);
    }
    return broken;
  }

  /**
   * Move every player from one idle flight into the others. The table only
   * closes once every player found a seat, so chips can never vanish.
   */
  breakFlight(tableId) {
    const source = this.ops.table(tableId);
    if (!source || source.handInProgress()) return false;
    const players = source.occupiedSeats().map((seat) => seat.player);
    if (!players.length) return this.closeFlight(tableId);
    // A busted seat is cleared on the table's next tick; break after that, never halfway.
    if (players.some((player) => !isMovable(player, false))) return false;
    const recipients = this.flights
      .filter((flight) => flight.id !== tableId)
      .map((flight) => this.ops.table(flight.id))
      .filter(Boolean);
    const free = recipients.reduce((sum, table) => sum + Math.max(0, table.cfg.seats - table.occupiedSeats().length), 0);
    if (free < players.length) return false; // keep the table alive rather than drop players
    for (const player of players) {
      const target = recipients
        .filter((table) => table.occupiedSeats().length < table.cfg.seats)
        .sort((a, b) => a.occupiedSeats().length - b.occupiedSeats().length)[0];
      if (!target) return false;
      if (!this.movePlayer({ playerId: player.id, from: tableId, to: target.cfg.id }, 'break')) return false;
    }
    // Tell anyone still watching (an unseated observer) before the table goes away.
    source.emit({ type: 'table_break', tableId, moved: players.map((p) => ({ id: p.id, nick: p.nick })) });
    return this.closeFlight(tableId);
  }

  /** Move one player with their stack and connection flags intact. */
  movePlayer({ playerId, from, to }, reason) {
    const source = this.ops.table(from);
    const target = this.ops.table(to);
    if (!source || !target || source.cfg.id === target.cfg.id) return null;
    const seat = source.seatOf(playerId);
    if (!seat?.player) return null;
    const player = seat.player;
    if (!isMovable(player, source.handInProgress())) return null;
    if (target.occupiedSeats().length >= target.cfg.seats) return null;
    const profile = {
      id: player.id, nick: player.nick, avatar: player.avatar, isBot: !!player.isBot,
      timeBankCards: player.timeBankCards, timeBankHands: player.timeBankHands,
    };
    const stack = player.stack;
    const flags = {
      disconnected: player.disconnected,
      disconnectedAt: player.disconnectedAt,
      sittingOut: player.sittingOut,
      away: player.away,
    };
    source.stand(player.id);
    const result = target.sit(profile, null, stack);
    if (!result.ok) {
      // Put the player back where they came from; nothing changed.
      source.sit(profile, seat.index, stack);
      return null;
    }
    const moved = target.seatOf(player.id)?.player;
    if (moved) Object.assign(moved, flags);
    target.maybeStart();
    this.ops.broadcast(from);
    this.ops.broadcast(to);
    if (!player.isBot) {
      this.ops.notifyPlayer(player.id, {
        type: 'table_move',
        tableId: to,
        from,
        reason,
        index: this.flightIndexOf(to),
        stack,
      });
    }
    return { playerId, from, to, reason, index: this.flightIndexOf(to) };
  }

  closeFlight(tableId) {
    const table = this.ops.table(tableId);
    if (table?.humans().length) return false; // never strand a human on a closing table
    this.flights = this.flights.filter((flight) => flight.id !== tableId);
    this.ops.closeTable(tableId);
    return true;
  }

  closeEmptyFlights() {
    for (const flight of [...this.flights]) {
      const table = this.ops.table(flight.id);
      if (table && !table.humans().length) this.closeFlight(flight.id);
    }
  }

  /** Tear down every flight. `force` is only for an already-settled event. */
  dispose({ force = false } = {}) {
    for (const flight of [...this.flights]) {
      const table = this.ops.table(flight.id);
      if (!force && table?.humans().length) continue;
      this.ops.closeTable(flight.id);
    }
    this.flights = [];
  }
}

/**
 * A player can change tables when they hold chips and are not in a running
 * hand. `inHand` alone is not enough: it describes the last hand dealt.
 */
function isMovable(player, handLive) {
  return Number(player.stack) > 0 && !(handLive && player.inHand);
}

/**
 * Order simultaneous busts from the lowest finish to the highest: a smaller
 * starting stack finishes lower; on equal stacks, the seat farther clockwise
 * from the button finishes lower (the first seat after the button ranks
 * highest). Ties across flights fall back to flight index, then player id, so
 * the order is always deterministic.
 */
export function compareBustOrder(a, b) {
  if (a.startStack !== b.startStack) return a.startStack - b.startStack;
  if (a.seatOrder !== b.seatOrder) return b.seatOrder - a.seatOrder;
  if (a.flightIndex !== b.flightIndex) return b.flightIndex - a.flightIndex;
  return String(b.id).localeCompare(String(a.id));
}
