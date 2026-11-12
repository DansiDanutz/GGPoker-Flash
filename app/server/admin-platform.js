import fs from 'node:fs';
import os from 'node:os';

/** Blinds at a tournament level, matching Table.applyTournamentLevel. */
export function levelBlinds(tournament = {}, level = 1) {
  const lv = Math.max(1, Number(level) || 1);
  const factor = 1.5 ** (lv - 1);
  const baseSb = Number(tournament.baseSb) || 0;
  const baseBb = Number(tournament.baseBb) || 0;
  return { sb: Math.round(baseSb * factor), bb: Math.round(baseBb * factor) };
}

/**
 * A read-only summary of one live TournamentRoom. `now` is explicit so the
 * next level countdown is testable.
 */
export function tournamentRoomSummary(room, now = Date.now()) {
  if (!room) return null;
  let level = Number(room.tournament?.level) || 1;
  try {
    if (typeof room.syncLevel === 'function') level = room.syncLevel(now);
  } catch { /* keep the last known level */ }
  const tournament = room.tournament || {};
  const intervalMs = Number(tournament.blindEvery) * 60000;
  const nextLevelAt = intervalMs && Number(tournament.levelStartedAt)
    ? Number(tournament.levelStartedAt) + intervalMs
    : null;
  let flights = [];
  try { flights = typeof room.flightState === 'function' ? room.flightState() : []; } catch { /* closed room */ }
  let stats = {};
  try { stats = typeof room.stats === 'function' ? room.stats() : {}; } catch { /* closed room */ }
  return {
    id: room.id,
    name: tournament.name || room.id,
    mode: tournament.mode || null,
    buyin: tournament.buyin ?? null,
    prizePool: tournament.prizePool ?? null,
    entrants: tournament.entrants ?? null,
    level,
    blinds: levelBlinds(tournament, level),
    blindEveryMin: tournament.blindEvery ?? null,
    nextLevelAt,
    nextLevelInMs: nextLevelAt ? Math.max(0, nextLevelAt - now) : null,
    tables: flights.length,
    playersLeft: stats.playersLeft ?? null,
    humansLeft: stats.humansLeft ?? null,
    finished: stats.finished ?? (Array.isArray(room.finished) ? room.finished.length : null),
    winner: stats.winner || room.winner || null,
    flights: flights.map((flight) => ({
      id: flight.id,
      index: flight.index,
      players: Array.isArray(flight.players) ? flight.players.length : 0,
      inHand: Array.isArray(flight.players) ? flight.players.filter((p) => p.inHand).length : 0,
    })),
  };
}

function statSize(file) {
  try { return fs.statSync(file).size; } catch { return null; }
}

/**
 * The platform health report behind /api/admin/platform. Pure inputs (wss,
 * maps, db, version) keep it testable without a live socket server.
 */
export function buildPlatformReport({
  now = Date.now(),
  versionInfo = {},
  wss,
  liveTables = new Map(),
  tournamentRooms = new Map(),
  db,
  dbPath = null,
  env = process.env,
  proc = process,
} = {}) {
  const clients = wss?.clients ? [...wss.clients] : [];
  const userIds = new Set();
  for (const client of clients) if (client?.userId != null) userIds.add(client.userId);

  const tables = [];
  let seats = 0;
  for (const entry of liveTables.values()) {
    const table = entry?.table;
    if (!table) continue;
    let occupied = [];
    try { occupied = table.occupiedSeats(); } catch { /* table closing */ }
    seats += occupied.length;
    tables.push({
      id: table.cfg?.id || null,
      name: table.cfg?.name || table.cfg?.id || 'table',
      game: table.cfg?.game || null,
      tournamentId: table.cfg?.tournamentId || null,
      players: occupied.length,
      connections: entry.clients?.size ?? 0,
      hand: table.handNo ?? null,
      street: table.street || null,
    });
  }

  const rooms = [...tournamentRooms.values()]
    .map((room) => tournamentRoomSummary(room, now))
    .filter(Boolean);

  let counts = { users: null, hands: null, tournaments: null, tables: null };
  try {
    if (db) {
      counts = {
        users: db.prepare('SELECT COUNT(*) c FROM users WHERE deleted_at IS NULL').get().c,
        hands: db.prepare('SELECT COUNT(*) c FROM hands').get().c,
        tournaments: db.prepare('SELECT COUNT(*) c FROM tournaments').get().c,
        tables: db.prepare('SELECT COUNT(*) c FROM tables').get().c,
      };
    }
  } catch { /* counts stay unknown */ }

  let memory = null;
  try {
    const m = proc.memoryUsage();
    memory = { rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external };
  } catch { /* unavailable */ }

  return {
    ok: true,
    now,
    server: {
      version: versionInfo.version || null,
      build: versionInfo.build || null,
      builtAt: versionInfo.time || null,
      node: proc.version || null,
      pid: proc.pid ?? null,
      uptimeSec: Math.round(Number(proc.uptime?.()) || 0),
      env: env.NODE_ENV || 'development',
      platform: proc.platform || null,
      arch: proc.arch || null,
      cpus: os.cpus()?.length ?? null,
      load: os.loadavg(),
    },
    memory,
    sockets: { total: clients.length, users: userIds.size },
    tables: {
      live: tables.length,
      seats,
      connections: tables.reduce((sum, t) => sum + t.connections, 0),
      items: tables,
    },
    tournaments: {
      rooms: rooms.length,
      playersLeft: rooms.reduce((sum, r) => sum + (r.playersLeft || 0), 0),
      tables: rooms.reduce((sum, r) => sum + (r.tables || 0), 0),
      items: rooms,
    },
    db: {
      path: dbPath,
      sizeBytes: dbPath ? statSize(dbPath) : null,
      walBytes: dbPath ? statSize(`${dbPath}-wal`) : null,
      ...counts,
    },
  };
}
