#!/usr/bin/env node
// Multi-table tournament soak (plan slice T3). Not part of `npm test`.
//
// Seats a bot field through the real TournamentRoom and PokerTable code, then
// plays the event to a winner on a virtual clock: every table ticks every
// 260 ms and the room sweeps every 2 s, exactly as app/server/index.js does,
// but without waiting for wall-clock time. Invariants checked on every sweep:
//
//   1. chip conservation  - chips on all live tables (stacks, bets, pot of a
//                           running hand) always equal entrants x starting stack;
//   2. one seat per player - no player id sits on two tables, and every entrant
//                           is either seated or recorded out exactly once;
//   3. breaks complete    - a broken table is closed, every player from it is
//                           seated elsewhere with the same stack, and no idle
//                           short table stays unbroken for long.
//
// At the end it also checks the finishing order (places N..2, one winner) and
// that the paid places add up to the prize pool.
//
// Usage (from the repository root):
//   node tools/soak-tournament.mjs [--entrants=60] [--seats=6] [--stack=10000]
//     [--blind-every=1] [--runs=1] [--max-hours=24] [--bot-iterations=0] [--quiet]
//
// --blind-every is in virtual minutes; --max-hours caps virtual time per run.
// Exit codes: 0 every run passed, 1 an invariant failed or a run did not
// finish, 2 bad arguments.

import { performance } from 'node:perf_hooks';

const TICK_MS = 260; // index.js table timer
const SWEEP_MS = 2000; // index.js tournament sweep timer
const MIN_TABLE_SIZE = 3; // tournament.js; a smaller idle table must be broken
const MAX_SHORT_SWEEPS = 15; // sweeps an idle short table may wait for its break
const PRIZE_PER_ENTRANT = 1000;

/* -------------------------------- arguments -------------------------------- */

const DEFAULTS = Object.freeze({
  entrants: 60,
  seats: 6,
  stack: 10000,
  'blind-every': 1,
  runs: 1,
  'max-hours': 24,
  'bot-iterations': 0,
  quiet: false,
});

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (const arg of argv) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (!match || !(match[1] in DEFAULTS)) throw new Error(`unknown argument: ${arg}`);
    const [, key, raw] = match;
    if (typeof DEFAULTS[key] === 'boolean') {
      options[key] = raw == null || raw === 'true';
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) throw new Error(`--${key} needs a non-negative number`);
    options[key] = value;
  }
  if (!Number.isInteger(options.entrants) || options.entrants < 2) throw new Error('--entrants must be an integer >= 2');
  if (!Number.isInteger(options.seats) || options.seats < 2 || options.seats > 10) throw new Error('--seats must be 2..10');
  if (!Number.isInteger(options.runs) || options.runs < 1) throw new Error('--runs must be >= 1');
  if (options['blind-every'] <= 0) throw new Error('--blind-every must be > 0');
  return options;
}

/* ------------------------------ virtual clock ------------------------------ */

// The table and room read Date.now() for every timer; a virtual clock lets a
// multi-hour event play out in seconds without touching game code.
const clock = { now: Date.UTC(2026, 0, 1) };
Date.now = () => clock.now;

const { PokerTable } = await import('../app/server/table.js');
const { TournamentRoom } = await import('../app/server/tournament-room.js');

/* --------------------------------- harness --------------------------------- */

function createHarness(options) {
  const tables = new Map();
  const ledger = { busts: [], winners: [] };
  const breaches = [];
  const stats = { hands: 0, breaks: 0, moves: 0, maxLevel: 1, flightsOpened: 0, sweeps: 0 };
  const bb = Math.max(20, Math.round(options.stack / 100));
  const tournament = {
    prizePool: options.entrants * PRIZE_PER_ENTRANT,
    entrants: options.entrants,
    level: 1,
    blindEvery: options['blind-every'],
    mode: 'STANDARD',
    baseSb: bb,
    baseBb: bb * 2,
    levelStartedAt: clock.now,
    managed: true,
  };
  let room;
  const hooks = {
    onEvent: () => {},
    onTournamentBust: (table, player) => room.onBust(table.cfg.id, player),
    onFlightSettled: () => room.onFlightSettled(),
    onTournamentPayout: () => breaches.push('a managed flight paid out locally'),
    onTournamentEnd: () => breaches.push('a managed flight ended the event locally'),
  };
  const ops = {
    table: (id) => tables.get(id) || null,
    createTable: ({ tableId, index, tournament: descriptor }) => {
      const table = new PokerTable({
        id: tableId, name: 'Soak', game: 'holdem', category: 'Tournament',
        sb: bb, bb: bb * 2, ante: 0, seats: options.seats,
        min_buyin: options.stack, max_buyin: options.stack,
        flightIndex: index, tournament: descriptor,
        botIterations: options['bot-iterations'],
      }, hooks);
      tables.set(tableId, table);
      stats.flightsOpened += 1;
      return table;
    },
    closeTable: (id) => tables.delete(id),
    broadcast: () => {},
    evictBot: () => false, // every entrant is a real registrant; nobody is evicted
    notifyPlayer: () => {},
    persistBust: (record) => ledger.busts.push(record),
    persistWinner: (record) => ledger.winners.push(record),
  };
  room = new TournamentRoom({ id: 'soak', seats: options.seats, maxTables: 24, tournament, ops });
  return { room, tables, ledger, breaches, stats, tournament };
}

/** Seat the field at the start like the scheduler, then hand every seat to the bot driver. */
function seatField(harness, options) {
  const registrants = Array.from({ length: options.entrants }, (_, i) => ({
    id: `e${i + 1}`, nick: `Entrant${i + 1}`,
  }));
  const { seated, failed } = harness.room.seatRegistrants(registrants, { stack: options.stack });
  if (failed.length) harness.breaches.push(`seating failed for ${failed.length} entrants: ${failed[0].error}`);
  for (const table of harness.tables.values()) {
    for (const seat of table.occupiedSeats()) {
      Object.assign(seat.player, { isBot: true, away: false, sittingOut: false });
    }
    table.maybeStart();
  }
  return { ids: registrants.map((r) => r.id), seated: seated.length };
}

/* -------------------------------- invariants -------------------------------- */

function chipsOn(table) {
  const stacks = table.occupiedSeats().reduce((sum, seat) => sum + Number(seat.player.stack), 0);
  return table.handInProgress() ? stacks + table.pot + table.totalBets() : stacks;
}

function seatIndex(harness) {
  const where = new Map();
  for (const [tableId, table] of harness.tables) {
    for (const seat of table.occupiedSeats()) {
      const list = where.get(seat.player.id) || [];
      where.set(seat.player.id, [...list, tableId]);
    }
  }
  return where;
}

function checkSweepInvariants(harness, ctx, label) {
  const breaches = [];
  const total = [...harness.tables.values()].reduce((sum, table) => sum + chipsOn(table), 0);
  if (total !== ctx.totalChips) {
    breaches.push(`${label}: chip conservation broken, ${total} on tables vs ${ctx.totalChips} issued (diff ${total - ctx.totalChips})`);
  }
  const where = seatIndex(harness);
  for (const [id, list] of where) {
    if (list.length > 1) breaches.push(`${label}: ${id} is seated on ${list.length} tables (${list.join(', ')})`);
  }
  const outCounts = new Map();
  for (const record of harness.room.finished) outCounts.set(record.id, (outCounts.get(record.id) || 0) + 1);
  for (const [id, count] of outCounts) {
    if (count > 1) breaches.push(`${label}: ${id} was recorded out ${count} times`);
  }
  const places = new Map();
  for (const record of harness.room.finished) {
    if (places.has(record.place)) breaches.push(`${label}: place ${record.place} given to both ${places.get(record.place)} and ${record.id}`);
    places.set(record.place, record.id);
  }
  for (const id of ctx.ids) {
    if (!where.has(id) && !outCounts.has(id)) breaches.push(`${label}: ${id} is neither seated nor recorded out (lost)`);
  }
  for (const flight of harness.room.flights) {
    if (!harness.tables.has(flight.id)) breaches.push(`${label}: room lists closed flight ${flight.id}`);
  }
  return breaches;
}

/** Wrap breakFlight so every break is verified to finish with nobody dropped. */
function instrumentBreaks(harness) {
  const original = harness.room.breakFlight.bind(harness.room);
  harness.room.breakFlight = (tableId) => {
    const source = harness.tables.get(tableId);
    const before = source ? source.occupiedSeats().map((s) => ({ id: s.player.id, stack: s.player.stack })) : [];
    const done = original(tableId);
    if (!done) return done;
    harness.stats.breaks += 1;
    if (harness.tables.has(tableId)) harness.breaches.push(`break of ${tableId} returned true but the table is still open`);
    const where = seatIndex(harness);
    for (const player of before) {
      const list = where.get(player.id) || [];
      if (list.length !== 1) {
        harness.breaches.push(`break of ${tableId}: ${player.id} is on ${list.length} tables afterwards`);
        continue;
      }
      const stack = harness.tables.get(list[0]).seatOf(player.id).player.stack;
      if (stack !== player.stack) harness.breaches.push(`break of ${tableId}: ${player.id} stack ${player.stack} -> ${stack}`);
    }
    return done;
  };
}

/** An idle table below the minimum must not wait more than a few sweeps for its break. */
function checkShortTables(harness, shortFor, label) {
  const breaches = [];
  const open = new Set(harness.tables.keys());
  for (const id of [...shortFor.keys()]) if (!open.has(id)) shortFor.delete(id);
  if (harness.tables.size < 2) return breaches; // the last table is the final table
  for (const [id, table] of harness.tables) {
    const short = !table.handInProgress() && table.occupiedSeats().length < MIN_TABLE_SIZE;
    const count = short ? (shortFor.get(id) || 0) + 1 : 0;
    shortFor.set(id, count);
    if (count === MAX_SHORT_SWEEPS) {
      breaches.push(`${label}: ${id} sat short (${table.occupiedSeats().length} players, idle) for ${count} sweeps without a break`);
    }
  }
  return breaches;
}

function checkFinish(harness, ctx) {
  const breaches = [];
  const { room, ledger, tournament } = harness;
  if (!room.winner) return [`no winner after the virtual time cap (${room.alivePlayers().length} players left)`];
  if (ledger.winners.length !== 1) breaches.push(`persistWinner called ${ledger.winners.length} times`);
  const places = room.finished.map((r) => r.place).sort((a, b) => a - b);
  const expected = Array.from({ length: ctx.ids.length - 1 }, (_, i) => i + 2);
  if (places.join() !== expected.join()) breaches.push(`finishing places are not 2..${ctx.ids.length}: [${places.join(', ')}]`);
  const winnerSeat = [...harness.tables.values()].map((t) => t.seatOf(room.winner.id)).find(Boolean);
  if (winnerSeat && winnerSeat.player.stack !== ctx.totalChips) {
    breaches.push(`winner holds ${winnerSeat.player.stack} chips, expected all ${ctx.totalChips}`);
  }
  const paid = ledger.busts.reduce((sum, b) => sum + b.payout, 0) + room.winner.prize;
  if (paid !== tournament.prizePool) breaches.push(`paid ${paid} but the prize pool is ${tournament.prizePool}`);
  return breaches;
}

/* ---------------------------------- runner ---------------------------------- */

function countHands(harness, seen) {
  for (const [id, table] of harness.tables) {
    const last = seen.get(id) || 0;
    if (table.handNo > last) {
      harness.stats.hands += table.handNo - last;
      seen.set(id, table.handNo);
    }
  }
}

function runOnce(options, runNo) {
  const startedAt = clock.now;
  const wallStart = performance.now();
  const harness = createHarness(options);
  instrumentBreaks(harness);
  const { ids, seated } = seatField(harness, options);
  const ctx = { ids, totalChips: options.entrants * options.stack };
  const deadline = startedAt + options['max-hours'] * 3600_000;
  const shortFor = new Map();
  const handsSeen = new Map();
  let nextSweep = startedAt + SWEEP_MS;

  while (!harness.room.winner && clock.now < deadline && !harness.breaches.length) {
    clock.now += TICK_MS;
    for (const table of [...harness.tables.values()]) table.tick(clock.now);
    countHands(harness, handsSeen);
    if (clock.now < nextSweep) continue;
    nextSweep += SWEEP_MS;
    const label = `sweep ${harness.stats.sweeps + 1} @ ${formatVirtual(clock.now - startedAt)}`;
    harness.breaches.push(...checkSweepInvariants(harness, ctx, `${label} (before)`));
    const { moves } = harness.room.sweep();
    harness.stats.sweeps += 1;
    harness.stats.moves += moves.length;
    harness.stats.maxLevel = Math.max(harness.stats.maxLevel, Number(harness.tournament.level) || 1);
    if (!harness.room.winner) harness.breaches.push(...checkSweepInvariants(harness, ctx, `${label} (after)`));
    harness.breaches.push(...checkShortTables(harness, shortFor, label));
  }
  if (!harness.breaches.length) harness.breaches.push(...checkFinish(harness, ctx));

  return {
    run: runNo,
    ok: harness.breaches.length === 0,
    breaches: harness.breaches,
    seated,
    virtual: clock.now - startedAt,
    wallMs: performance.now() - wallStart,
    winner: harness.room.winner,
    finished: harness.room.finished.length,
    ...harness.stats,
  };
}

function formatVirtual(ms) {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
}

function report(result, options) {
  const head = `run ${result.run}: ${result.ok ? 'PASS' : 'FAIL'}`;
  const lines = [
    head,
    `  field ${options.entrants} (seated ${result.seated}) on ${options.seats}-max, stack ${options.stack}, blinds every ${options['blind-every']} min`,
    `  wall ${(result.wallMs / 1000).toFixed(1)} s, virtual ${formatVirtual(result.virtual)}, ${result.sweeps} sweeps, ${result.hands} hands, top level ${result.maxLevel}`,
    `  flights opened ${result.flightsOpened}, balance moves ${result.moves}, table breaks ${result.breaks}, players out ${result.finished}`,
  ];
  if (result.winner) lines.push(`  winner ${result.winner.nick} (${result.winner.id}) prize ${result.winner.prize}`);
  if (!result.ok) {
    lines.push(`  ${result.breaches.length} invariant breach(es):`);
    for (const breach of result.breaches.slice(0, 20)) lines.push(`    - ${breach}`);
    if (result.breaches.length > 20) lines.push(`    ... and ${result.breaches.length - 20} more`);
  }
  return lines.join('\n');
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`soak-tournament: ${err.message}\n`);
    return 2;
  }
  const results = [];
  for (let run = 1; run <= options.runs; run += 1) {
    let result;
    try {
      result = runOnce(options, run);
    } catch (err) {
      result = { run, ok: false, breaches: [`crashed: ${err.stack || err}`], seated: 0, virtual: 0, wallMs: 0,
        sweeps: 0, hands: 0, maxLevel: 0, flightsOpened: 0, moves: 0, breaks: 0, finished: 0, winner: null };
    }
    results.push(result);
    if (!options.quiet || !result.ok) process.stdout.write(`${report(result, options)}\n`);
  }
  const failed = results.filter((r) => !r.ok);
  const summary = failed.length
    ? `SOAK FAILED: ${failed.length}/${results.length} run(s) breached an invariant (runs ${failed.map((r) => r.run).join(', ')})`
    : `SOAK PASSED: ${results.length}/${results.length} run(s), chip conservation, single seating and table breaks held on every sweep`;
  process.stdout.write(`${summary}\n`);
  return failed.length ? 1 : 0;
}

process.exitCode = main();
