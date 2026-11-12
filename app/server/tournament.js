// Multi-table tournament seating: flights, balancing and table breaks.
//
// The live server still seats a tournament at a single table, so this module is
// the engine the seating rewrite will call. It is deliberately pure — every
// function takes plain snapshots and returns new ones — so the invariants
// (chip conservation, no table over capacity, balanced counts) are testable
// without spinning up sockets or a database.

export const MIN_TABLE_SIZE = 3;

/** How many tables a field of `players` needs at `seatsPerTable` seats. */
export function tableCount(players, seatsPerTable) {
  if (players <= 0) return 0;
  if (seatsPerTable <= 0) throw new Error('seatsPerTable must be positive');
  return Math.ceil(players / seatsPerTable);
}

/**
 * Split players into flights of tables.
 * Returns [{ id, players }] with sizes differing by at most one seat, so no
 * table is short while another is full.
 */
export function seatPlayers(players, seatsPerTable, tablePrefix = 't') {
  if (!Array.isArray(players)) throw new Error('players must be an array');
  const count = tableCount(players.length, seatsPerTable);
  const tables = Array.from({ length: count }, (_, i) => ({ id: `${tablePrefix}${i + 1}`, players: [] }));
  // Deal round-robin so empties never cluster; stacks travel with the player.
  players.forEach((player, index) => {
    tables[index % count].players.push({ ...player });
  });
  return tables;
}

/** Total chips across every table — the invariant every move must preserve. */
export function totalChips(tables) {
  return tables.reduce((sum, table) => sum + table.players.reduce((s, p) => s + Number(p.stack || 0), 0), 0);
}

/**
 * The single next move that would balance the field, or null when it is balanced.
 * Moves are considered only between tables whose sizes differ by 2 or more.
 * `canMove` lets the live server refuse to pull a player out of a running hand.
 */
export function nextBalancingMove(tables, { canMove = () => true } = {}) {
  if (tables.length < 2) return null;
  const sorted = [...tables].sort((a, b) => a.players.length - b.players.length);
  const smallest = sorted[0];
  const largest = sorted[sorted.length - 1];
  if (largest.players.length - smallest.players.length < 2) return null;
  const player = [...largest.players].reverse().find((p) => canMove(p));
  if (!player) return null;
  return { playerId: player.id, from: largest.id, to: smallest.id };
}

/** Apply one balancing move, returning a new set of tables. */
export function applyMove(tables, move) {
  if (!move) return tables;
  return tables.map((table) => {
    if (table.id === move.from) {
      return { ...table, players: table.players.filter((p) => p.id !== move.playerId) };
    }
    if (table.id === move.to) {
      const moving = tables.find((t) => t.id === move.from)?.players.find((p) => p.id === move.playerId);
      if (!moving) return table;
      return { ...table, players: [...table.players, { ...moving }] };
    }
    return table;
  });
}

/** Repeatedly balance until no move is possible. */
export function balanceAll(tables, options = {}) {
  let current = tables;
  const moves = [];
  for (let guard = 0; guard < 10_000; guard += 1) {
    const move = nextBalancingMove(current, options);
    if (!move) break;
    moves.push(move);
    current = applyMove(current, move);
  }
  return { tables: current, moves };
}

/**
 * Tables that should break: short-handed while another table can take them.
 * A table is never broken while it is the only one left.
 */
export function tablesToBreak(tables, minSize = MIN_TABLE_SIZE) {
  if (tables.length < 2) return [];
  return tables.filter((t) => t.players.length > 0 && t.players.length < minSize).map((t) => t.id);
}

/**
 * Break the given tables into the remaining ones, smallest player first so the
 * receiving tables stay as even as possible. Returns the surviving tables, the
 * moves performed and the ids that were removed.
 */
export function breakTables(tables, tableIds, seatsPerTable) {
  let current = tables.map((t) => ({ ...t, players: [...t.players] }));
  const moves = [];
  const broken = [];
  for (const id of tableIds) {
    const source = current.find((t) => t.id === id);
    if (!source || current.length < 2) continue;
    const recipients = current.filter((t) => t.id !== id);
    const moved = new Set();
    for (const player of source.players) {
      const target = recipients
        .filter((t) => t.players.length < seatsPerTable)
        .sort((a, b) => a.players.length - b.players.length)[0];
      if (!target) break; // no room anywhere: keep the table alive instead of dropping players
      moves.push({ playerId: player.id, from: id, to: target.id });
      target.players.push({ ...player });
      moved.add(player);
    }
    // Only close the table once every player actually landed somewhere.
    if (source.players.every((p) => moved.has(p))) {
      current = current.filter((t) => t.id !== id);
      broken.push(id);
    }
  }
  return { tables: current, moves, broken };
}

/**
 * Pick the flight table a joining human should be seated at.
 *
 * `occupancies` is the current human count per table in order, `seats` the
 * capacity of one table, `maxTables` the most flights this event may open.
 * Returns a 1-based table index. A new table is only opened when every
 * existing one is full, so humans cluster instead of scattering one per table.
 */
export function nextTableIndex(occupancies, seats, maxTables) {
  if (seats <= 0) throw new Error('seats must be positive');
  if (maxTables <= 0) throw new Error('maxTables must be positive');
  for (let i = 0; i < occupancies.length && i < maxTables; i += 1) {
    if (occupancies[i] < seats) return i + 1;
  }
  if (occupancies.length >= maxTables) return null;
  return occupancies.length + 1;
}

/**
 * Pick the flight for a joining human when flights may have been broken.
 *
 * Unlike `nextTableIndex`, the input is keyed by flight index so a gap left by
 * a broken table is reused instead of shifting every later table. Indices are
 * scanned in order and the first one that can take the player wins: an open
 * flight with human room, or the lowest unopened index. Returns null when the
 * flight cap is reached.
 */
export function nextFlightIndex(humansByIndex, seats, maxTables) {
  if (seats <= 0) throw new Error('seats must be positive');
  if (maxTables <= 0) throw new Error('maxTables must be positive');
  const counts = humansByIndex instanceof Map
    ? humansByIndex
    : new Map(Object.entries(humansByIndex || {}).map(([key, value]) => [Number(key), Number(value)]));
  for (let i = 1; i <= maxTables; i += 1) {
    const count = counts.get(i);
    if (count == null) return i;
    if (count < seats) return i;
  }
  return null;
}

/** Table ids for a tournament's flights, oldest naming first for compatibility. */
export function tournamentTableIds(tournamentId, maxTables = 12) {
  const ids = [`tourney-${tournamentId}`];
  for (let i = 1; i <= maxTables; i += 1) ids.push(`tourney-${tournamentId}-${i}`);
  return ids;
}

/**
 * The live table id of one flight. Flight 1 keeps the legacy `tourney-<id>` id
 * so existing links, registrations and sockets keep working.
 */
export function flightTableId(tournamentId, index) {
  if (!Number.isInteger(index) || index < 1) throw new Error('index must be a positive integer');
  return tournamentTableIds(tournamentId, index)[index - 1];
}

/* -------------------------------- payouts -------------------------------- */

/**
 * DanGG rule — tournament payout bands by field size.
 *
 * The native GGPoker payout bands are not captured yet (plan slice T0), so this
 * keeps DanGG's long-standing 50/30/20 split and expresses it as a field-size
 * band table. When T0 lands, only this table changes. Shares are in basis
 * points (1/100 of a percent) so each band sums to exactly 10000.
 *
 * - 2 entrants: the 50/30 split for the two places, renormalised (62.5/37.5).
 * - 3+ entrants: 50/30/20 for the top three.
 */
export const DANGG_PAYOUT_BANDS = Object.freeze([
  Object.freeze({ minEntrants: 2, maxEntrants: 2, sharesBp: Object.freeze([6250, 3750]) }),
  Object.freeze({ minEntrants: 3, maxEntrants: Infinity, sharesBp: Object.freeze([5000, 3000, 2000]) }),
]);

const BASIS_POINTS = 10000;

/** The DanGG band that covers a field of `entrants`, or null below two players. */
export function payoutBand(entrants) {
  const field = Math.floor(Number(entrants) || 0);
  return DANGG_PAYOUT_BANDS.find((band) => field >= band.minEntrants && field <= band.maxEntrants) || null;
}

/**
 * Every paid place for a field: [{ place, amount, ticket? }], 1st first.
 *
 * Amounts are whole chips that sum exactly to the prize pool (the rounding
 * remainder goes to 1st) and never increase down the table. A satellite pays a
 * single seat — 1st wins the ticket — and no chips. A field under two players
 * pays the whole pool to 1st.
 */
export function payoutTable(entrants, prizePool, { mode = 'STANDARD', ticket = '' } = {}) {
  if (mode === 'SATELLITE') return [{ place: 1, amount: 0, ticket: ticket || 'Satellite ticket' }];
  const pool = Math.max(0, Math.floor(Number(prizePool) || 0));
  const band = payoutBand(entrants);
  if (!band) return [{ place: 1, amount: pool }];
  const amounts = band.sharesBp.map((bp) => Math.floor((pool * bp) / BASIS_POINTS));
  const remainder = pool - amounts.reduce((sum, amount) => sum + amount, 0);
  return amounts.map((amount, index) => ({ place: index + 1, amount: index === 0 ? amount + remainder : amount }));
}

/** The chip amount a place earns from a payout table (0 when unpaid). */
export function payoutFor(table, place) {
  return table.find((row) => row.place === place)?.amount || 0;
}

/** The first unpaid place: the bubble ("Bubble: 4th"). */
export function bubblePlace(table) {
  return table.length + 1;
}

/** The prize pool of a tournament row: the guarantee or the collected buy-ins. */
export function prizePoolOf(t) {
  return Math.max(Number(t.gtd) || 0, (Number(t.entrants) || 0) * ((Number(t.buyin) || 0) + (Number(t.fee) || 0)));
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(n) {
  const value = Math.floor(Number(n) || 0);
  const teen = value % 100;
  if (teen >= 11 && teen <= 13) return `${value}th`;
  return `${value}${{ 1: 'st', 2: 'nd', 3: 'rd' }[value % 10] || 'th'}`;
}
