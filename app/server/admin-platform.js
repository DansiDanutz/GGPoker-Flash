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

export const SNAPSHOT_STALE_MS = 5 * 60_000;

/** Age of a tourney_state snapshot in ms; null when the timestamp is missing/invalid. */
export function snapshotAgeMs(snapshot, now = Date.now()) {
  if (!snapshot?.at) return null;
  const text = String(snapshot.at);
  const at = Date.parse(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
  return Number.isFinite(at) ? Math.max(0, now - at) : null;
}

/** A room with players but no recent settled-hand snapshot is at risk after a crash. */
export function recoveryHealth(room, snapshot, now = Date.now()) {
  const age = snapshotAgeMs(snapshot, now);
  const stale = (Number(room?.playersLeft) || 0) > 0 && (age == null || age > SNAPSHOT_STALE_MS);
  return { snapshotAgeMs: age, stale };
}

/**
 * A read-only summary of one live TournamentRoom. `now` is explicit so the
 * next level countdown is testable.
 */
export function tournamentRoomSummary(room, now = Date.now(), snapshot = null) {
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
  const summary = {
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
    snapshot: snapshot || null,
    restoredAt: room.restoredAt || null,
    flights: flights.map((flight) => ({
      id: flight.id,
      index: flight.index,
      players: Array.isArray(flight.players) ? flight.players.length : 0,
      inHand: Array.isArray(flight.players) ? flight.players.filter((p) => p.inHand).length : 0,
    })),
  };
  return { ...summary, ...recoveryHealth(summary, snapshot, now) };
}

function statSize(file) {
  try { return fs.statSync(file).size; } catch { return null; }
}

/** Free/total bytes of the filesystem backing the process (container overlay on the host). */
export function diskUsage(path = '/') {
  try {
    const s = fs.statfsSync(path);
    const total = Number(s.blocks) * Number(s.bsize);
    const free = Number(s.bavail) * Number(s.bsize);
    return { path, totalBytes: total, freeBytes: free, usedPct: total ? Math.round((1 - free / total) * 100) : null };
  } catch { return null; }
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

  let snapshots = new Map();
  try {
    if (db) {
      for (const row of db.prepare('SELECT tournament_id, updated_at, length(state) AS bytes FROM tourney_state').all()) {
        snapshots.set(row.tournament_id, { at: row.updated_at, bytes: row.bytes });
      }
    }
  } catch { /* recovery table not present yet */ }
  const rooms = [...tournamentRooms.values()]
    .map((room) => tournamentRoomSummary(room, now, snapshots.get(room.id) || null))
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
      commit: commitOf(versionInfo),
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
    disk: diskUsage(),
    sockets: { total: clients.length, users: userIds.size },
    tables: {
      live: tables.length,
      seats,
      connections: tables.reduce((sum, t) => sum + t.connections, 0),
      items: tables,
    },
    tournaments: {
      rooms: rooms.length,
      snapshots: snapshots.size,
      stale: rooms.filter((room) => room.stale).length,
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


const COMMIT_SHA = /^[0-9a-f]{7,40}$/;

/** The build's git commit when it is a well-formed hex SHA, otherwise null. */
function commitOf(versionInfo) {
  const commit = String(versionInfo?.commit || '').toLowerCase();
  return COMMIT_SHA.test(commit) ? commit : null;
}

/** Disk use (percent) at which /healthz warns: early enough to prune before builds fail. */
export const DISK_WARN_PCT = 80;

/** Warnings surfaced by the public health endpoint (and the external monitor). */
export function healthWarnings(report) {
  const warnings = [];
  const stale = Number(report?.tournaments?.stale) || 0;
  if (stale > 0) warnings.push(`${stale} stale tournament room${stale === 1 ? '' : 's'}`);
  const usedPct = report?.disk?.usedPct;
  if (Number.isFinite(usedPct) && usedPct >= DISK_WARN_PCT) warnings.push(`disk ${usedPct}% used`);
  return warnings;
}

/** A compact, non-sensitive health payload for uptime monitors. */
export function buildHealthSummary(args = {}) {
  const report = buildPlatformReport(args);
  return {
    ok: true,
    service: 'dangro-game',
    time: new Date(report.now).toISOString(),
    version: report.server.version,
    build: report.server.build,
    commit: report.server.commit,
    uptimeSec: report.server.uptimeSec,
    rooms: { total: report.tournaments.rooms, stale: report.tournaments.stale },
    disk: { usedPct: report.disk?.usedPct ?? null, freeBytes: report.disk?.freeBytes ?? null },
    warnings: healthWarnings(report),
  };
}
