import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomInt } from 'node:crypto';
import net from 'node:net';
import { WebSocketServer } from 'ws';
import {
  db, DATA_DIR, hashPassword, checkPassword, addTransaction, addTransactionEx, newSession, userByToken,
  publicUser, getSetting, setSetting, refundOpenSessions, getClaim, claimReward, bumpMission, setMissionDone, missionPeriodKey,
} from './db.js';
import { PokerTable, botName } from './table.js';
import { normalizeAvatar } from './avatar.js';
import { makeDeck, shuffle, cardStr } from './poker.js';
import {
  resolveInside, SECURITY_HEADERS, HTML_CSP, createRateLimiter,
} from './security.js';
import { toInt, cleanNick, parseTableConfig, parseTableId, parseGroupKey } from './validate.js';
import { handForViewer } from './hand-history.js';
import { spinSlots } from './slots.js';
import { TournamentRoom, MAX_FLIGHTS } from './tournament-room.js';
import { bubblePlace, flightTableId, ordinal, payoutTable, prizePoolOf, tournamentTableIds } from './tournament.js';
import * as waitlist from './waitlist.js';
import { createWaitlistRoutes, queueTarget } from './waitlist-http.js';
import { createChatService } from './chat.js';
import * as adminWaitlist from './admin-waitlist.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5198);
const APP_DIR = path.join(__dirname, '..');

function localPort() {
  return server.address()?.port || PORT;
}

function configuredHosts() {
  const port = localPort();
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  const origins = hosts.map((h) => `http://${h}`);
  if (process.env.GGPOKER_DEV === '1') {
    hosts.push('127.0.0.1:5199', 'localhost:5199');
    origins.push('http://127.0.0.1:5199', 'http://localhost:5199');
  }
  for (const raw of [process.env.GGPOKER_PUBLIC_ORIGIN, process.env.GGPOKER_ADMIN_ORIGIN]) {
    if (!raw) continue;
    try {
      const u = new URL(raw);
      hosts.push(u.host.toLowerCase());
      origins.push(u.origin.toLowerCase());
    } catch { /* ignore malformed config */ }
  }
  for (const raw of String(process.env.GGPOKER_ALLOWED_HOSTS || '').split(',')) {
    const host = raw.trim().toLowerCase();
    if (!host) continue;
    hosts.push(host);
    origins.push(`https://${host}`);
  }
  return { hosts: [...new Set(hosts)], origins: [...new Set(origins)] };
}

function originAllowed(req) {
  const { hosts, origins } = configuredHosts();
  const host = String(req.headers.host || '').toLowerCase();
  if (!hosts.includes(host)) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  return origins.includes(String(origin).toLowerCase());
}

function requestIp(req) {
  if (process.env.GGPOKER_TRUST_PROXY === '1') {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded.replace(/^::ffff:/, '');
  }
  return String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}

function ipMatches(ip, rule) {
  const clean = String(rule || '').trim();
  if (!clean) return false;
  if (clean === '*') return true;
  if (clean === ip) return true;
  if (!clean.includes('/')) return false;
  const [base, bitsRaw] = clean.split('/');
  if (net.isIP(ip) !== 4 || net.isIP(base) !== 4) return false;
  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const toInt = (v) => v.split('.').reduce((n, part) => ((n << 8) + Number(part)) >>> 0, 0);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (toInt(ip) & mask) === (toInt(base) & mask);
}

function adminNetworkAllowed(req) {
  const rules = String(process.env.GGPOKER_ADMIN_ALLOW || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!rules.length) return true;
  const ip = requestIp(req);
  return rules.some((rule) => ipMatches(ip, rule));
}
const DIST = path.join(APP_DIR, 'dist');
const PUBLIC = path.join(APP_DIR, 'public');

// How long a seat is held for a player whose connection dropped before they are cashed out.
const DISCONNECT_GRACE_MS = Number(process.env.GGPOKER_DISCONNECT_GRACE_MS || 60_000);
const TOURNAMENT_SCHEDULER_MS = Math.max(50, Number(process.env.GGPOKER_TOURNEY_SCHEDULER_MS || 15_000));
// Seat-offer hold for wait-listed players (DanGG design: 30 s). Tests shorten it.
const WAITLIST_HOLD_MS = Number(process.env.GGPOKER_WAITLIST_HOLD_MS || waitlist.HOLD_MS);
const WAITLIST_SWEEP_MS = 1000;
const HAND_HISTORY_LIMIT = 60;
const HAND_HISTORY_SCAN = 400;
const MAX_BET = 1_000_000;
const MIN_BET = 10;
// Sic Bo total bets, stake included. A flat 12x on every middle total paid out more than it took in.
const SICBO_TOTAL_PAYS = Object.freeze({
  4: 61, 17: 61, 5: 31, 16: 31, 6: 18, 15: 18, 7: 13, 14: 13, 8: 9, 13: 9, 9: 7, 12: 7, 10: 7, 11: 7,
});
const loginLimiter = createRateLimiter({ limit: 10, windowMs: 10 * 60_000 });
const chatLimiter = createRateLimiter({ limit: 6, windowMs: 5_000 });
// Wait-list joins and leaves per player (DanGG choice: generous for clicks, blocks scripted spam).
const waitlistLimiter = createRateLimiter({ limit: 10, windowMs: 10_000 });

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  const MAX = 8 * 1024 * 1024;
  for await (const c of req) {
    size += c.length;
    if (size > MAX) {
      const err = new Error('Request body too large');
      err.status = 413;
      throw err;
    }
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

function idempotentReference(req, body, prefix) {
  const key = String(req.headers['idempotency-key'] || body?.idempotencyKey || body?.reference || '').trim();
  return key ? `${prefix}:${key}` : null;
}

function transactionByReference(userId, reference) {
  if (!reference) return null;
  return db.prepare('SELECT * FROM transactions WHERE user_id = ? AND reference = ?').get(userId, reference);
}

function tokenFrom(req) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  return null;
}

function requireUser(req, res) {
  const u = userByToken(tokenFrom(req));
  if (!u) { json(res, 401, { error: 'unauthorized' }); return null; }
  if (u.banned) { json(res, 403, { error: 'account banned' }); return null; }
  return u;
}

function requireAdmin(req, res) {
  const u = requireUser(req, res);
  if (!u) return null;
  if (!u.is_admin) { json(res, 403, { error: 'admin only' }); return null; }
  return u;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.ico': 'image/x-icon', '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function serveFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  const stat = fs.statSync(file);
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    ...(ext === '.html' ? { 'content-security-policy': HTML_CSP } : {}),
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': stat.size,
    // The service worker must be revalidated so a deploy can replace it.
    'cache-control': ext === '.html' || path.basename(file) === 'sw.js' ? 'no-cache' : 'public, max-age=3600',
  });
  fs.createReadStream(file).pipe(res);
}

/* ------------------------------------------------------------------ */
/* lobby data                                                          */
/* ------------------------------------------------------------------ */

const TABLE_OCCUPANCY = new Map();

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

function occupancyFor(t) {
  if (!TABLE_OCCUPANCY.has(t.id)) {
    const h = hashStr(t.id + t.name);
    let players = 1 + (h % t.seats);
    if (h % 5 === 0) players = t.seats;
    if (t.game === 'spingold') players = 1 + (h % 2);
    TABLE_OCCUPANCY.set(t.id, { players });
  }
  return TABLE_OCCUPANCY.get(t.id);
}

function lobbyMissions(user) {
  const defs = db.prepare('SELECT * FROM missions WHERE active = 1 ORDER BY sort').all();
  if (!user) return defs.map((m) => ({ ...m, progress: 0, claimed: 0 }));
  const claims = db.prepare("SELECT * FROM player_claims WHERE user_id = ? AND kind = 'mission'").all(user.id);
  const byId = new Map(claims.map((c) => [c.period_key, c]));
  return defs.map((m) => {
    const c = byId.get(missionPeriodKey(m.id));
    return { ...m, progress: c?.progress || 0, claimed: c?.claimed || 0 };
  });
}

function lobbyTables(userId = null) {
  const rows = db.prepare('SELECT * FROM tables WHERE enabled = 1 AND (COALESCE(private,0) = 0 OR owner_id = ?) ORDER BY sort ASC').all(userId);
  return rows.map((t) => {
    const occ = occupancyFor(t);
    const seed = [...t.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    const players = occ.players;
    const avgPot = Math.round((t.bb * (8 + (seed % 60))) / 10) * 10;
    return {
      id: t.id, name: t.name, game: t.game, category: t.category,
      sb: t.sb, bb: t.bb, ante: t.ante, min_buyin: t.min_buyin, max_buyin: t.max_buyin,
      seats: t.seats, speed: t.speed, featured: !!t.featured,
      private: !!t.private, owner_id: t.owner_id || null,
      players,
      // Real queue length and the caller's 1-based position (0 = not queued), from waitlist.js.
      wait: waitlist.queueSize(waitState, waitlist.tableQueue(t.id)),
      myWait: userId ? waitlist.position(waitState, userId, waitlist.tableQueue(t.id)) : 0,
      avgPot: players ? avgPot : 0,
      vpip: players ? 18 + (seed % 45) : 0,
      handsPerHour: 55 + (seed % 80),
      running: LIVE_TABLES.has(t.id),
      pro: t.game === 'rush',
      synthetic: true,
    };
  });
}

function sitesStats() {
  const base = getSetting('online_base', 192000);
  return { online: base + Math.floor(Math.sin(Date.now() / 60000) * 900) + 203 };
}

/* ------------------------------------------------------------------ */
/* live tables                                                         */
/* ------------------------------------------------------------------ */

const LIVE_TABLES = new Map(); // id -> { table, clients:Set<ws>, timer }
const chatService = createChatService({ db, getEntry: (id) => LIVE_TABLES.get(id) });
const TOURNAMENT_ROOMS = new Map(); // tournamentId -> TournamentRoom (multi-table flights)
let waitState = waitlist.createWaitlist(); // pure wait-list model state (see waitlist.js)
let waitSince = Object.freeze({}); // `queueKey|userId` -> join time, for the admin monitor
const RUSH_WAITING = new Map(); // userId -> { user, stack, bb, fromTable, since }
const BJ_HANDS = new Map(); // userId -> { deck, player, dealer, bet }
const SSE_CLIENTS = new Map(); // userId -> Set<ServerResponse>
const CRASH_ROUNDS = new Map(); // roundId -> crash round

function eloGame(game) {
  if (game === 'omaha5' || game === 'omaha6') return 'omaha';
  return ['holdem', 'omaha', 'shortdeck', 'rush'].includes(game) ? game : 'holdem';
}

function notifyUser(userId, payload) {
  const set = SSE_CLIENTS.get(Number(userId));
  if (!set) return;
  const frame = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of [...set]) {
    try { res.write(frame); } catch { set.delete(res); }
  }
}
setInterval(() => {
  for (const set of SSE_CLIENTS.values()) {
    for (const res of set) { try { res.write(': ping\n\n'); } catch { set.delete(res); } }
  }
}, 25000).unref();

/* ------------------------------ wait lists ------------------------------ */
// The pure model in waitlist.js owns the queues and seat offers; this block applies its
// results to live tables (seat holds) and tells players about offers over WS and SSE.

const holdsFor = (tableId) => waitState.offers.filter((o) => o.tableId === tableId).map((o) => [o.seat, o.userId]);

function setWaitlist(next) {
  const before = waitState;
  const touched = new Set([...before.offers, ...next.offers].map((o) => o.tableId));
  waitState = next;
  waitSince = adminWaitlist.trackJoinTimes(waitSince, before, next, Date.now());
  for (const tableId of touched) {
    const table = LIVE_TABLES.get(tableId)?.table;
    if (table) table.setHolds(holdsFor(tableId));
  }
  announceQueueChanges(before, next);
}

/**
 * Tell every player in (or just removed from) a changed queue their new position over
 * the notification stream. Position 0 means they are no longer queued there.
 */
function announceQueueChanges(before, after) {
  for (const queueKey of waitlist.changedQueues(before, after)) {
    const members = new Set([...(before.queues[queueKey] || []), ...(after.queues[queueKey] || [])]);
    const size = waitlist.queueSize(after, queueKey);
    for (const userId of members) {
      notifyUser(userId, {
        type: 'waitlist_update', queueKey, ...queueTarget(queueKey),
        position: waitlist.position(after, userId, queueKey), size,
      });
    }
  }
}

function sendToUser(userId, payload) {
  const frame = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === 1 && client.userId === userId) client.send(frame);
  }
}

function announceOffer(offer) {
  const table = LIVE_TABLES.get(offer.tableId)?.table;
  const event = {
    type: 'waitlist_ready', tableId: offer.tableId, tableName: table?.cfg.name || offer.tableId,
    seat: offer.seat, deadline: offer.deadline, holdMs: offer.holdMs, position: 1,
  };
  sendToUser(offer.userId, { type: 'event', event });
  notifyUser(offer.userId, { ...event, type: 'waitlist_offer' });
}

function announceExpired(offer, reason) {
  const event = { type: 'waitlist_expired', tableId: offer.tableId, seat: offer.seat, ...(reason ? { reason } : {}) };
  sendToUser(offer.userId, { type: 'event', event });
  notifyUser(offer.userId, event);
}

function waitlistJoin(tableId, userId) {
  const res = waitlist.join(waitState, userId, { tableId });
  setWaitlist(res.state);
  return res;
}

/** Leave a queue; a seat the player was holding is passed to the next player. */
function waitlistLeaveQueue(queueKey, userId) {
  const wasQueued = waitlist.position(waitState, userId, queueKey) > 0;
  const res = waitlist.leave(waitState, userId, queueKey);
  setWaitlist(res.state);
  for (const released of res.released) offerSeat(released.tableId, released.seat);
  return wasQueued || res.released.length > 0;
}

function waitlistLeave(tableId, userId) {
  return waitlistLeaveQueue(waitlist.tableQueue(tableId), userId);
}

/** Offer a freed seat to the head of the table queue (then its group queue). */
function offerSeat(tableId, seat, now = Date.now()) {
  const table = LIVE_TABLES.get(tableId)?.table;
  if (!table || table.tournament || table.seats[seat]?.player) return null;
  const res = waitlist.offer(waitState, tableId, seat, now, { groupKey: waitlist.groupKey(table.cfg), holdMs: WAITLIST_HOLD_MS });
  if (res.status !== 'offered') return null;
  setWaitlist(res.state);
  announceOffer(res.offer);
  return res.offer;
}

/** A seat at `table` just emptied: offer every free, unheld seat to the queue. */
function notifyWaitlist(tableId) {
  const table = LIVE_TABLES.get(tableId)?.table;
  if (!table) return;
  for (const s of table.seats) {
    if (!s.player && !table.holds.has(s.index)) offerSeat(tableId, s.index);
  }
}

/** Accept the caller's held seat at `tableId`, if any: { seat } or null. */
function heldSeatFor(tableId, userId, now = Date.now()) {
  const res = waitlist.accept(waitState, userId, tableId, now);
  return res.status === 'accepted' ? { seat: res.seat, state: res.state } : null;
}

function sweepWaitlists(now = Date.now()) {
  const res = waitlist.expire(waitState, now);
  if (!res.expired.length) return;
  setWaitlist(res.state);
  for (const old of res.expired) announceExpired(old);
  for (const made of res.offers) announceOffer(made);
}
setInterval(sweepWaitlists, WAITLIST_SWEEP_MS).unref();

const handleWaitlistRoute = createWaitlistRoutes({
  json, requireUser, limiter: waitlistLimiter, db, liveTables: LIVE_TABLES,
  getState: () => waitState, commit: setWaitlist, leaveQueue: waitlistLeaveQueue,
});

/**
 * Admin: empty a queue and release the seats it holds. Waiting players get a
 * `waitlist_update` (position 0) from setWaitlist; seat holders get `waitlist_expired`.
 * A released seat is offered on as usual (e.g. to the group queue of that table).
 */
function clearWaitlistQueue(queueKey, admin) {
  const res = adminWaitlist.clearQueue(waitState, queueKey);
  setWaitlist(res.state);
  for (const old of res.released) {
    announceExpired(old, 'cleared');
    offerSeat(old.tableId, old.seat);
  }
  db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(admin.login, 'waitlist_clear',
    `${queueKey} · ${res.removed.length} waiting · ${res.released.length} held released`);
  return res;
}

const handleAdminWaitlistRoute = adminWaitlist.createAdminWaitlistRoutes({
  json, requireAdmin, readBody,
  isActive: (queueKey) => adminWaitlist.activeQueueKeys(waitState).includes(queueKey),
  clear: clearWaitlistQueue,
  summarize: () => adminWaitlist.summarizeQueues(waitState, {
    joinedAt: waitSince, now: Date.now(),
    nickOf: (id) => db.prepare('SELECT nick FROM users WHERE id = ?').get(id)?.nick || `#${id}`,
    tableNameOf: (id) => LIVE_TABLES.get(id)?.table.cfg.name || db.prepare('SELECT name FROM tables WHERE id = ?').get(id)?.name || id,
  }),
});

const CUSTOM_CFG = new Map(); // tournament tables not stored in the cash-game table list

function tableRow(id) {
  return db.prepare('SELECT * FROM tables WHERE id = ?').get(id);
}

function getLiveTable(id) {
  if (LIVE_TABLES.has(id)) return LIVE_TABLES.get(id).table;
  const row = CUSTOM_CFG.get(id) || tableRow(id);
  if (!row) return null;
  const cfg = {
    ...row,
    botSpeed: getSetting('bot_speed_ms', 900),
    seats: row.seats,
    rakePercent: getSetting('rake_percent', 5),
    rakeCap: getSetting('rake_cap', 300),
  };
  const table = new PokerTable(cfg, {
    onEvent: (t, evt) => broadcastTable(t, evt),
    onHandSave: (h) => {
      try {
        db.prepare(`INSERT INTO hands (hand_id,hand_no,table_id,table_name,game,players,board,pot,result,hero_cards,actions)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
          h.handId || null, h.handNo, h.tableId, h.tableName, h.game, JSON.stringify(h.players),
          h.board.join(' '), h.pot, JSON.stringify(h.result), h.heroCards || '', JSON.stringify(h.actions || [])
        );
        const winners = h.result?.winners || [];
        for (const p of (h.players || [])) {
          if (!p || !p.id || p.inHand === false) continue;
          const u = db.prepare('SELECT id, elo FROM users WHERE id = ? AND deleted_at IS NULL').get(p.id);
          if (!u) continue;
          const won = winners.some((w) => Number(w.id) === Number(p.id));
          const game = eloGame(h.game);
          const rating = db.prepare('SELECT elo FROM elo_ratings WHERE user_id = ? AND game = ?').get(u.id, game);
          const before = Number(rating?.elo ?? u.elo ?? 1000);
          let oppSum = 0, oppCount = 0;
          for (const other of (h.players || [])) {
            if (!other || other.id === p.id || other.inHand === false) continue;
            const ou = db.prepare('SELECT elo FROM users WHERE id = ? AND deleted_at IS NULL').get(other.id);
            if (!ou) continue;
            const orating = db.prepare('SELECT elo FROM elo_ratings WHERE user_id = ? AND game = ?').get(other.id, game);
            oppSum += Number(orating?.elo ?? ou.elo ?? 1000); oppCount++;
          }
          const oppAvg = oppCount ? oppSum / oppCount : 1000;
          const expected = 1 / (1 + Math.pow(10, (oppAvg - before) / 400));
          const delta = Math.max(-30, Math.min(30, Math.round(24 * ((won ? 1 : 0) - expected))));
          const next = Math.max(0, before + delta);
          const overall = Math.max(0, Number(u.elo ?? 1000) + delta);
          db.prepare('INSERT INTO elo_ratings (user_id,game,elo) VALUES (?,?,?) ON CONFLICT(user_id,game) DO UPDATE SET elo = excluded.elo').run(u.id, game, next);
          db.prepare('UPDATE users SET elo = ? WHERE id = ?').run(overall, u.id);
          db.prepare('INSERT INTO elo_history (user_id,hand_id,delta,before,after,game) VALUES (?,?,?,?,?,?)').run(u.id, h.handId || null, next - before, before, next, game);
        }
        if (h.game === 'rush' && Math.random() < 0.12) {
          const humans = (h.players || []).filter((p) => p && p.id && !p.isBot && db.prepare('SELECT 1 FROM users WHERE id = ?').get(p.id));
          if (humans.length) {
            const lucky = humans[Math.floor(Math.random() * humans.length)];
            const amount = Math.max(100, Math.min(5000, Math.round((Number(h.pot) || 0) * 0.5 / 100) * 100));
            addTransaction(lucky.id, 'cashdrop', amount, 'Rush & Cash drop');
            table.emit({ type: 'cashdrop', nick: lucky.nick, amount });
          }
        }
      } catch (e) { console.error('hand save', e); }
    },
    onTournamentPayout: (table, p) => {
      try {
        const u = db.prepare('SELECT * FROM users WHERE id = ?').get(p.id);
        if (u) addTransaction(u.id, 'tourney_payout', p.payout, `${table.cfg.name} — finished ${ordinal(p.place)}`);
        table.emit({ type: 'tourney_payout', ...p });
      } catch (e) { console.error('tourney payout', e); }
    },
    onTournamentBust: (table, p) => {
      try {
        consumeTournamentEntry(table, p.id);
        // Multi-table events rank the whole field, not the seat's own table.
        if (table.tournament?.managed) {
          TOURNAMENT_ROOMS.get(table.cfg.tournamentId)?.onBust(table.cfg.id, p);
        }
      } catch (e) { console.error('tourney bust', e); }
    },
    onFlightSettled: (table, winner) => {
      try {
        TOURNAMENT_ROOMS.get(table.cfg.tournamentId)?.onFlightSettled(table.cfg.id, winner);
      } catch (e) { console.error('tourney flight settled', e); }
    },
    onTournamentEnd: (table, winner) => {
      try {
        const tid = table.cfg.tournamentId;
        if (tid) {
          db.prepare("UPDATE tournaments SET status = 'completed' WHERE id = ?").run(tid);
          db.prepare('DELETE FROM tourney_regs WHERE tournament_id = ?').run(tid);
        }
        const u = db.prepare('SELECT * FROM users WHERE id = ?').get(winner.id);
        if (u && table.tournament?.mode === 'SATELLITE') {
          addTransaction(u.id, 'satellite_win', 1, `Satellite ticket: ${table.tournament.ticket || table.cfg.name}`, 'TICKET');
        } else if (u && winner.prize > 0) {
          addTransaction(u.id, 'tourney_win', winner.prize, `Tournament win: ${table.cfg.name}`);
        }
        db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run('system', 'tournament_end', `${table.cfg.name} winner ${winner.nick} ${winner.prize || 0}`);
      } catch (e) { console.error('tournament end', e); }
    },
    onMint: (table, kind, amount) => {
      const key = kind === 'bot' ? 'mint_bot_total' : 'mint_spin_total';
      setSetting(key, (Number(getSetting(key, 0)) || 0) + Number(amount || 0));
    },
    onBounty: (table, info) => {
      const winner = db.prepare('SELECT * FROM users WHERE id = ?').get(info.winnerId);
      if (winner) {
        addTransaction(winner.id, info.mystery ? 'mystery_bounty' : 'bounty', info.amount,
          `${info.mystery ? 'Mystery bounty' : 'Bounty'}: ${info.bustedNick}`);
      }
      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run('system', 'bounty',
        `${table.cfg.name} ${info.winnerNick} ${info.amount} (${info.bustedNick})`);
    },
    onSeatBusted: (table, player) => {
      if (!table.spin) return;
      const seat = table.seatOf(player.id);
      const sessionId = seat?.player?.sessionId;
      if (!sessionId) return;
      addTransactionEx(player.id, 'session_close', 0, 'Spin bust', 'USD', {
        sessionId, reference: `out:${sessionId}`, onDuplicate: 'skip',
      });
    },
    onHandComplete: ({ table, winner, summary }) => {
      rewardHandPlayed(table, summary);
      // mission progress for humans who were dealt in
      moveRushPlayers(table);
      for (const s of table.seats) {
        if (!s.player || s.player.isBot || !s.player.inHand) continue;
        bumpMission(s.player.id, 'daily-hands');
        if (winner && winner.id === s.player.id) bumpMission(s.player.id, 'daily-win');
        if (table.board.length >= 3) bumpMission(s.player.id, 'daily-flop');
      }
    },
  });
  const entry = { table, clients: new Set(), timer: null, lastBroadcast: 0 };
  entry.emptySince = null;
  entry.timer = setInterval(() => {
    try {
      table.tick();
      if (Date.now() - entry.lastBroadcast > 450) broadcastState(table);
      sweepDisconnected(entry);
      if (entry.clients.size === 0) {
        if (!entry.emptySince) entry.emptySince = Date.now();
        else if (Date.now() - entry.emptySince > Math.max(45000, DISCONNECT_GRACE_MS)) {
          // A tournament flight outlives its viewers while players are still
          // seated (a moved player reconnects to the new table); an empty one goes.
          if (!table.tournament) closeLiveTable(id, 'Table idle close');
          else if (!table.humans().length) clearTable(id);
        }
      } else {
        entry.emptySince = null;
      }
    } catch (e) { console.error('tick', e); }
  }, 260);
  LIVE_TABLES.set(id, entry);
  // Re-apply any seat holds an earlier instance of this table left on the wait list.
  table.setHolds(holdsFor(id));
  return table;
}

function moveRushPlayers(table) {
  if (!table.rush) return;
  const queued = table.humans().filter((p) => table.seatOf(p.id)?.player?.rushQueued);
  for (const p of queued) {
    const seat = table.seatOf(p.id);
    const stack = seat?.player?.stack || 0;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(p.id);
    if (!user || stack <= 0) { if (seat?.player) seat.player.rushQueued = false; continue; }
    const rows = db.prepare("SELECT id FROM tables WHERE game = 'rush' AND enabled = 1 AND bb = ?").all(table.bb);
    let target = null;
    let targetCount = Infinity;
    for (const row of rows) {
      if (row.id === table.cfg.id) continue;
      const candidate = getLiveTable(row.id);
      const occupied = candidate ? candidate.occupiedSeats().length : 0;
      if (candidate && occupied < candidate.cfg.seats && occupied < targetCount) { target = candidate; targetCount = occupied; }
    }
    if (!target) {
      RUSH_WAITING.set(p.id, { user, stack, bb: table.bb, fromTable: table.cfg.id, since: Date.now() });
      seat.player.rushQueued = true;
      seat.player.sittingOut = true;
      const entry = LIVE_TABLES.get(table.cfg.id);
      if (entry) for (const client of entry.clients) if (client.userId === p.id && client.readyState === 1) client.send(JSON.stringify({ type: 'rush_queued' }));
      continue;
    }
    RUSH_WAITING.delete(p.id);
    cashOutSeat(table, p.id, 'Rush transfer');
    const res = seatHuman(target, user, Math.min(stack, target.cfg.max_buyin), null);
    if (!res.ok) { seat.player && (seat.player.rushQueued = false); continue; }
    const entry = LIVE_TABLES.get(table.cfg.id);
    if (entry) {
      for (const client of entry.clients) {
        if (client.userId === p.id && client.readyState === 1) {
          client.send(JSON.stringify({ type: 'rush_move', tableId: target.cfg.id, stack: Math.min(stack, target.cfg.max_buyin) }));
        }
      }
    }
    broadcastState(target);
  }
}

function flushRushQueue() {
  for (const [userId, wait] of [...RUSH_WAITING]) {
    const fromEntry = LIVE_TABLES.get(wait.fromTable);
    if (!fromEntry) { RUSH_WAITING.delete(userId); continue; }
    const fromTable = fromEntry.table;
    const oldSeat = fromTable.seatOf(userId);
    if (!oldSeat?.player) { RUSH_WAITING.delete(userId); continue; }
    if (!['ended', 'idle'].includes(fromTable.street)) continue;
    let target = null, targetCount = Infinity;
    const rows = db.prepare("SELECT id FROM tables WHERE game = 'rush' AND enabled = 1 AND bb = ?").all(wait.bb);
    for (const row of rows) {
      if (row.id === fromTable.cfg.id) continue;
      const candidate = getLiveTable(row.id);
      const occupied = candidate ? candidate.occupiedSeats().length : 0;
      if (candidate && occupied < candidate.cfg.seats && occupied < targetCount) { target = candidate; targetCount = occupied; }
    }
    if (!target) continue;
    cashOutSeat(fromTable, userId, 'Rush queue transfer');
    const res = seatHuman(target, wait.user, Math.min(wait.stack, target.cfg.max_buyin), null);
    if (!res.ok) { RUSH_WAITING.delete(userId); continue; }
    RUSH_WAITING.delete(userId);
    for (const client of fromEntry.clients) if (client.userId === userId && client.readyState === 1) {
      client.send(JSON.stringify({ type: 'rush_move', tableId: target.cfg.id, stack: Math.min(wait.stack, target.cfg.max_buyin) }));
    }
  }
}

function broadcastTable(table, evt) {
  const entry = LIVE_TABLES.get(table.cfg.id);
  if (!entry) return;
  for (const client of entry.clients) {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type: 'event', event: evt }));
    }
  }
  broadcastState(table);
}

function broadcastState(table) {
  const entry = LIVE_TABLES.get(table.cfg.id);
  if (!entry) return;
  entry.lastBroadcast = Date.now();
  if (table.tournament?.managed) {
    // Field-wide counters for the table header: "Table 2/3 · 14 left".
    const room = TOURNAMENT_ROOMS.get(table.cfg.tournamentId);
    if (room) {
      const stats = room.stats();
      table.tournament.playersLeft = stats.playersLeft;
      table.tournament.payouts = room.payouts();
      table.cfg.flightCount = stats.tables;
    }
  }
  for (const client of entry.clients) {
    if (client.readyState !== 1) continue;
    try {
      client.send(JSON.stringify({ type: 'state', state: table.snapshotFor(client.userId) }));
    } catch { /* noop */ }
  }
}

function seatHuman(table, user, buyin, seatIndex = null) {
  const existing = table.seatOf(user.id);
  if (existing) return { ok: true, seat: existing.index };
  const stack = toInt(buyin) ?? table.cfg.min_buyin;
  if (stack < table.cfg.min_buyin || stack > table.cfg.max_buyin) return { ok: false, error: 'invalid buy-in' };
  if (user.balance < stack) return { ok: false, error: 'not enough balance' };
  const wantedSeat = toInt(seatIndex, { min: 0, max: table.cfg.seats - 1 });
  if (wantedSeat != null && table.isHeldFor(wantedSeat, user.id)) return { ok: false, error: 'seat held' };
  if (!makeRoomForHuman(table, wantedSeat, user.id)) return { ok: false, error: 'table full' };
  const sessionId = `${table.cfg.id}:${randomUUID()}`;
  addTransactionEx(user.id, 'buyin', -stack, `Buy-in ${table.cfg.name}`, 'USD', {
    sessionId, reference: `in:${sessionId}:1`, onDuplicate: 'skip',
  });
  const res = table.sit({ id: user.id, nick: user.nick, avatar: user.avatar }, wantedSeat, stack, sessionId);
  if (!res.ok) {
    addTransactionEx(user.id, 'refund', stack, 'Buy-in refund', 'USD', {
      sessionId, reference: `refund:${sessionId}`, onDuplicate: 'skip',
    });
    return res;
  }
  const seat = table.seatOf(user.id);
  if (seat && seat.player) seat.player.sessionId = sessionId;
  return res;
}

// Bots only fill empty chairs: a human always takes priority over one. A seat held for a
// wait-listed player counts as free only for that player.
function makeRoomForHuman(table, wantedSeat, userId) {
  const target = wantedSeat != null ? table.seats[wantedSeat] : null;
  if (target && !target.player) return true;
  if (target && target.player && !target.player.isBot) return !!table.freeSeatFor(userId) || evictBot(table);
  if (target && target.player && target.player.isBot) { table.stand(target.player.id); return true; }
  if (table.freeSeatFor(userId)) return true;
  return evictBot(table);
}

function evictBot(table) {
  const bots = table.occupiedSeats().filter((s) => s.player.isBot);
  if (!bots.length) return false;
  const idle = bots.find((s) => !table.handInProgress() || !s.player.inHand || s.player.folded);
  table.stand((idle || bots[0]).player.id);
  return true;
}

function cashOutSeat(table, userId, reason) {
  const seat = table.seatOf(userId);
  if (!seat || !seat.player) return;
  const sessionId = seat.player.sessionId;
  // stand() folds a live hand first, so the returned stack is what the player really keeps.
  const { stack } = table.stand(userId);
  if (table.tournament) {
    // Leaving a tournament forfeits the entry; it cannot be re-used for a fresh stack.
    consumeTournamentEntry(table, userId);
    return;
  }
  const sid = sessionId || `${table.cfg.id}:${randomUUID()}`;
  addTransactionEx(userId, stack > 0 ? 'cashout' : 'session_close', stack, reason, 'USD', {
    sessionId: sid, reference: `out:${sid}`, onDuplicate: 'skip',
  });
}

function consumeTournamentEntry(table, userId) {
  const tid = table.cfg.tournamentId;
  if (!tid) return;
  db.prepare('DELETE FROM tourney_regs WHERE tournament_id = ? AND user_id = ?').run(tid, userId);
}

function hasLiveSocket(entry, userId, except = null) {
  for (const client of entry.clients) {
    if (client !== except && client.userId === userId && client.readyState === 1) return true;
  }
  return false;
}

// Cash out players whose connection has been gone longer than the grace period
// (tournament players are blinded out instead; their seat is never forfeited).
function sweepDisconnected(entry) {
  const table = entry.table;
  const now = Date.now();
  for (const p of table.humans()) {
    if (!p.disconnectedAt) continue;
    if (hasLiveSocket(entry, p.id)) { p.disconnectedAt = 0; p.disconnected = false; continue; }
    if (now - p.disconnectedAt < DISCONNECT_GRACE_MS) continue;
    if (table.tournament) {
      // A tournament seat is never forfeited by a dropped connection: the player
      // is blinded out (auto-fold / auto-check) until they come back.
      Object.assign(p, { away: true, sittingOut: true, disconnectedAt: 0 });
      continue;
    }
    cashOutSeat(table, p.id, `Disconnected from ${table.cfg.name}`);
    notifyWaitlist(table.cfg.id);
  }
}

function closeLiveTable(id, reason) {
  const entry = LIVE_TABLES.get(id);
  if (!entry) return;
  for (const p of entry.table.humans()) cashOutSeat(entry.table, p.id, reason);
  clearInterval(entry.timer);
  LIVE_TABLES.delete(id);
}

/** Close a live table completely, config included (used by tournament breaks). */
function clearTable(id) {
  const entry = LIVE_TABLES.get(id);
  if (entry) {
    clearInterval(entry.timer);
    LIVE_TABLES.delete(id);
  }
  CUSTOM_CFG.delete(id);
}

/** The shared descriptor every flight of one tournament hands to its table. */
function tournamentDescriptor(t) {
  const bb = Math.max(20, Math.round(Number(t.starting_stack || 10000) / 100));
  return {
    prizePool: prizePoolOf(t),
    entrants: Number(t.entrants) || 0,
    level: 1,
    blindEvery: Math.max(5, Number(t.blind_speed) || 10),
    mode: t.mode || 'STANDARD',
    bounty: t.bounty || 0,
    ticket: t.ticket || '',
    name: t.name,
    baseSb: bb,
    baseBb: bb * 2,
    levelStartedAt: Date.now(),
    playersLeft: null,
    managed: true,
  };
}

function tournamentTableConfig(t, tournament, index, seats) {
  const bb = Math.max(20, Math.round(Number(t.starting_stack || 10000) / 100));
  return {
    id: flightTableId(t.id, index),
    name: t.name,
    game: 'holdem',
    category: 'Tournament',
    sb: bb,
    bb: bb * 2,
    ante: 0,
    min_buyin: t.starting_stack,
    max_buyin: t.starting_stack,
    seats,
    speed: 'Normal',
    tournamentId: t.id,
    flightIndex: index,
    flightCount: 1,
    tournament,
  };
}

/** The live multi-table room for a tournament, created on first use. */
function ensureTournamentRoom(t) {
  const existing = TOURNAMENT_ROOMS.get(t.id);
  if (existing) return existing;
  const seats = 6;
  const room = new TournamentRoom({
    id: t.id,
    seats,
    tournament: tournamentDescriptor(t),
    ops: {
      table: (id) => LIVE_TABLES.get(id)?.table || null,
      createTable: ({ tableId, index, tournament }) => {
        CUSTOM_CFG.set(tableId, tournamentTableConfig(t, tournament, index, seats));
        return getLiveTable(tableId);
      },
      closeTable: (id) => clearTable(id),
      broadcast: (id) => {
        const table = LIVE_TABLES.get(id)?.table;
        if (table) broadcastState(table);
      },
      evictBot: (table) => evictBot(table),
      notifyPlayer: (userId, payload) => {
        for (const client of wss.clients) {
          if (client.readyState === 1 && client.userId === Number(userId)) client.send(JSON.stringify(payload));
        }
      },
      persistBust: ({ tableId, playerId, nick, place, payout }) => {
        const table = LIVE_TABLES.get(tableId)?.table;
        if (table) table.finished.push({ id: playerId, nick, place, payout });
        if (payout <= 0) return;
        const u = db.prepare('SELECT * FROM users WHERE id = ?').get(playerId);
        if (u) addTransaction(u.id, 'tourney_payout', payout, `${t.name} — finished ${ordinal(place)}`);
        if (table) table.emit({ type: 'tourney_payout', id: playerId, nick, place, payout });
      },
      persistWinner: ({ playerId, nick, prize, tableId }) => {
        const table = LIVE_TABLES.get(tableId)?.table;
        if (table) {
          const seat = table.seatOf(playerId);
          if (seat?.player) seat.player.stack += prize;
          table.tournament.winner = { nick, id: playerId, prize };
          table.street = 'ended';
          table.nextHandAt = 0;
          table.emit({ type: 'tourney_win', nick, id: playerId, prize, tableName: table.cfg.name });
        }
        const u = db.prepare('SELECT * FROM users WHERE id = ?').get(playerId);
        if (u && table?.tournament?.mode === 'SATELLITE') {
          addTransaction(u.id, 'satellite_win', 1, `Satellite ticket: ${table.tournament.ticket || t.name}`, 'TICKET');
        } else if (u && prize > 0) {
          addTransaction(u.id, 'tourney_win', prize, `Tournament win: ${t.name}`);
        }
        db.prepare("UPDATE tournaments SET status = 'completed' WHERE id = ?").run(t.id);
        db.prepare('DELETE FROM tourney_regs WHERE tournament_id = ?').run(t.id);
        db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run('system', 'tournament_end',
          `${t.name} winner ${nick} ${prize || 0}`);
      },
    },
  });
  TOURNAMENT_ROOMS.set(t.id, room);
  return room;
}

function disposeTournamentRoom(tournamentId, { force = false } = {}) {
  const room = TOURNAMENT_ROOMS.get(tournamentId);
  if (!room) return;
  room.dispose({ force });
  TOURNAMENT_ROOMS.delete(tournamentId);
}

/**
 * Flip a tournament from registering to running and seat its whole field.
 * Every registrant gets a seat, online or not; whoever is not at the table yet
 * is blinded out until they open it. Returns false when another caller won the
 * race to start the event.
 */
function startTournament(t) {
  const flipped = db.prepare("UPDATE tournaments SET status = 'running' WHERE id = ? AND status = 'registering'").run(t.id);
  if (!flipped.changes) return false;
  const room = ensureTournamentRoom(t);
  room.syncLevel();
  const registrants = db.prepare(`SELECT u.id, u.nick, u.avatar FROM tourney_regs r JOIN users u ON u.id = r.user_id
    WHERE r.tournament_id = ? ORDER BY r.created_at, r.rowid`).all(t.id);
  const { seated, failed } = room.seatRegistrants(registrants, { stack: t.starting_stack });
  for (const seat of seated) notifyTournamentStarted(t, seat.id, seat.tableId, seat.index);
  for (const miss of failed) console.error('tournament start seat', t.id, miss.id, miss.error);
  return true;
}

/** Tell a registrant where their flight is (SSE; the client shows a "Go to table" toast). */
function notifyTournamentStarted(t, userId, tableId, index) {
  notifyUser(userId, { type: 'tournament_started', id: t.id, name: t.name, tableId, index });
}

/** Re-announce every running event where this player still has an untouched seat. */
function announceAwaySeats(userId) {
  for (const room of TOURNAMENT_ROOMS.values()) {
    const table = room.tableOf(userId);
    if (!table?.seatOf(userId)?.player?.away) continue;
    notifyUser(userId, {
      type: 'tournament_started', id: room.id, name: room.tournament.name,
      tableId: table.cfg.id, index: room.flightIndexOf(table.cfg.id),
    });
  }
}

function rewardHandPlayed(table, summary) {
  const raked = (summary?.rake || 0) > 0;
  for (const s of table.seats) {
    const p = s.player;
    if (!p || p.isBot || !p.inHand) continue;
    const points = raked && p.totalBet > 0 ? 1 : 0;
    db.prepare('UPDATE users SET xp = xp + 1, vip_points = vip_points + ? WHERE id = ?').run(points, p.id);
    if (points) bumpMission(p.id, 'weekly-vip', points);
  }
}

/* ------------------------------------------------------------------ */
/* HTTP API                                                            */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  try {
    if (!originAllowed(req)) return json(res, 403, { error: 'bad origin' });
    if (p.startsWith('/api/admin') && !adminNetworkAllowed(req)) return json(res, 403, { error: 'Admin access is restricted to the Mac Studio network' });
    if (p === '/healthz') return json(res, 200, { ok: true, service: 'dangro-game', time: new Date().toISOString() });

    // ---------- auth ----------
    if (p === '/api/auth/login' && req.method === 'POST') {
      const body = await readBody(req);
      const loginKey = String(body.login || '').trim().toLowerCase();
      if (loginLimiter.isBlocked(loginKey)) return json(res, 429, { error: 'Too many failed attempts. Try again in a few minutes.' });
      // Exact account ID wins over a nickname match so a look-alike nickname cannot shadow an account.
      const user = db.prepare('SELECT * FROM users WHERE lower(login) = ? AND deleted_at IS NULL').get(loginKey)
        || db.prepare('SELECT * FROM users WHERE lower(nick) = ? AND deleted_at IS NULL').get(loginKey);
      if (!user || !checkPassword(body.password || '', user.password)) {
        loginLimiter.record(loginKey);
        return json(res, 400, { error: 'Invalid account ID or password' });
      }
      loginLimiter.reset(loginKey);
      if (user.banned) return json(res, 403, { error: 'This account is locked. Contact support.' });
      db.prepare('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?').run(user.id);
      const token = newSession(user.id, req.headers['user-agent'] || '');
      return json(res, 200, { token, user: publicUser(user) });
    }

    if (p === '/api/auth/register' && req.method === 'POST') {
      const body = await readBody(req);
      const login = String(body.login || '').trim();
      const nick = cleanNick(body.nick || login);
      if (!/^[A-Za-z0-9_.\-]{3,24}$/.test(login)) return json(res, 400, { error: 'Account ID must be 3-24 letters, digits, dots, dashes or underscores' });
      if (!nick) return json(res, 400, { error: 'Nickname must be 2-20 letters, digits, spaces, dots, dashes or underscores' });
      if (String(body.password || '').length < 6) return json(res, 400, { error: 'Password must be at least 6 characters' });
      if (identityTaken(login) || identityTaken(nick)) return json(res, 400, { error: 'That account ID or nickname is already taken' });
      const start = getSetting('default_balance', 5000) + getSetting('welcome_bonus', 100000);
      db.prepare(`INSERT INTO users (login,nick,password,email,balance,tickets) VALUES (?,?,?,?,?,?)`)
        .run(login, nick, hashPassword(String(body.password)), String(body.email || '').slice(0, 120), 0, 5);
      const created = db.prepare('SELECT id FROM users WHERE login = ?').get(login);
      // The account starts at zero and the ledger entry carries the whole opening balance,
      // so the balance and the ledger agree (it used to be credited twice).
      addTransaction(created.id, 'welcome', start, 'Welcome bonus');
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(created.id);
      const token = newSession(user.id, req.headers['user-agent'] || '');
      return json(res, 200, { token, user: publicUser(user) });
    }

    if (p === '/api/auth/logout' && req.method === 'POST') {
      const t = tokenFrom(req);
      if (t) db.prepare('DELETE FROM sessions WHERE token = ?').run(t);
      return json(res, 200, { ok: true });
    }

    // ---------- me ----------
    if (p === '/api/me') {
      const u = requireUser(req, res); if (!u) return;
      const us = db.prepare('SELECT json FROM user_settings WHERE user_id = ?').get(u.id);
      return json(res, 200, { user: publicUser(u), settings: us ? JSON.parse(us.json) : {} });
    }

    if (p === '/api/me/settings' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const body = await readBody(req);
      const serialized = JSON.stringify(body || {});
      if (serialized.length > 64 * 1024) return json(res, 413, { error: 'Settings too large' });
      db.prepare(`INSERT INTO user_settings (user_id,json) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET json=excluded.json`)
        .run(u.id, serialized);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/me/avatar' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const body = await readBody(req);
      try {
        const avatar = normalizeAvatar(body.avatar);
        db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar ? avatar.dataUrl : '', u.id);
        return json(res, 200, { ok: true, hash: avatar ? avatar.hash : null });
      } catch (err) {
        return json(res, err.status || 400, { error: err.message });
      }
    }

    if (p === '/api/me/nick' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const body = await readBody(req);
      const nick = cleanNick(body.nick);
      if (!nick) return json(res, 400, { error: 'Nickname must be 2-20 letters, digits, spaces, dots, dashes or underscores' });
      if (identityTaken(nick, u.id)) return json(res, 400, { error: 'That nickname is already taken' });
      db.prepare('UPDATE users SET nick = ? WHERE id = ?').run(nick, u.id);
      return json(res, 200, { ok: true, nick });
    }

    // ---------- wait lists (waitlist-http.js) ----------
    if (handleWaitlistRoute(req, res, p)) return;

    // ---------- lobby ----------
    if (p === '/api/lobby') {
      const u = userByToken(tokenFrom(req));
      const tables = lobbyTables(u?.id || null);
      const banners = db.prepare('SELECT * FROM banners WHERE slot = ? AND enabled = 1 ORDER BY sort').all('home');
      return json(res, 200, {
        tables,
        banners,
        online: sitesStats().online,
        jackpot: getSetting('jackpot', 199026635),
        recentWinners: Array.from({ length: 5 }, (_, i) => ({
          nick: botName((hashStr('winner' + i) + i) % 100),
          amount: 500 + ((hashStr('amount' + i) + i * 733) % 9000),
        })),
        user: publicUser(u),
        missions: lobbyMissions(u),
        // Offer the demo shortcut only when the advertised credentials actually
        // work: the row can exist with another password (for example a player
        // registered that name), and a dead button is worse than no button.
        demoAccount: (() => {
          const demo = db.prepare('SELECT password FROM users WHERE login = ?').get('DansiDanutz');
          return !!(demo && checkPassword('ggpoker', demo.password));
        })(),
        settings: { site_name: getSetting('site_name', 'GGPoker'), maintenance: getSetting('maintenance', false) },
      });
    }

    if (p === '/api/tables') {
      return json(res, 200, { tables: lobbyTables() });
    }

    if (p === '/api/tables/host' && req.method === 'GET') {
      const u = requireUser(req, res); if (!u) return;
      const rows = db.prepare('SELECT id,name,game,sb,bb,min_buyin,max_buyin,seats,bomb_pot FROM tables WHERE owner_id = ? AND private = 1 AND enabled = 1 ORDER BY rowid DESC').all(u.id);
      return json(res, 200, { tables: rows });
    }

    if (p.startsWith('/api/tables/host/') && req.method === 'DELETE') {
      const u = requireUser(req, res); if (!u) return;
      const id = decodeURIComponent(p.slice('/api/tables/host/'.length));
      const t = db.prepare('SELECT * FROM tables WHERE id = ? AND owner_id = ? AND private = 1').get(id, u.id);
      if (!t) return json(res, 404, { error: 'not found' });
      const live = LIVE_TABLES.get(id);
      if (live && live.table.occupiedSeats().length) return json(res, 409, { error: 'Table has players — ask them to leave first' });
      if (live) { clearInterval(live.timer); LIVE_TABLES.delete(id); CUSTOM_CFG.delete(id); }
      db.prepare('DELETE FROM tables WHERE id = ?').run(id);
      db.prepare('DELETE FROM table_mutes WHERE table_id = ?').run(id);
      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(u.login, 'delete_host_table', id);
      return json(res, 200, { ok: true });
    }

    if (p.startsWith('/api/tables/host/') && p.endsWith('/mutes') && req.method === 'GET') {
      const u = requireUser(req, res); if (!u) return;
      const id = decodeURIComponent(p.slice('/api/tables/host/'.length, -'/mutes'.length));
      const t = db.prepare('SELECT id FROM tables WHERE id = ? AND owner_id = ?').get(id, u.id);
      if (!t) return json(res, 404, { error: 'not found' });
      const rows = db.prepare('SELECT m.user_id, u.nick FROM table_mutes m JOIN users u ON u.id = m.user_id WHERE m.table_id = ?').all(id);
      return json(res, 200, { muted: rows });
    }

    if (p.startsWith('/api/tables/host/') && p.endsWith('/mutes') && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const id = decodeURIComponent(p.slice('/api/tables/host/'.length, -'/mutes'.length));
      const t = db.prepare('SELECT id FROM tables WHERE id = ? AND owner_id = ?').get(id, u.id);
      if (!t) return json(res, 404, { error: 'not found' });
      const b = await readBody(req);
      const userId = Number(b.userId);
      if (!userId || userId === u.id) return json(res, 400, { error: 'invalid player' });
      if (b.muted) db.prepare('INSERT OR IGNORE INTO table_mutes (table_id,user_id) VALUES (?,?)').run(id, userId);
      else db.prepare('DELETE FROM table_mutes WHERE table_id = ? AND user_id = ?').run(id, userId);
      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(u.login, b.muted ? 'table_mute' : 'table_unmute', `${id} user ${userId}`);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/tables/host' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const b = await readBody(req);
      const count = db.prepare('SELECT COUNT(*) AS n FROM tables WHERE owner_id = ? AND private = 1').get(u.id).n;
      if (count >= 8) return json(res, 400, { error: 'You already have 8 private tables' });
      const game = ['holdem', 'omaha', 'omaha5', 'omaha6', 'shortdeck'].includes(b.game) ? b.game : 'holdem';
      const sb = Math.max(1, Math.round(Number(b.sb) || 100));
      const bb = Math.max(sb, Math.round(Number(b.bb) || sb * 2));
      const minBuyin = Math.max(bb, Math.round(Number(b.min_buyin) || bb * 20));
      const maxBuyin = Math.max(minBuyin, Math.round(Number(b.max_buyin) || minBuyin));
      const seats = Math.max(2, Math.min(9, Math.round(Number(b.seats) || 6)));
      const name = String(b.name || `${u.nick}'s table`).trim().slice(0, 40) || `${u.nick}'s table`;
      const id = `home-${u.id}-${Date.now().toString(36)}`;
      db.prepare(`INSERT INTO tables (id,name,game,category,sb,bb,ante,min_buyin,max_buyin,seats,speed,featured,enabled,sort,owner_id,private,bomb_pot)
        VALUES (?,?,?,?,?,?,0,?,?,?, 'Normal',0,1,0,?,1,?)`)
        .run(id, name, game, 'Private', sb, bb, minBuyin, maxBuyin, seats, u.id, b.bombPot ? 1 : 0);
      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(u.login, 'host_table', id);
      return json(res, 200, { ok: true, id });
    }

    // ---------- tournaments ----------
    if (p === '/api/tournaments') {
      const u = userByToken(tokenFrom(req));
      const rows = db.prepare('SELECT * FROM tournaments WHERE enabled = 1 AND (COALESCE(private,0) = 0 OR owner_id = ?) ORDER BY start_at').all(u?.id || null);
      const regs = u ? db.prepare('SELECT tournament_id FROM tourney_regs WHERE user_id = ?').all(u.id).map((r) => r.tournament_id) : [];
      return json(res, 200, { tournaments: rows, registered: regs });
    }

    if (p === '/api/tournaments/host' && req.method === 'GET') {
      const u = requireUser(req, res); if (!u) return;
      const rows = db.prepare('SELECT * FROM tournaments WHERE owner_id = ? AND private = 1 ORDER BY start_at').all(u.id);
      return json(res, 200, { tournaments: rows });
    }

    if (p.startsWith('/api/tournaments/host/') && req.method === 'DELETE') {
      const u = requireUser(req, res); if (!u) return;
      const id = decodeURIComponent(p.slice('/api/tournaments/host/'.length));
      const t = db.prepare('SELECT * FROM tournaments WHERE id = ? AND owner_id = ? AND private = 1').get(id, u.id);
      if (!t) return json(res, 404, { error: 'not found' });
      if (t.status !== 'registering') return json(res, 409, { error: 'Tournament has started' });
      disposeTournamentRoom(id, { force: true });
      db.prepare('DELETE FROM tournaments WHERE id = ?').run(id);
      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(u.login, 'delete_host_tournament', id);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/tournaments/host' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const b = await readBody(req);
      const count = db.prepare('SELECT COUNT(*) AS n FROM tournaments WHERE owner_id = ? AND private = 1').get(u.id).n;
      if (count >= 8) return json(res, 400, { error: 'You already have 8 private tournaments' });
      const name = String(b.name || `${u.nick}'s tournament`).trim().slice(0, 60) || `${u.nick}'s tournament`;
      const format = ['NLH', 'PLO', 'Short Deck'].includes(b.format) ? b.format : 'NLH';
      const game = format === 'PLO' ? 'omaha' : format === 'Short Deck' ? 'shortdeck' : 'holdem';
      const buyin = Math.max(0, Math.round(Number(b.buyin) || 0));
      const fee = Math.max(0, Math.round(Number(b.fee) || 0));
      const startingStack = Math.max(100, Math.round(Number(b.starting_stack) || 10000));
      const blindSpeed = Math.max(1, Math.min(120, Math.round(Number(b.blind_speed) || 8)));
      const lateReg = Math.max(0, Math.min(600, Math.round(Number(b.late_reg) || 90)));
      const mode = ['STANDARD', 'BOUNTY', 'MYSTERY', 'SATELLITE', 'FLIP'].includes(b.mode) ? b.mode : 'STANDARD';
      const start = b.start_at ? new Date(b.start_at).toISOString() : new Date(Date.now() + 3600000).toISOString();
      const id = `home-t-${u.id}-${Date.now().toString(36)}`;
      db.prepare(`INSERT INTO tournaments (id,name,game,buyin,fee,gtd,start_at,status,max_players,entrants,starting_stack,blind_speed,late_reg,format,mode,bounty,ticket,enabled,owner_id,private)
        VALUES (?,?,?,?,?,0,?, 'registering', 1000, 0, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1)`)
        .run(id, name, game, buyin, fee, start, startingStack, blindSpeed, lateReg, format, mode, Math.max(0, Number(b.bounty) || 0), String(b.ticket || '').slice(0, 80), u.id);
      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(u.login, 'host_tournament', id);
      return json(res, 200, { ok: true, id });
    }

    // Where a spectator should watch this tournament: the busiest live flight.
    if (p.startsWith('/api/tournaments/') && p.endsWith('/watch') && req.method === 'GET') {
      const u = requireUser(req, res); if (!u) return;
      const id = decodeURIComponent(p.slice('/api/tournaments/'.length, -'/watch'.length));
      const room = TOURNAMENT_ROOMS.get(id);
      const flights = room ? room.flightState().filter((flight) => flight.players.length) : [];
      if (!flights.length) return json(res, 404, { error: 'This tournament has no live table' });
      const busiest = flights.sort((a, b) => b.players.length - a.players.length)[0];
      const stats = room.stats();
      return json(res, 200, {
        ok: true,
        tableId: busiest.id,
        tableIndex: busiest.index,
        tables: stats.tables,
        playersLeft: stats.playersLeft,
      });
    }

    if (p.startsWith('/api/tournaments/') && !p.includes('/register') && !p.includes('/play') && !p.includes('/unregister') && !p.endsWith('/watch') && req.method === 'GET') {
      const id = decodeURIComponent(p.slice('/api/tournaments/'.length));
      const t = db.prepare('SELECT * FROM tournaments WHERE id = ? AND enabled = 1').get(id);
      if (!t) return json(res, 404, { error: 'not found' });
      const room = t.status === 'running' ? TOURNAMENT_ROOMS.get(id) : null;
      const payouts = room ? room.payouts() : payoutTable(t.entrants, prizePoolOf(t), { mode: t.mode, ticket: t.ticket });
      return json(res, 200, {
        tournament: t,
        prizePool: prizePoolOf(t),
        payouts,
        placesPaid: payouts.length,
        bubble: bubblePlace(payouts),
        playersLeft: room ? room.stats().playersLeft : null,
      });
    }

    if (p.startsWith('/api/tournaments/') && p.endsWith('/register') && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const id = p.split('/')[3];
      const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
      if (!t) return json(res, 404, { error: 'not found' });
      const already = db.prepare('SELECT 1 FROM tourney_regs WHERE tournament_id = ? AND user_id = ?').get(id, u.id);
      if (already) return json(res, 400, { error: 'Already registered' });
      if (!t.enabled || !['registering', 'running'].includes(t.status)) return json(res, 400, { error: 'Registration is closed' });
      if (t.entrants >= t.max_players) return json(res, 400, { error: 'Tournament is full' });
      const startAt = Date.parse(t.start_at);
      if (Number.isFinite(startAt) && Date.now() > startAt + (Number(t.late_reg) || 0) * 60000) {
        return json(res, 400, { error: 'Late registration closed' });
      }
      const total = t.buyin + t.fee;
      if (u.balance < total) return json(res, 400, { error: 'Insufficient balance' });
      if (total > 0) addTransaction(u.id, 'tourney_buyin', -total, `Registration ${t.name}`);
      db.prepare('INSERT INTO tourney_regs (tournament_id,user_id) VALUES (?,?)').run(id, u.id);
      db.prepare('UPDATE tournaments SET entrants = entrants + 1 WHERE id = ?').run(id);
      setMissionDone(u.id, 'daily-tourney');
      return json(res, 200, { ok: true });
    }

    if (p.startsWith('/api/tournaments/') && p.endsWith('/play') && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const id = p.split('/')[3];
      const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
      if (!t) return json(res, 404, { error: 'not found' });
      const reg = db.prepare('SELECT 1 FROM tourney_regs WHERE tournament_id = ? AND user_id = ?').get(id, u.id);
      const room = ensureTournamentRoom(t);
      const seated = room.tableOf(u.id);
      if (t.status === 'completed' && !seated) {
        disposeTournamentRoom(id, { force: true });
        return json(res, 400, { error: 'This tournament has finished' });
      }
      // Already in the event (including the winner back on their table).
      if (seated) {
        return json(res, 200, { ok: true, tableId: seated.cfg.id, tableIndex: room.flightIndexOf(seated.cfg.id) });
      }
      // One registration buys exactly one stack; it is consumed when the player busts, leaves or wins.
      if (!reg && !seated) return json(res, 400, { error: 'Register first' });
      // Opening an event early starts it, and starting seats the whole field.
      if (startTournament(t)) {
        const own = room.tableOf(u.id);
        if (own) return json(res, 200, { ok: true, tableId: own.cfg.id, tableIndex: room.flightIndexOf(own.cfg.id) });
      }
      // Flights are allocated by the seating engine: humans fill one table
      // before the next opens, and a bot steps aside when a human arrives.
      const result = room.seat({ id: u.id, nick: u.nick, avatar: u.avatar }, { stack: t.starting_stack });
      if (!result.ok) return json(res, 400, { error: result.error });
      const table = getLiveTable(result.tableId);
      if (!table) return json(res, 500, { error: 'cannot create table' });
      table.maybeStart();
      const entry = LIVE_TABLES.get(result.tableId);
      if (entry) broadcastState(table);
      return json(res, 200, { ok: true, tableId: result.tableId, tableIndex: result.index });
    }

    if (p.startsWith('/api/tournaments/') && p.endsWith('/unregister') && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const id = p.split('/')[3];
      const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
      const already = db.prepare('SELECT 1 FROM tourney_regs WHERE tournament_id = ? AND user_id = ?').get(id, u.id);
      if (!already || !t) return json(res, 400, { error: 'Not registered' });
      if (t.status !== 'registering') return json(res, 400, { error: 'Unregistration is closed' });
      // A seated player is in the event on every flight, not just the legacy table.
      const seatedOnFlight = TOURNAMENT_ROOMS.get(id)?.tableOf(u.id);
      if (seatedOnFlight || tournamentTableIds(id, MAX_FLIGHTS).some((tid) => LIVE_TABLES.get(tid)?.table.seatOf(u.id))) {
        return json(res, 400, { error: 'You are already playing this tournament' });
      }
      if (t.buyin + t.fee > 0) addTransaction(u.id, 'tourney_refund', t.buyin + t.fee, `Unregistration ${t.name}`);
      db.prepare('DELETE FROM tourney_regs WHERE tournament_id = ? AND user_id = ?').run(id, u.id);
      db.prepare('UPDATE tournaments SET entrants = MAX(0, entrants - 1) WHERE id = ?').run(id);
      return json(res, 200, { ok: true });
    }

    // ---------- cashier ----------
    const isoWeekKey = (d = new Date()) => {
      const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const dayNum = (date.getUTCDay() + 6) % 7;
      date.setUTCDate(date.getUTCDate() - dayNum + 3);
      const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
      const firstDay = (firstThursday.getUTCDay() + 6) % 7;
      firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
      const week = 1 + Math.round((date - firstThursday) / 604800000);
      return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    };
    if (p === '/api/cashier') {
      const u = requireUser(req, res); if (!u) return;
      const tx = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(u.id);
      const claimed = new Set(db.prepare('SELECT claim_key FROM bonus_claims WHERE user_id = ?').all(u.id).map((r) => r.claim_key));
      const day = new Date().toISOString().slice(0, 10);
      const weekKey = `reload:${isoWeekKey()}`;
      const bonuses = [
        { id: 'welcome', title: 'Welcome bonus', subtitle: 'One-time welcome credit', amount: 100000, claimed: claimed.has('welcome') },
        { id: 'reload', title: 'Weekly reload', subtitle: 'Once per week', amount: 50000, claimed: claimed.has(weekKey) },
        { id: 'daily', title: 'Daily freebie', subtitle: 'Once per day', amount: 1000, claimed: claimed.has(`daily:${day}`) },
      ];
      return json(res, 200, { user: publicUser(u), transactions: tx, bonuses });
    }

    if (p === '/api/cashier/bonus' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const body = await readBody(req);
      const id = String(body.id || '');
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      const weekKey = `reload:${isoWeekKey(now)}`;
      const defs = {
        welcome: { amount: 100000, key: 'welcome', label: 'Welcome bonus' },
        reload: { amount: 50000, key: weekKey, label: 'Weekly reload' },
        daily: { amount: 1000, key: `daily:${day}`, label: 'Daily freebie' },
      };
      const def = defs[id];
      if (!def) return json(res, 400, { error: 'unknown bonus' });
      const info = db.prepare('INSERT OR IGNORE INTO bonus_claims (user_id,claim_key,amount) VALUES (?,?,?)').run(u.id, def.key, def.amount);
      if (info.changes === 0) return json(res, 409, { error: 'Bonus already claimed' });
      try {
        const award = addTransactionEx(u.id, 'bonus', def.amount, def.label, 'USD', { reference: `bonus:${u.id}:${def.key}`, onDuplicate: 'skip' });
        if (!award.applied) { db.prepare('DELETE FROM bonus_claims WHERE user_id = ? AND claim_key = ?').run(u.id, def.key); return json(res, 409, { error: 'Bonus already claimed' }); }
        db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(u.login, 'bonus_claim', def.key);
        return json(res, 200, { ok: true, amount: def.amount, balance: award.balance });
      } catch (err) {
        db.prepare('DELETE FROM bonus_claims WHERE user_id = ? AND claim_key = ?').run(u.id, def.key);
        throw err;
      }
    }

    if (p === '/api/cashier/deposit' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const body = await readBody(req);
      const amount = toInt(body.amount, { min: 1, max: 100000000 });
      if (amount === null) return json(res, 400, { error: 'Invalid amount' });
      const reference = idempotentReference(req, body, 'cashier:deposit');
      const existing = transactionByReference(u.id, reference);
      if (existing) {
        if (existing.amount !== amount) return json(res, 409, { error: 'Idempotency key reused with a different amount' });
        return json(res, 200, { ok: true, balance: u.balance, replayed: true });
      }
      const award = addTransactionEx(u.id, 'deposit', amount, String(body.method || 'Instant bank transfer').slice(0, 60), 'USD', reference ? { reference, onDuplicate: 'skip' } : {});
      return json(res, 200, { ok: true, balance: award.balance, replayed: !award.applied });
    }

    if (p === '/api/cashier/withdraw' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const body = await readBody(req);
      const amount = toInt(body.amount, { min: 1, max: u.balance });
      if (amount === null) return json(res, 400, { error: 'Invalid amount' });
      const reference = idempotentReference(req, body, 'cashier:withdraw');
      const existing = transactionByReference(u.id, reference);
      if (existing) {
        if (existing.amount !== -amount) return json(res, 409, { error: 'Idempotency key reused with a different amount' });
        return json(res, 200, { ok: true, balance: u.balance, replayed: true });
      }
      const award = addTransactionEx(u.id, 'withdraw', -amount, String(body.method || 'Bank transfer').slice(0, 60), 'USD', reference ? { reference, onDuplicate: 'skip' } : {});
      return json(res, 200, { ok: true, balance: award.balance, replayed: !award.applied });
    }

    // ---------- hand history ----------
    if (p === '/api/hands') {
      const u = requireUser(req, res); if (!u) return;
      // Only hands the player sat in, and only the cards they were entitled to see.
      const rows = db.prepare('SELECT * FROM hands ORDER BY id DESC LIMIT ?').all(HAND_HISTORY_SCAN);
      const hands = rows.map((h) => handForViewer(h, u.id)).filter(Boolean).slice(0, HAND_HISTORY_LIMIT);
      return json(res, 200, { hands });
    }

    // ---------- missions / rewards ----------
    if (p === '/api/missions') {
      const u = requireUser(req, res); if (!u) return;
      const defs = db.prepare('SELECT * FROM missions WHERE active = 1 ORDER BY sort').all();
      const claims = db.prepare("SELECT * FROM player_claims WHERE user_id = ? AND kind = 'mission'").all(u.id);
      const byId = new Map(claims.map((c) => [c.period_key, c]));
      return json(res, 200, { missions: defs.map((m) => {
        const c = byId.get(missionPeriodKey(m.id));
        return { ...m, progress: c?.progress || 0, claimed: c?.claimed || 0 };
      }) });
    }

    if (p.startsWith('/api/missions/') && p.endsWith('/claim') && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const id = p.split('/')[3];
      const m = db.prepare('SELECT * FROM missions WHERE id = ?').get(id);
      if (!m) return json(res, 404, { error: 'not found' });
      const period = missionPeriodKey(id);
      const c = getClaim(u.id, 'mission', period);
      if (c?.claimed) return json(res, 400, { error: 'Already claimed' });
      if (!c || c.progress < m.goal) return json(res, 400, { error: 'Mission not complete' });
      const award = claimReward(u.id, 'mission', period, m.reward, m.reward_kind, `Mission: ${m.title}`);
      if (!award.claimed) return json(res, 400, { error: 'Already claimed' });
      return json(res, 200, { ok: true, balance: award.balance, reward: m.reward, kind: m.reward_kind });
    }

    if (p === '/api/reports' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const b = await readBody(req);
      const targetId = Number(b.targetId);
      const target = db.prepare('SELECT id,nick FROM users WHERE id = ? AND deleted_at IS NULL').get(targetId);
      if (!target) return json(res, 404, { error: 'Player not found' });
      if (target.id === u.id) return json(res, 400, { error: 'You cannot report yourself' });
      const reason = String(b.reason || '').trim().slice(0, 60) || 'Other';
      const detail = String(b.detail || '').trim().slice(0, 500);
      const handId = String(b.handId || '').slice(0, 80) || null;
      const info = db.prepare('INSERT INTO reports (reporter_id,target_id,reason,detail,hand_id) VALUES (?,?,?,?,?)').run(u.id, target.id, reason, detail, handId);
      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(u.login, 'report', `target ${target.nick} (${target.id}) — ${reason}`);
      return json(res, 200, { ok: true, id: Number(info.lastInsertRowid) });
    }

    if (p === '/api/elo') {
      const u = userByToken(tokenFrom(req));
      const game = eloGame(url.searchParams.get('game') || 'all');
      const selected = url.searchParams.get('game') || 'all';
      const rows = selected === 'all'
        ? db.prepare('SELECT id,nick,avatar,vip_level,elo FROM users WHERE deleted_at IS NULL AND banned = 0 ORDER BY elo DESC, nick LIMIT 50').all()
        : db.prepare(`SELECT u.id,u.nick,u.avatar,u.vip_level,COALESCE(e.elo,1000) AS elo
            FROM users u LEFT JOIN elo_ratings e ON e.user_id = u.id AND e.game = ?
            WHERE u.deleted_at IS NULL AND u.banned = 0 ORDER BY elo DESC, u.nick LIMIT 50`).all(game);
      const rank = u ? rows.findIndex((r) => r.id === u.id) + 1 : 0;
      const mine = u && selected !== 'all' ? db.prepare('SELECT elo FROM elo_ratings WHERE user_id = ? AND game = ?').get(u.id, game) : null;
      const history = u
        ? (selected === 'all'
          ? db.prepare('SELECT delta, before, after, created_at, game FROM elo_history WHERE user_id = ? ORDER BY id DESC LIMIT 12').all(u.id)
          : db.prepare('SELECT delta, before, after, created_at, game FROM elo_history WHERE user_id = ? AND game = ? ORDER BY id DESC LIMIT 12').all(u.id, game))
        : [];
      const me = u ? { ...publicUser(u), elo: Number(mine?.elo ?? u.elo ?? 1000), rank: rank || null, history } : null;
      return json(res, 200, { leaders: rows, me, game: selected });
    }

    if (p === '/api/leaderboard') {
      const rows = db.prepare('SELECT nick, vip_level, xp, vip_points, avatar FROM users WHERE banned = 0 ORDER BY vip_points DESC LIMIT 50').all();
      return json(res, 200, { leaders: rows.map((r, i) => ({ rank: i + 1, ...r })) });
    }

    if (p === '/api/rewards/daily' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const day = new Date().toISOString().slice(0, 10);
      const already = getClaim(u.id, 'daily', day);
      if (already?.claimed) return json(res, 400, { error: 'Daily freebie already claimed today', amount: already.amount });
      const amount = 500 + Math.floor(Math.random() * 20) * 250;
      const award = claimReward(u.id, 'daily', day, amount, 'USD', 'Daily freebie');
      if (!award.claimed) return json(res, 400, { error: 'Daily freebie already claimed today', amount: award.amount });
      return json(res, 200, { ok: true, amount: award.amount, balance: award.balance });
    }

    if (p === '/api/rewards/daily') {
      const u = requireUser(req, res); if (!u) return;
      const day = new Date().toISOString().slice(0, 10);
      const already = getClaim(u.id, 'daily', day);
      return json(res, 200, { claimed: !!already?.claimed, amount: already?.amount || 0 });
    }

    if (p === '/api/rewards/spin' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const prizes = [0, 500, 1000, 2500, 5000, 10000, 25000, 100000];
      // One free spin per day: an unlimited wheel was an unlimited source of chips.
      const day = new Date().toISOString().slice(0, 10);
      if (getClaim(u.id, 'fishbuffet', day)?.claimed) return json(res, 400, { error: 'You already used today\'s spin. Come back tomorrow.' });
      const idx = randomInt(prizes.length);
      const amount = prizes[idx];
      const award = claimReward(u.id, 'fishbuffet', day, amount, 'USD', 'Fish Buffet wheel');
      if (!award.claimed) return json(res, 400, { error: 'You already used today\'s spin. Come back tomorrow.' });
      return json(res, 200, { index: idx, amount, prizes, balance: award.balance });
    }


    // ---------- casino games ----------
    if (p === '/api/games/crash' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const b = await readBody(req);
      const now = Date.now();
      if (b.action === 'start') {
        const bet = Math.round(Number(b.bet));
        if (!Number.isFinite(bet) || bet < 100 || bet > 500000) return json(res, 400, { error: 'Bet must be between $1 and $5,000' });
        const fresh = db.prepare('SELECT balance FROM users WHERE id = ?').get(u.id);
        if (!fresh || fresh.balance < bet) return json(res, 400, { error: 'Insufficient balance' });
        for (const [id, r] of CRASH_ROUNDS) {
          if (r.userId === u.id && r.status === 'live' && now - r.startedAt < r.duration) return json(res, 409, { error: 'Finish the current round first' });
          if (r.userId === u.id && (r.status !== 'live' || now - r.startedAt > 120000)) CRASH_ROUNDS.delete(id);
        }
        const crash = Math.min(50, Math.max(1.01, 1 / (1 - Math.random())));
        const duration = Math.max(900, Math.log(crash) * 1800);
        const round = { id: randomUUID(), userId: u.id, bet, crash, duration, startedAt: now, status: 'live' };
        CRASH_ROUNDS.set(round.id, round);
        addTransaction(u.id, 'crash_bet', -bet, `Crash bet ${bet / 100}`, 'USD');
        return json(res, 200, { roundId: round.id, startedAt: now, bet, serverNow: now });
      }
      if (b.action === 'status') {
        const r = CRASH_ROUNDS.get(String(b.roundId || ''));
        if (!r || r.userId !== u.id) return json(res, 404, { error: 'Round not found' });
        const elapsed = now - r.startedAt;
        const crashed = r.status === 'crashed' || elapsed >= r.duration;
        if (crashed) r.status = 'crashed';
        return json(res, 200, { roundId: r.id, elapsed, multiplier: Number(Math.exp(elapsed / 1800).toFixed(2)), crashed, crash: crashed ? Number(r.crash.toFixed(2)) : null, status: r.status });
      }
      if (b.action === 'cashout') {
        const r = CRASH_ROUNDS.get(String(b.roundId || ''));
        if (!r || r.userId !== u.id) return json(res, 404, { error: 'Round not found' });
        if (r.status !== 'live') return json(res, 409, { error: 'Round already finished' });
        const elapsed = now - r.startedAt;
        const current = Math.exp(elapsed / 1800);
        if (current >= r.crash) {
          r.status = 'crashed';
          return json(res, 200, { ok: true, won: false, crash: Number(r.crash.toFixed(2)), multiplier: Number(r.crash.toFixed(2)) });
        }
        r.status = 'cashed';
        const payout = Math.max(0, Math.round(r.bet * current));
        addTransaction(u.id, 'crash_win', payout, `Crash cashout ${current.toFixed(2)}x`, 'USD');
        return json(res, 200, { ok: true, won: true, multiplier: Number(current.toFixed(2)), payout, crash: Number(r.crash.toFixed(2)) });
      }
      return json(res, 400, { error: 'Unknown action' });
    }

    if (p === '/api/games/slot' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const body = await readBody(req);
      const bet = parseBet(body.bet);
      if (u.balance < bet) return json(res, 400, { error: 'Insufficient balance' });
      const { grid, lines, win } = spinSlots(bet);
      const after = addTransaction(u.id, 'slots', win - bet, `Slots ${win ? 'win ' + win : 'spin'}`, 'USD');
      return json(res, 200, { grid, lines, win, bet, balance: after });
    }

    if (p === '/api/games/roulette' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const body = await readBody(req);
      const bet = parseBet(body.bet);
      if (u.balance < bet) return json(res, 400, { error: 'Insufficient balance' });
      const kind = String(body.kind || 'red');
      const ROULETTE_KINDS = ['red', 'black', 'even', 'odd', 'low', 'high', 'dozen1', 'dozen2', 'dozen3', 'column1', 'column2', 'column3', 'number'];
      if (!ROULETTE_KINDS.includes(kind)) return json(res, 400, { error: 'Unknown bet type' });
      const pickedNumber = kind === 'number' ? toInt(body.value, { min: 0, max: 36 }) : null;
      if (kind === 'number' && pickedNumber === null) return json(res, 400, { error: 'Pick a number from 0 to 36' });
      const number = randomInt(37);
      const reds = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
      let payout = 0;
      switch (kind) {
        case 'red': if (number !== 0 && reds.has(number)) payout = bet * 2; break;
        case 'black': if (number !== 0 && !reds.has(number)) payout = bet * 2; break;
        case 'even': if (number !== 0 && number % 2 === 0) payout = bet * 2; break;
        case 'odd': if (number % 2 === 1) payout = bet * 2; break;
        case 'low': if (number >= 1 && number <= 18) payout = bet * 2; break;
        case 'high': if (number >= 19) payout = bet * 2; break;
        case 'dozen1': if (number >= 1 && number <= 12) payout = bet * 3; break;
        case 'dozen2': if (number >= 13 && number <= 24) payout = bet * 3; break;
        case 'dozen3': if (number >= 25 && number <= 36) payout = bet * 3; break;
        case 'column1': if (number !== 0 && number % 3 === 1) payout = bet * 3; break;
        case 'column2': if (number !== 0 && number % 3 === 2) payout = bet * 3; break;
        case 'column3': if (number !== 0 && number % 3 === 0) payout = bet * 3; break;
        case 'number': if (number === pickedNumber) payout = bet * 36; break;
        default: break;
      }
      const after = addTransaction(u.id, 'roulette', payout - bet, `Roulette ${number}`, 'USD');
      return json(res, 200, { number, red: reds.has(number), payout, bet, balance: after });
    }

    if (p === '/api/games/blackjack' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const body = await readBody(req);
      const action = String(body.action || 'deal');
      const bjValue = (cards) => {
        let sum = cards.reduce((a, c) => a + (c.v >= 10 ? 10 : c.v === 14 ? 11 : c.v), 0);
        let aces = cards.filter((c) => c.v === 14).length;
        while (sum > 21 && aces > 0) { sum -= 10; aces--; }
        return sum;
      };
      if (action === 'deal') {
        if (BJ_HANDS.has(u.id)) return json(res, 400, { error: 'Finish the current hand first' });
        const bet = parseBet(body.bet);
        if (u.balance < bet) return json(res, 400, { error: 'Insufficient balance' });
        const after = addTransaction(u.id, 'blackjack', -bet, 'Blackjack bet');
        const deck = shuffle(makeDeck(false));
        const player = [deck.pop(), deck.pop()];
        const dealer = [deck.pop(), deck.pop()];
        BJ_HANDS.set(u.id, { deck, player, dealer, bet });
        return json(res, 200, {
          player: player.map(cardStr), dealer: [cardStr(dealer[0]), '??'],
          playerTotal: bjValue(player), balance: after, bet, blackjack: bjValue(player) === 21,
        });
      }
      const hand = BJ_HANDS.get(u.id);
      if (action === 'state') {
        // Lets the page resume a hand left open by a reload or navigation.
        if (!hand) return json(res, 200, { active: false });
        return json(res, 200, {
          active: true, player: hand.player.map(cardStr), dealer: [cardStr(hand.dealer[0]), '??'],
          playerTotal: bjValue(hand.player), bet: hand.bet,
        });
      }
      if (!hand) return json(res, 400, { error: 'No active hand' });
      if (action === 'hit') {
        hand.player.push(hand.deck.pop());
        const pv = bjValue(hand.player), dv = bjValue(hand.dealer);
        if (pv > 21) {
          BJ_HANDS.delete(u.id);
          const fresh = db.prepare('SELECT balance FROM users WHERE id = ?').get(u.id).balance;
          return json(res, 200, { player: hand.player.map(cardStr), dealer: hand.dealer.map(cardStr), playerTotal: pv, bust: true, payout: 0, balance: fresh, done: true });
        }
        return json(res, 200, { player: hand.player.map(cardStr), playerTotal: pv, dealer: [cardStr(hand.dealer[0]), '??'], done: false });
      }
      if (action === 'stand') {
        while (bjValue(hand.dealer) < 17) hand.dealer.push(hand.deck.pop());
        const pv = bjValue(hand.player), dv = bjValue(hand.dealer);
        const natural = hand.player.length === 2 && pv === 21;
        let payout = 0;
        let result = 'lose';
        if (pv > 21) { payout = 0; result = 'bust'; }
        else if (dv > 21 || pv > dv) { payout = natural ? Math.floor(hand.bet * 2.5) : hand.bet * 2; result = 'win'; }
        else if (pv === dv) { payout = hand.bet; result = 'push'; }
        const after = payout > 0 ? addTransaction(u.id, 'blackjack', payout, `Blackjack ${result}`) : db.prepare('SELECT balance FROM users WHERE id = ?').get(u.id).balance;
        BJ_HANDS.delete(u.id);
        return json(res, 200, { player: hand.player.map(cardStr), dealer: hand.dealer.map(cardStr), playerTotal: pv, dealerTotal: dv, payout, result, done: true, balance: after });
      }
      return json(res, 400, { error: 'unknown action' });
    }

    if (p === '/api/games/tablegame' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const body = await readBody(req);
      const game = String(body.game || 'baccarat');
      const bet = parseBet(body.bet);
      const pick = String(body.pick || '');
      const PICKS = {
        baccarat: /^(player|banker|tie)$/, dragontiger: /^(dragon|tiger|tie)$/,
        sicbo: /^(big|small|triple|anytie|total(?:[4-9]|1[0-7]))$/,
      };
      if (!PICKS[game]) return json(res, 400, { error: 'unknown game' });
      if (!PICKS[game].test(pick)) return json(res, 400, { error: 'Choose a valid bet' });
      if (u.balance < bet) return json(res, 400, { error: 'Insufficient balance' });
      const deck = shuffle(makeDeck(false));
      const rank = (c) => c.v;
      let payout = 0;
      let result = {};
      if (game === 'baccarat') {
        const p1 = [deck.pop(), deck.pop()];
        const b1 = [deck.pop(), deck.pop()];
        const tot = (cs) => cs.reduce((a, c) => a + (c.v >= 10 ? 0 : c.v === 14 ? 1 : c.v), 0) % 10;
        let pt = tot(p1), bt = tot(b1);
        if (pt <= 5) { p1.push(deck.pop()); pt = tot(p1); }
        if (bt <= 5) { b1.push(deck.pop()); bt = tot(b1); }
        const winner = pt > bt ? 'player' : bt > pt ? 'banker' : 'tie';
        if (pick === winner) payout = bet * (winner === 'tie' ? 9 : winner === 'banker' ? 1.95 : 2);
        else if (winner === 'tie') payout = bet; // player/banker bets push on a tie
        result = { player: p1.map(cardStr), banker: b1.map(cardStr), playerTotal: pt, bankerTotal: bt, winner };
      } else if (game === 'dragontiger') {
        const d = [deck.pop()];
        const t = [deck.pop()];
        const dv = rank(d[0]), tv = rank(t[0]);
        const winner = dv > tv ? 'dragon' : tv > dv ? 'tiger' : 'tie';
        if (pick === winner) payout = bet * (winner === 'tie' ? 8 : 2);
        result = { dragon: d.map(cardStr), tiger: t.map(cardStr), winner, dragonRank: dv, tigerRank: tv };
      } else if (game === 'sicbo') {
        const dice = [1, 2, 3].map(() => 1 + randomInt(6));
        const sum = dice.reduce((a, b) => a + b, 0);
        const triple = dice[0] === dice[1] && dice[1] === dice[2];
        if (pick === 'big' && sum >= 11 && sum <= 17 && !triple) payout = bet * 2;
        else if (pick === 'small' && sum >= 4 && sum <= 10 && !triple) payout = bet * 2;
        else if (pick === 'triple' && triple) payout = bet * 30;
        else if (pick === 'anytie' && triple) payout = bet * 8;
        else if (pick.startsWith('total') && Number(pick.slice(5)) === sum) payout = bet * SICBO_TOTAL_PAYS[sum];
        result = { dice, sum, triple };
      } else {
        return json(res, 400, { error: 'unknown game' });
      }
      payout = Math.round(payout);
      const after = addTransaction(u.id, game, payout - bet, `${game} ${pick} ${payout ? 'won' : 'lost'}`, 'USD');
      return json(res, 200, { result, payout, bet, balance: after });
    }

    if (p === '/api/games/propbet' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const body = await readBody(req);
      const stake = parseBet(body.stake);
      if (u.balance < stake) return json(res, 400, { error: 'Insufficient balance' });
      const markets = {
        coinflip: { win: Math.random() < 0.5, mult: 1.96 },
        river_ace: { win: Math.random() < 0.22, mult: 4.2 },
        next_hand_red: { win: Math.random() < 0.5, mult: 1.9 },
        any_flush: { win: Math.random() < 0.18, mult: 5.1 },
        player_wins: { win: Math.random() < 0.48, mult: 2.0 },
      };
      if (!Object.hasOwn(markets, String(body.market))) return json(res, 400, { error: 'Unknown market' });
      const m = markets[body.market];
      const won = m.win;
      const payout = won ? Math.round(stake * m.mult) : 0;
      const after = addTransaction(u.id, 'propbet', payout - stake, `Prop bet ${body.market} ${won ? 'won' : 'lost'}`, 'USD');
      return json(res, 200, { won, payout, stake, balance: after, market: body.market });
    }

    // ---------- sessions & password ----------
    if (p === '/api/sessions' && req.method === 'GET') {
      const u = requireUser(req, res); if (!u) return;
      const current = tokenFrom(req);
      const rows = db.prepare('SELECT token, created_at, expires_at, device FROM sessions WHERE user_id = ? AND expires_at > datetime(\'now\') ORDER BY created_at DESC').all(u.id);
      return json(res, 200, { sessions: rows.map((r) => ({ ...r, current: r.token === current })) });
    }
    if (p === '/api/sessions' && req.method === 'DELETE') {
      const u = requireUser(req, res); if (!u) return;
      const current = tokenFrom(req);
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(u.id, current);
      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(u.login, 'sessions_revoked', 'all other devices');
      return json(res, 200, { ok: true });
    }
    if (p.startsWith('/api/sessions/') && req.method === 'DELETE') {
      const u = requireUser(req, res); if (!u) return;
      const token = p.split('/')[3];
      if (token === tokenFrom(req)) return json(res, 400, { error: 'Use logout for this device' });
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token = ?').run(u.id, token);
      return json(res, 200, { ok: true });
    }
    if (p === '/api/password' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const b = await readBody(req);
      if (!checkPassword(b.current || '', u.password)) return json(res, 400, { error: 'Current password is incorrect' });
      if (String(b.next || '').length < 6) return json(res, 400, { error: 'New password must be at least 6 characters' });
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(b.next), u.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(u.id, tokenFrom(req));
      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(u.login, 'password_changed', '');
      return json(res, 200, { ok: true });
    }

    // ---------- identity verification ----------
    if (p === '/api/verify' && req.method === 'GET') {
      const u = requireUser(req, res); if (!u) return;
      const row = db.prepare('SELECT id, full_name, dob, country, doc_type, status, note, created_at, reviewed_at FROM verifications WHERE user_id = ?').get(u.id);
      return json(res, 200, { verification: row || null });
    }
    if (p === '/api/verify' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const b = await readBody(req);
      const fullName = String(b.fullName || '').trim();
      if (fullName.length < 3) return json(res, 400, { error: 'Enter your full legal name' });
      if (!b.dob) return json(res, 400, { error: 'Date of birth is required' });
      const m = String(b.dataUrl || '').match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
      if (!m) return json(res, 400, { error: 'Attach a photo of your ID' });
      if (Buffer.from(m[2], 'base64').length > 5 * 1024 * 1024) return json(res, 400, { error: 'Image too large (5 MB max)' });
      db.prepare(`INSERT INTO verifications (user_id, full_name, dob, country, doc_type, doc_data, status, note, created_at, reviewed_at)
        VALUES (?,?,?,?,?,?,'pending',NULL,datetime('now'),NULL)
        ON CONFLICT(user_id) DO UPDATE SET full_name=excluded.full_name, dob=excluded.dob, country=excluded.country,
          doc_type=excluded.doc_type, doc_data=excluded.doc_data, status='pending', note=NULL, created_at=datetime('now'), reviewed_at=NULL`)
        .run(u.id, fullName, String(b.dob), String(b.country || ''), String(b.docType || 'Passport'), String(b.dataUrl));
      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(u.login, 'verification_submit', u.nick);
      return json(res, 200, { ok: true });
    }

    // ---------- friends ----------
    if (p.startsWith('/api/users/') && p.endsWith('/profile') && req.method === 'GET') {
      const viewer = requireUser(req, res); if (!viewer) return;
      const id = Number(p.split('/')[3]);
      const target = db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL AND banned = 0').get(id);
      if (!target) return json(res, 404, { error: 'not found' });
      const hands = db.prepare('SELECT players, result, pot FROM hands WHERE table_id IS NOT NULL ORDER BY id DESC LIMIT 2000').all();
      let played = 0, won = 0, biggest = 0;
      for (const h of hands) {
        let players = [];
        try { players = JSON.parse(h.players || '[]'); } catch { continue; }
        if (!Array.isArray(players) || !players.some((x) => Number(x.id) === id)) continue;
        played++;
        const wins = h.result?.winners || [];
        if (wins.some((w) => Number(w.id) === id)) won++;
        for (const w of wins) if (Number(w.id) === id) biggest = Math.max(biggest, Number(w.amount) || 0);
      }
      const friend = db.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').get(viewer.id, id);
      const pending = db.prepare("SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'").get(viewer.id, id);
      return json(res, 200, {
        user: { id: target.id, nick: target.nick, avatar: target.avatar, vip_level: target.vip_level, country: target.country, created_at: target.created_at },
        stats: { played, won, biggest },
        friend: !!friend, pending: !!pending,
        online: [...LIVE_TABLES.values()].some((e) => e.table.seatOf(id)),
      });
    }

    if (p === '/api/friends' && req.method === 'GET') {
      const u = requireUser(req, res); if (!u) return;
      const rows = db.prepare(`SELECT f.friend_id AS id, u.nick, u.avatar, u.vip_level, u.login, f.created_at
        FROM friends f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? ORDER BY u.nick`).all(u.id);
      const online = (id) => {
        for (const e of LIVE_TABLES.values()) if (e.table.seats.some((s2) => s2.player && s2.player.id === id)) return true;
        return false;
      };
      return json(res, 200, { friends: rows.map((r) => ({ ...r, online: online(r.id) })) });
    }
    if (p === '/api/friends/requests' && req.method === 'GET') {
      const u = requireUser(req, res); if (!u) return;
      const incoming = db.prepare(`SELECT r.from_id AS id, u.nick, u.avatar, u.vip_level, r.created_at FROM friend_requests r JOIN users u ON u.id = r.from_id WHERE r.to_id = ? AND r.status = 'pending' ORDER BY r.created_at DESC`).all(u.id);
      const outgoing = db.prepare(`SELECT r.to_id AS id, u.nick, u.avatar, u.vip_level, r.created_at FROM friend_requests r JOIN users u ON u.id = r.to_id WHERE r.from_id = ? AND r.status = 'pending' ORDER BY r.created_at DESC`).all(u.id);
      return json(res, 200, { incoming, outgoing });
    }
    if (p === '/api/friends/requests' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const b = await readBody(req);
      const nick = String(b.nick || '').trim();
      if (!nick) return json(res, 400, { error: 'Enter a nickname' });
      const target = db.prepare('SELECT * FROM users WHERE lower(nick) = lower(?) OR lower(login) = lower(?)').get(nick, nick);
      if (!target) return json(res, 404, { error: 'Player not found' });
      if (target.id === u.id) return json(res, 400, { error: 'That is you' });
      if (db.prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').get(u.id, target.id)) return json(res, 409, { error: 'Already friends' });
      const reverse = db.prepare("SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'").get(target.id, u.id);
      if (reverse) {
        db.prepare("UPDATE friend_requests SET status = 'accepted' WHERE from_id = ? AND to_id = ?").run(target.id, u.id);
        db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?,?)').run(u.id, target.id);
        db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?,?)').run(target.id, u.id);
        notifyUser(target.id, { type: 'friend_accept', from_id: u.id, nick: u.nick });
        return json(res, 200, { ok: true, accepted: true, nick: target.nick });
      }
      db.prepare("INSERT INTO friend_requests (from_id,to_id,status) VALUES (?,?,'pending') ON CONFLICT(from_id,to_id) DO UPDATE SET status='pending', created_at=datetime('now')").run(u.id, target.id);
      notifyUser(target.id, { type: 'friend', from_id: u.id, nick: u.nick });
      return json(res, 200, { ok: true, requested: true, nick: target.nick });
    }
    if (p.startsWith('/api/friends/requests/') && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const from = Number(p.split('/')[4]);
      const b = await readBody(req);
      const row = db.prepare("SELECT * FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'").get(from, u.id);
      if (!row) return json(res, 404, { error: 'Request not found' });
      if (b.action === 'accept') {
        db.prepare("UPDATE friend_requests SET status = 'accepted' WHERE from_id = ? AND to_id = ?").run(from, u.id);
        db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?,?)').run(u.id, from);
        db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?,?)').run(from, u.id);
        notifyUser(from, { type: 'friend_accept', from_id: u.id, nick: u.nick });
        return json(res, 200, { ok: true });
      }
      db.prepare("UPDATE friend_requests SET status = 'declined' WHERE from_id = ? AND to_id = ?").run(from, u.id);
      return json(res, 200, { ok: true });
    }
    if (p.startsWith('/api/friends/') && req.method === 'DELETE') {
      const u = requireUser(req, res); if (!u) return;
      const id = Number(p.split('/')[3]);
      db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').run(u.id, id);
      return json(res, 200, { ok: true });
    }

    // ---------- ocean rewards ----------
    const OCEAN_LEVELS = [
      { name: 'Clownfish', min: 0, rank: 0 }, { name: 'Shrimp', min: 500, rank: 1 },
      { name: 'Crab', min: 1500, rank: 2 }, { name: 'Octopus', min: 3000, rank: 3 },
      { name: 'Turtle', min: 6000, rank: 4 }, { name: 'Dolphin', min: 12000, rank: 5 },
      { name: 'Shark', min: 25000, rank: 6 }, { name: 'Whale', min: 50000, rank: 7 },
    ];
    const OCEAN_ITEMS = [
      { id: 'ticket5', name: 'T$5 Tournament Ticket', cost: 500, kind: 'TICKET', amount: 5, desc: 'One tournament ticket' },
      { id: 'play100k', name: '100,000 Play Chips', cost: 800, kind: 'PLAY', amount: 100000, desc: 'Top up your P$ balance' },
      { id: 'bonus25', name: '$25 Play Bonus', cost: 2000, kind: 'USD', amount: 2500, desc: 'Credited to your play balance' },
      { id: 'ticket25', name: 'T$25 Ticket Pack', cost: 2200, kind: 'TICKET', amount: 25, desc: 'Five T$5 tickets' },
      { id: 'bonus50', name: '$50 Play Bonus', cost: 3500, kind: 'USD', amount: 5000, desc: 'Credited to your play balance' },
    ];
    if (p === '/api/ocean' && req.method === 'GET') {
      const u = requireUser(req, res); if (!u) return;
      let lvl = OCEAN_LEVELS[0];
      for (const l of OCEAN_LEVELS) if (u.gems >= l.min) lvl = l;
      const idx = OCEAN_LEVELS.indexOf(lvl);
      const next = OCEAN_LEVELS[idx + 1] || null;
      const hist = db.prepare("SELECT * FROM transactions WHERE user_id = ? AND kind = 'ocean' ORDER BY id DESC LIMIT 20").all(u.id);
      return json(res, 200, {
        gems: u.gems, level: lvl, next,
        progress: next ? Math.round(((u.gems - lvl.min) / (next.min - lvl.min)) * 100) : 100,
        items: OCEAN_ITEMS, history: hist,
      });
    }
    if (p === '/api/ocean/buy' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const b = await readBody(req);
      const item = OCEAN_ITEMS.find((i) => i.id === b.item);
      if (!item) return json(res, 400, { error: 'unknown item' });
      if (u.gems < item.cost) return json(res, 400, { error: 'Not enough gems' });
      addTransaction(u.id, 'ocean_spend', -item.cost, `Ocean store: ${item.name}`, 'GEM');
      addTransaction(u.id, 'ocean', item.amount, `Ocean store: ${item.name}`, item.kind);
      const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
      return json(res, 200, { ok: true, gems: fresh.gems, balance: fresh.balance, play_chips: fresh.play_chips, tickets: fresh.tickets });
    }

    // ---------- honeymoon ----------
    if (p === '/api/honeymoon' && req.method === 'GET') {
      const u = requireUser(req, res); if (!u) return;
      const day = new Date().toISOString().slice(0, 10);
      const welcome = getClaim(u.id, 'honeymoon', 'welcome');
      const daily = getClaim(u.id, 'honeymoon', day);
      return json(res, 200, {
        welcome: { claimed: !!welcome?.claimed, amount: 500 },
        daily: { claimed: !!daily?.claimed, amount: 100 },
        missions: true,
      });
    }
    if (p === '/api/honeymoon/claim' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const b = await readBody(req);
      const step = String(b.step || '');
      if (!['welcome', 'daily'].includes(step)) return json(res, 400, { error: 'unknown step' });
      const period = step === 'welcome' ? 'welcome' : new Date().toISOString().slice(0, 10);
      const amount = step === 'welcome' ? 500 : 100;
      const award = claimReward(u.id, 'honeymoon', period, amount, 'USD', step === 'welcome' ? 'Honeymoon welcome bonus' : 'Honeymoon daily gift');
      if (!award.claimed) return json(res, 400, { error: 'Already claimed' });
      return json(res, 200, { ok: true, amount, balance: award.balance });
    }

    // ---------- gg care ----------
    if (p === '/api/ggcare' && req.method === 'GET') {
      const u = requireUser(req, res); if (!u) return;
      const day = new Date().toISOString().slice(0, 10);
      const claimed = getClaim(u.id, 'ggcare', day);
      return json(res, 200, { jackpot: getSetting('jackpot', 199026635), claimed: !!claimed?.claimed, amount: claimed?.amount || 0 });
    }
    if (p === '/api/ggcare/claim' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const day = new Date().toISOString().slice(0, 10);
      const award = claimReward(u.id, 'ggcare', day, 500, 'USD', 'GG Care daily bonus');
      if (!award.claimed) return json(res, 400, { error: 'Already claimed today' });
      return json(res, 200, { ok: true, amount: award.amount, balance: award.balance });
    }

    // ---------- brand assets ----------
    if (p === '/api/brand') {
      const rows = db.prepare('SELECT slot, updated_at FROM brand_assets').all();
      const out = {};
      for (const r of rows) out[r.slot] = `/api/brand/${r.slot}?v=${encodeURIComponent(r.updated_at)}`;
      return json(res, 200, out);
    }
    if (p.startsWith('/api/brand/') && req.method === 'GET') {
      const slot = p.split('/')[3];
      const row = db.prepare('SELECT mime, data FROM brand_assets WHERE slot = ?').get(slot);
      if (!row) return json(res, 404, { error: 'not set' });
      res.writeHead(200, { 'content-type': row.mime, 'cache-control': 'public, max-age=31536000, immutable' });
      return res.end(Buffer.from(row.data, 'base64'));
    }
    if (p === '/api/admin/brand' && req.method === 'POST') {
      const a = requireAdmin(req, res); if (!a) return;
      const b = await readBody(req);
      const slot = String(b.slot || '');
      if (!['logo', 'promo'].includes(slot)) return json(res, 400, { error: 'invalid slot' });
      const m = String(b.dataUrl || '').match(/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/);
      if (!m) return json(res, 400, { error: 'invalid image' });
      const bytes = Buffer.from(m[2], 'base64');
      if (bytes.length > 3 * 1024 * 1024) return json(res, 400, { error: 'image too large (3 MB max)' });
      db.prepare(`INSERT INTO brand_assets (slot,mime,data,updated_at) VALUES (?,?,?,datetime('now'))
        ON CONFLICT(slot) DO UPDATE SET mime=excluded.mime, data=excluded.data, updated_at=datetime('now')`)
        .run(slot, m[1], bytes.toString('base64'));
      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(a.login, 'brand_upload', slot);
      return json(res, 200, { ok: true, slot });
    }
    if (p.startsWith('/api/admin/brand/') && req.method === 'DELETE') {
      const a = requireAdmin(req, res); if (!a) return;
      const slot = p.split('/')[4];
      db.prepare('DELETE FROM brand_assets WHERE slot = ?').run(slot);
      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(a.login, 'brand_reset', slot);
      return json(res, 200, { ok: true });
    }

    // ---------- player notes ----------
    if (p === '/api/notes' && req.method === 'GET') {
      const u = requireUser(req, res); if (!u) return;
      const rows = db.prepare('SELECT target, note, color, updated_at FROM player_notes WHERE user_id = ?').all(u.id);
      return json(res, 200, { notes: rows });
    }
    if (p === '/api/notes' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const b = await readBody(req);
      const target = String(b.target || '').slice(0, 40);
      const note = String(b.note || '').slice(0, 1000);
      if (!target) return json(res, 400, { error: 'missing target' });
      if (!note.trim()) { db.prepare('DELETE FROM player_notes WHERE user_id = ? AND target = ?').run(u.id, target); return json(res, 200, { ok: true, deleted: true }); }
      db.prepare(`INSERT INTO player_notes (user_id,target,note,color) VALUES (?,?,?,?)
        ON CONFLICT(user_id,target) DO UPDATE SET note=excluded.note, color=excluded.color, updated_at=datetime('now')`)
        .run(u.id, target, note, String(b.color || 'yellow'));
      return json(res, 200, { ok: true });
    }

    // ---------- chat ----------
    if (p === '/api/chat' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      if (u.chat_muted) return json(res, 403, { error: 'Chat is muted' });
      const body = await readBody(req);
      const msg = String(body.message || '').slice(0, 300);
      if (!msg.trim()) return json(res, 400, { error: 'empty' });
      if (chatLimiter.isBlocked(`lobby:${u.id}`)) return json(res, 429, { error: 'You are sending messages too quickly' });
      chatLimiter.record(`lobby:${u.id}`);
      db.prepare('INSERT INTO chat_messages (user_id,nick,channel,message) VALUES (?,?,?,?)').run(u.id, u.nick, 'lobby', msg);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/notifications/stream' && req.method === 'GET') {
      const u = userByToken(url.searchParams.get('token'));
      if (!u) return json(res, 401, { error: 'unauthorized' });
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      res.write('retry: 5000\n\n');
      const set = SSE_CLIENTS.get(u.id) || new Set();
      set.add(res);
      SSE_CLIENTS.set(u.id, set);
      // A registrant who opens the app after the start still learns where they sit.
      announceAwaySeats(u.id);
      const cleanup = () => { set.delete(res); if (!set.size) SSE_CLIENTS.delete(u.id); };
      req.on('close', cleanup);
      req.on('aborted', cleanup);
      return;
    }

    if (p === '/api/notifications' && req.method === 'GET') {
      const u = requireUser(req, res); if (!u) return;
      const requests = db.prepare(`SELECT r.from_id AS id, u.nick FROM friend_requests r JOIN users u ON u.id = r.from_id WHERE r.to_id = ? AND r.status = 'pending' ORDER BY r.created_at DESC`).all(u.id);
      const dm = db.prepare('SELECT COUNT(*) AS n FROM direct_messages WHERE to_id = ? AND read_at IS NULL').get(u.id).n;
      const upcoming = db.prepare(`SELECT t.id, t.name, t.start_at FROM tourney_regs r JOIN tournaments t ON t.id = r.tournament_id
        WHERE r.user_id = ? AND t.status = 'registering' AND t.start_at > datetime('now') ORDER BY t.start_at LIMIT 5`).all(u.id);
      const dailyClaimed = db.prepare("SELECT 1 FROM bonus_claims WHERE user_id = ? AND claim_key = ?").get(u.id, `daily:${new Date().toISOString().slice(0, 10)}`);
      const items = [];
      for (const r of requests) items.push({ key: `friend:${r.id}`, kind: 'friend', icon: '👥', title: `${r.nick} sent a friend request`, body: 'Open Friends to accept or decline.', link: '/my-page?tab=friends' });
      const latestDm = db.prepare('SELECT MAX(id) AS id FROM direct_messages WHERE to_id = ? AND read_at IS NULL').get(u.id);
      if (dm > 0) items.push({ key: `dm:${latestDm?.id || 0}`, kind: 'dm', icon: '💬', title: `${dm} unread direct message${dm === 1 ? '' : 's'}`, body: 'Open Messages to reply.', link: '/my-page?tab=messages' });
      for (const t of upcoming) items.push({ key: `tournament:${t.id}`, kind: 'tournament', icon: '🏆', title: t.name, body: `Starts ${new Date(t.start_at).toLocaleString('en-GB')}`, link: `/tournaments?id=${encodeURIComponent(t.id)}` });
      if (!dailyClaimed) items.push({ key: `bonus:daily:${new Date().toISOString().slice(0, 10)}`, kind: 'bonus', icon: '🎁', title: 'Daily freebie is ready', body: 'Claim it in the Cashier.', link: '/cashier' });
      const read = new Set(db.prepare('SELECT item_key FROM notification_reads WHERE user_id = ?').all(u.id).map((r) => r.item_key));
      const visible = items.filter((i) => !read.has(i.key));
      return json(res, 200, { items: visible, unread: visible.length });
    }

    if (p === '/api/notifications/read' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const b = await readBody(req);
      const keys = Array.isArray(b.keys) ? b.keys.slice(0, 50) : [];
      for (const key of keys) {
        if (typeof key !== 'string' || key.length > 160) continue;
        db.prepare('INSERT OR IGNORE INTO notification_reads (user_id,item_key) VALUES (?,?)').run(u.id, key);
      }
      return json(res, 200, { ok: true });
    }

    if (p === '/api/messages' && req.method === 'GET') {
      const u = requireUser(req, res); if (!u) return;
      const rows = db.prepare(`SELECT m.*, uf.nick AS from_nick, ut.nick AS to_nick
        FROM direct_messages m JOIN users uf ON uf.id = m.from_id JOIN users ut ON ut.id = m.to_id
        WHERE m.from_id = ? OR m.to_id = ? ORDER BY m.id DESC LIMIT 200`).all(u.id, u.id);
      const threads = new Map();
      for (const m of rows) {
        const peer = m.from_id === u.id ? m.to_id : m.from_id;
        const t = threads.get(peer) || { peer_id: peer, nick: m.from_id === u.id ? m.to_nick : m.from_nick, last: m.body, at: m.created_at, unread: 0 };
        if (m.to_id === u.id && !m.read_at) t.unread++;
        threads.set(peer, t);
      }
      return json(res, 200, { threads: [...threads.values()] });
    }

    if (p === '/api/messages' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      if (u.chat_muted) return json(res, 403, { error: 'Chat is muted' });
      const body = await readBody(req);
      const text = String(body.message || '').trim().slice(0, 500);
      if (!text) return json(res, 400, { error: 'Message is empty' });
      let peer = null;
      if (body.peerId) peer = db.prepare('SELECT id,nick FROM users WHERE id = ? AND deleted_at IS NULL AND banned = 0').get(Number(body.peerId));
      else if (body.nick) peer = db.prepare('SELECT id,nick FROM users WHERE nick = ? COLLATE NOCASE AND deleted_at IS NULL AND banned = 0').get(String(body.nick));
      if (!peer || peer.id === u.id) return json(res, 400, { error: 'Recipient not found' });
      const info = db.prepare('INSERT INTO direct_messages (from_id,to_id,body) VALUES (?,?,?)').run(u.id, peer.id, text);
      notifyUser(peer.id, { type: 'dm', from_id: u.id, nick: u.nick, messageId: Number(info.lastInsertRowid) });
      return json(res, 200, { ok: true, id: Number(info.lastInsertRowid), peer });
    }

    if (p.startsWith('/api/messages/') && req.method === 'GET') {
      const u = requireUser(req, res); if (!u) return;
      const peer = Number(p.split('/')[3]);
      if (!peer) return json(res, 400, { error: 'invalid peer' });
      db.prepare("UPDATE direct_messages SET read_at = datetime('now') WHERE from_id = ? AND to_id = ? AND read_at IS NULL").run(peer, u.id);
      const rows = db.prepare(`SELECT m.*, uf.nick AS from_nick FROM direct_messages m JOIN users uf ON uf.id = m.from_id
        WHERE (m.from_id = ? AND m.to_id = ?) OR (m.from_id = ? AND m.to_id = ?) ORDER BY m.id ASC LIMIT 200`).all(u.id, peer, peer, u.id);
      return json(res, 200, { messages: rows });
    }

    if (p === '/api/chat') {
      const rows = db.prepare(`SELECT * FROM chat_messages WHERE channel='lobby' ORDER BY id DESC LIMIT 50`).all().reverse();
      return json(res, 200, { messages: rows });
    }

    /* ---------------- admin ---------------- */
    if (await handleAdminWaitlistRoute(req, res, p)) return;
    if (p === '/api/admin/verifications' && req.method === 'GET') {
      const a = requireAdmin(req, res); if (!a) return;
      const rows = db.prepare(`SELECT v.id, v.user_id, u.nick, u.login, v.full_name, v.dob, v.country, v.doc_type, v.status, v.note, v.created_at, v.reviewed_at
        FROM verifications v JOIN users u ON u.id = v.user_id ORDER BY CASE v.status WHEN 'pending' THEN 0 ELSE 1 END, v.created_at DESC`).all();
      return json(res, 200, { verifications: rows });
    }
    if (p.startsWith('/api/admin/verifications/') && p.endsWith('/doc') && req.method === 'GET') {
      const a = requireAdmin(req, res); if (!a) return;
      const id = Number(p.split('/')[4]);
      const row = db.prepare('SELECT doc_data FROM verifications WHERE id = ?').get(id);
      if (!row || !row.doc_data) return json(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end(row.doc_data);
    }
    if (p.startsWith('/api/admin/verifications/') && req.method === 'POST') {
      const a = requireAdmin(req, res); if (!a) return;
      const id = Number(p.split('/')[4]);
      const b = await readBody(req);
      const status = b.action === 'approve' ? 'approved' : b.action === 'reject' ? 'rejected' : null;
      if (!status) return json(res, 400, { error: 'invalid action' });
      db.prepare('UPDATE verifications SET status = ?, note = ?, reviewed_at = datetime(\'now\') WHERE id = ?').run(status, String(b.note || ''), id);
      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(a.login, 'verification_' + status, String(id));
      return json(res, 200, { ok: true });
    }

    if (p.startsWith('/api/admin/export/') && req.method === 'GET') {
      const a = requireAdmin(req, res); if (!a) return;
      const kind = p.split('/')[4];
      const esc = (v) => {
        const str = v == null ? '' : String(v);
        return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
      };
      const toCsv = (rows, cols) => [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
      let csv = '';
      if (kind === 'users') {
        const rows = db.prepare('SELECT id, login, nick, email, balance, play_chips, tickets, gems, vip_level, is_admin, created_at FROM users ORDER BY id').all();
        csv = toCsv(rows, ['id', 'login', 'nick', 'email', 'balance', 'play_chips', 'tickets', 'gems', 'vip_level', 'is_admin', 'created_at']);
      } else if (kind === 'transactions') {
        const rows = db.prepare('SELECT t.id, t.user_id, u.login, t.kind, t.amount, t.currency, t.memo, t.created_at FROM transactions t LEFT JOIN users u ON u.id = t.user_id ORDER BY t.id DESC LIMIT 5000').all();
        csv = toCsv(rows, ['id', 'user_id', 'login', 'kind', 'amount', 'currency', 'memo', 'created_at']);
      } else if (kind === 'hands') {
        const rows = db.prepare('SELECT id, table_name, hand_no, board, pot, hero_cards, result, created_at FROM hands ORDER BY id DESC LIMIT 5000').all();
        csv = toCsv(rows, ['id', 'table_name', 'hand_no', 'board', 'pot', 'hero_cards', 'result', 'created_at']);
      } else if (kind === 'tournaments') {
        const rows = db.prepare('SELECT id, name, format, buyin, fee, gtd, entrants, max_players, status, start_at FROM tournaments ORDER BY id').all();
        csv = toCsv(rows, ['id', 'name', 'format', 'buyin', 'fee', 'gtd', 'entrants', 'max_players', 'status', 'start_at']);
      } else {
        return json(res, 400, { error: 'unknown export' });
      }
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="dangro-${kind}.csv"` });
      return res.end('\uFEFF' + csv);
    }

    if (p === '/api/admin/stats') {
      const a = requireAdmin(req, res); if (!a) return;
      const users = db.prepare('SELECT COUNT(*) c FROM users WHERE deleted_at IS NULL').get().c;
      const hands = db.prepare('SELECT COUNT(*) c FROM hands').get().c;
      const tables = db.prepare('SELECT COUNT(*) c FROM tables').get().c;
      const tourneys = db.prepare('SELECT COUNT(*) c FROM tournaments').get().c;
      const turnover = db.prepare(`SELECT COALESCE(SUM(ABS(amount)),0) s FROM transactions`).get().s;
      const live = [...LIVE_TABLES.values()].map((e) => ({ id: e.table.cfg.id, name: e.table.cfg.name, players: e.table.occupiedSeats().length, hand: e.table.handNo, street: e.table.street }));
      return json(res, 200, { users, hands, tables, tourneys, turnover, live, online: sitesStats().online, jackpot: getSetting('jackpot'), mint_bot: getSetting('mint_bot_total', 0), mint_spin: getSetting('mint_spin_total', 0) });
    }

    if (p.startsWith('/api/admin/hands/') && req.method === 'GET') {
      const a = requireAdmin(req, res); if (!a) return;
      const handId = decodeURIComponent(p.split('/')[4]);
      const row = db.prepare('SELECT * FROM hands WHERE hand_id = ? ORDER BY id DESC LIMIT 1').get(handId);
      if (!row) return json(res, 404, { error: 'Hand not found' });
      let players = []; let result = {};
      try { players = JSON.parse(row.players || '[]'); } catch { /* ignore */ }
      try { result = JSON.parse(row.result || '{}'); } catch { /* ignore */ }
      return json(res, 200, { hand: { ...row, players, result } });
    }

    if (p === '/api/admin/reports' && req.method === 'GET') {
      const a = requireAdmin(req, res); if (!a) return;
      const rows = db.prepare(`SELECT r.*, ur.nick AS reporter_nick, ut.nick AS target_nick
        FROM reports r JOIN users ur ON ur.id = r.reporter_id JOIN users ut ON ut.id = r.target_id
        ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END, r.id DESC LIMIT 200`).all();
      return json(res, 200, { reports: rows });
    }
    if (p.startsWith('/api/admin/reports/') && req.method === 'POST') {
      const a = requireAdmin(req, res); if (!a) return;
      const id = Number(p.split('/')[4]);
      const b = await readBody(req);
      const status = b.action === 'resolve' ? 'resolved' : b.action === 'dismiss' ? 'dismissed' : null;
      if (!status) return json(res, 400, { error: 'Unknown action' });
      db.prepare("UPDATE reports SET status = ?, resolved_at = datetime('now') WHERE id = ?").run(status, id);
      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(a.login, 'report_' + status, `report ${id}`);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/admin/users') {
      const a = requireAdmin(req, res); if (!a) return;
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const rows = db.prepare('SELECT * FROM users WHERE deleted_at IS NULL ORDER BY id').all()
        .filter((u) => !q || u.login.toLowerCase().includes(q) || u.nick.toLowerCase().includes(q));
      return json(res, 200, { users: rows.map(publicUser) });
    }

    if (p.startsWith('/api/admin/users/') && req.method === 'POST') {
      const a = requireAdmin(req, res); if (!a) return;
      const id = Number(p.split('/')[4]);
      const body = await readBody(req);
      const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      if (!target) return json(res, 404, { error: 'not found' });
      if (body.action === 'credit') {
        const amount = toInt(body.amount, { min: -1e12, max: 1e12 });
        if (amount === null || amount === 0) return json(res, 400, { error: 'Enter a whole, non-zero amount' });
        if (target.balance + amount < 0) return json(res, 400, { error: 'Debit exceeds the balance' });
        // The client may supply an idempotency key; without one the credit is simply applied once.
        const reference = body.reference ? `admin:credit:${body.reference}` : null;
        if (reference) {
          const existing = transactionByReference(id, reference);
          if (existing) {
            if (existing.amount !== amount) return json(res, 409, { error: 'Idempotency key reused with a different amount' });
            const current = db.prepare('SELECT balance FROM users WHERE id = ?').get(id)?.balance;
            return json(res, 200, { ok: true, balance: current, replayed: true });
          }
        }
        const award = addTransactionEx(id, 'admin', amount, `Admin credit by ${a.login}`, 'USD', reference ? { reference, onDuplicate: 'skip' } : {});
        db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(a.login, 'credit', `user ${id} ${body.amount}`);
        return json(res, 200, { ok: true, balance: award.balance, replayed: !award.applied });
      }
      if (body.action === 'set') {
        const currency = { balance: 'USD', play_chips: 'PLAY', tickets: 'TICKET', gems: 'GEM' };
        for (const [field, cur] of Object.entries(currency)) {
          if (body[field] == null) continue;
          const next = toInt(body[field], { min: 0, max: 1e13 });
          if (next === null) return json(res, 400, { error: `Invalid value for ${field}` });
          const delta = next - Number(target[field] || 0);
          if (delta !== 0) addTransaction(id, 'admin_set', delta, `Admin set ${field} by ${a.login}`, cur);
        }
        for (const field of ['xp', 'vip_level', 'vip_points']) {
          if (body[field] == null) continue;
          const next = toInt(body[field], { min: 0, max: 1e12 });
          if (next === null) return json(res, 400, { error: `Invalid value for ${field}` });
          db.prepare(`UPDATE users SET ${field} = ? WHERE id = ?`).run(next, id);
        }
        db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(a.login, 'set', `user ${id} ${JSON.stringify(body)}`);
        return json(res, 200, { ok: true });
      }
      if (body.action === 'mute' || body.action === 'unmute') {
        db.prepare('UPDATE users SET chat_muted = ? WHERE id = ?').run(body.action === 'mute' ? 1 : 0, id);
        db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(a.login, body.action, `user ${id}`);
        return json(res, 200, { ok: true });
      }
      if (body.action === 'ban' || body.action === 'unban') {
        if (body.action === 'ban' && target.id === a.id) return json(res, 400, { error: 'You cannot ban yourself' });
        db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(body.action === 'ban' ? 1 : 0, id);
        if (body.action === 'ban') {
          db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
          removeFromLiveTables(id, 'Account locked');
        }
        db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(a.login, body.action, `user ${id}`);
        return json(res, 200, { ok: true });
      }
      if (body.action === 'resetpw') {
        if (String(body.password || '').length < 6) return json(res, 400, { error: 'Password must be at least 6 characters' });
        db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(String(body.password)), id);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
        db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(a.login, 'resetpw', `user ${id}`);
        return json(res, 200, { ok: true });
      }
      if (body.action === 'delete' && !target.is_admin) {
        for (const entry of LIVE_TABLES.values()) {
          if (entry.table.seatOf(id)) cashOutSeat(entry.table, id, 'Account deleted by admin');
        }
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
        db.prepare('DELETE FROM tourney_regs WHERE user_id = ?').run(id);
        db.prepare('DELETE FROM friends WHERE user_id = ? OR friend_id = ?').run(id, id);
        db.prepare(`UPDATE users SET banned = 1, deleted_at = datetime('now'),
          login = ?, nick = ?, email = '' WHERE id = ?`).run(`deleted:${id}:${target.login}`, `Deleted ${id}`, id);
        for (const client of wss.clients) {
          if (client.userId === id) {
            try { client.close(4001, 'account deleted'); } catch { /* ignore */ }
          }
        }
        db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(a.login, 'delete_user', `user ${id}`);
        return json(res, 200, { ok: true, deleted: true });
      }
      return json(res, 400, { error: 'unknown action' });
    }

    if (p === '/api/admin/tables' && req.method === 'POST') {
      const a = requireAdmin(req, res); if (!a) return;
      const b = await readBody(req);
      if (b.delete) {
        db.prepare('DELETE FROM tables WHERE id = ?').run(b.id);
        return json(res, 200, { ok: true });
      }
      const parsed = parseTableConfig(b);
      if (!parsed.ok) return json(res, 400, { error: parsed.error });
      const t = parsed.value;
      const id = String(b.id || `custom-${Date.now()}`).slice(0, 60);
      db.prepare(`INSERT INTO tables (id,name,game,category,sb,bb,ante,min_buyin,max_buyin,seats,speed,featured,enabled,sort)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, game=excluded.game, category=excluded.category,
        sb=excluded.sb, bb=excluded.bb, ante=excluded.ante, min_buyin=excluded.min_buyin, max_buyin=excluded.max_buyin,
        seats=excluded.seats, speed=excluded.speed, featured=excluded.featured, enabled=excluded.enabled`)
        .run(id, t.name, t.game, t.category, t.sb, t.bb, t.ante, t.min_buyin, t.max_buyin, t.seats, t.speed, t.featured, t.enabled, t.sort);
      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(a.login, 'save_table', id);
      return json(res, 200, { ok: true, id });
    }

    if (p === '/api/admin/tables') {
      const a = requireAdmin(req, res); if (!a) return;
      return json(res, 200, { tables: db.prepare('SELECT * FROM tables ORDER BY sort').all() });
    }

    if (p === '/api/admin/tournaments' && req.method === 'POST') {
      const a = requireAdmin(req, res); if (!a) return;
      const b = await readBody(req);
      if (b.delete) {
        disposeTournamentRoom(b.id, { force: true });
        db.prepare('DELETE FROM tournaments WHERE id = ?').run(b.id);
        return json(res, 200, { ok: true });
      }
      const id = b.id || `t${Date.now()}`;
      db.prepare(`INSERT INTO tournaments (id,name,game,buyin,fee,gtd,start_at,status,max_players,entrants,starting_stack,blind_speed,late_reg,format,mode,bounty,ticket,enabled)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, game=excluded.game, buyin=excluded.buyin, fee=excluded.fee, gtd=excluded.gtd,
        start_at=excluded.start_at, status=excluded.status, max_players=excluded.max_players, entrants=excluded.entrants,
        starting_stack=excluded.starting_stack, blind_speed=excluded.blind_speed, late_reg=excluded.late_reg,
        format=excluded.format, mode=excluded.mode, bounty=excluded.bounty, ticket=excluded.ticket, enabled=excluded.enabled`)
        .run(id, b.name || 'New Tournament', b.game || 'holdem', Number(b.buyin) || 0, Number(b.fee) || 0,
          Number(b.gtd) || 0, b.start_at || new Date().toISOString(), b.status || 'registering',
          Number(b.max_players) || 1000, Number(b.entrants) || 0, Number(b.starting_stack) || 10000,
          Number(b.blind_speed) || 8, Number(b.late_reg) || 90, b.format || 'NLH', b.mode || 'STANDARD',
          Number(b.bounty) || 0, b.ticket || '', b.enabled === false ? 0 : 1);
      return json(res, 200, { ok: true, id });
    }

    if (p === '/api/admin/tournaments') {
      const a = requireAdmin(req, res); if (!a) return;
      return json(res, 200, { tournaments: db.prepare('SELECT * FROM tournaments ORDER BY start_at').all() });
    }

    if (p === '/api/admin/banners' && req.method === 'POST') {
      const a = requireAdmin(req, res); if (!a) return;
      const b = await readBody(req);
      if (b.delete) { db.prepare('DELETE FROM banners WHERE id = ?').run(b.id); return json(res, 200, { ok: true }); }
      if (b.id) {
        db.prepare('UPDATE banners SET slot=?,title=?,subtitle=?,image=?,link=?,enabled=?,sort=? WHERE id=?')
          .run(b.slot || 'home', b.title || '', b.subtitle || '', b.image || '', b.link || '', b.enabled === false ? 0 : 1, Number(b.sort) || 0, b.id);
      } else {
        db.prepare('INSERT INTO banners (slot,title,subtitle,image,link,enabled,sort) VALUES (?,?,?,?,?,?,?)')
          .run(b.slot || 'home', b.title || '', b.subtitle || '', b.image || '', b.link || '', b.enabled === false ? 0 : 1, Number(b.sort) || 0);
      }
      return json(res, 200, { ok: true });
    }

    if (p === '/api/admin/banners') {
      const a = requireAdmin(req, res); if (!a) return;
      return json(res, 200, { banners: db.prepare('SELECT * FROM banners ORDER BY slot, sort').all() });
    }

    if (p === '/api/admin/missions' && req.method === 'POST') {
      const a = requireAdmin(req, res); if (!a) return;
      const b = await readBody(req);
      if (b.delete) { db.prepare('DELETE FROM missions WHERE id = ?').run(b.id); return json(res, 200, { ok: true }); }
      if (b.reset) {
        db.prepare("DELETE FROM player_claims WHERE kind = 'mission' AND period_key LIKE ?").run(`mission:${b.id}:%`);
        return json(res, 200, { ok: true });
      }
      db.prepare(`INSERT INTO missions (id,title,description,goal,reward,reward_kind,active,sort)
        VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, goal=excluded.goal,
        reward=excluded.reward, reward_kind=excluded.reward_kind, active=excluded.active, sort=excluded.sort`)
        .run(b.id || `m${Date.now()}`, b.title || 'Mission', b.description || '', Number(b.goal) || 1,
          Number(b.reward) || 100, b.reward_kind || 'USD', b.active === false ? 0 : 1, Number(b.sort) || 0);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/admin/missions') {
      const a = requireAdmin(req, res); if (!a) return;
      const defs = db.prepare('SELECT * FROM missions ORDER BY sort').all();
      return json(res, 200, { missions: defs.map((m) => ({
        ...m,
        progress: db.prepare("SELECT COUNT(*) c FROM player_claims WHERE kind = 'mission' AND period_key LIKE ? AND claimed = 1").get(`mission:${m.id}:%`).c,
        claimed: db.prepare("SELECT COUNT(*) c FROM player_claims WHERE kind = 'mission' AND period_key LIKE ? AND claimed = 1").get(`mission:${m.id}:%`).c > 0,
      })) });
    }

    if (p.startsWith('/api/admin/live/') && p.endsWith('/close') && req.method === 'POST') {
      const a = requireAdmin(req, res); if (!a) return;
      const id = p.split('/')[4];
      const entry = LIVE_TABLES.get(id);
      if (!entry) return json(res, 404, { error: 'not running' });
      closeLiveTable(id, 'Table closed by admin');
      if (entry.table.cfg.tournamentId) CUSTOM_CFG.delete(id);
      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(a.login, 'close_table', id);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/admin/settings' && req.method === 'POST') {
      const a = requireAdmin(req, res); if (!a) return;
      const b = await readBody(req);
      for (const [k, v] of Object.entries(b || {})) setSetting(k, v);
      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(a.login, 'settings', JSON.stringify(b));
      return json(res, 200, { ok: true });
    }

    if (p === '/api/admin/settings') {
      const a = requireAdmin(req, res); if (!a) return;
      const rows = db.prepare('SELECT * FROM settings').all();
      const out = {};
      for (const r of rows) { try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; } }
      return json(res, 200, { settings: out });
    }

    if (p === '/api/admin/audit') {
      const a = requireAdmin(req, res); if (!a) return;
      return json(res, 200, { log: db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200').all() });
    }

    if (p === '/api/admin/transactions') {
      const a = requireAdmin(req, res); if (!a) return;
      const rows = db.prepare(`SELECT t.*, u.login, u.nick FROM transactions t LEFT JOIN users u ON u.id=t.user_id ORDER BY t.id DESC LIMIT 300`).all();
      return json(res, 200, { transactions: rows });
    }

    if (p === '/api/admin/chat' && req.method === 'POST') {
      const a = requireAdmin(req, res); if (!a) return;
      const b = await readBody(req);
      const announcement = String(b.message || '').slice(0, 500);
      if (!announcement.trim()) return json(res, 400, { error: 'empty' });
      db.prepare('INSERT INTO chat_messages (user_id,nick,channel,message) VALUES (?,?,?,?)').run(a.id, a.nick, String(b.channel || 'lobby').slice(0, 30), announcement);
      return json(res, 200, { ok: true });
    }

    /* ---------------- static ---------------- */
    if (p.startsWith('/api/')) return json(res, 404, { error: 'not found' });

    const isFile = (candidate) => !!candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile();
    let file = null;
    if (p.startsWith('/assets/')) {
      for (const base of [path.join(PUBLIC, 'assets'), path.join(DIST, 'assets')]) {
        const cand = resolveInside(base, p.slice('/assets/'.length));
        if (isFile(cand)) { file = cand; break; }
      }
    } else if (fs.existsSync(DIST)) {
      const cand = resolveInside(DIST, p === '/' ? 'index.html' : p.slice(1));
      if (isFile(cand)) file = cand;
      else if (!path.extname(p)) file = path.join(DIST, 'index.html');
    }
    if (!file && fs.existsSync(path.join(PUBLIC, 'index.html'))) file = path.join(PUBLIC, 'index.html');
    if (file && fs.existsSync(file)) return serveFile(res, file);
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    if (err && err.status) return json(res, err.status, { error: err.message });
    console.error('api error', p, err);
    json(res, 500, { error: 'internal error' });
  }
});

/* ------------------------------------------------------------------ */
/* WebSocket                                                           */
/* ------------------------------------------------------------------ */

const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 16 * 1024,
  verifyClient: (info, cb) => {
    if (originAllowed(info.req)) cb(true);
    else cb(false, 403, 'Forbidden');
  },
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  const user = userByToken(token);
  if (user && user.banned) { ws.close(4003, 'account locked'); return; }
  ws.userId = user ? user.id : null;
  ws.nick = user ? user.nick : 'Guest';
  ws.tables = new Set();

  ws.send(JSON.stringify({ type: 'hello', userId: ws.userId, nick: ws.nick }));

  ws.on('message', (raw) => {
    try {
      handleWsMessage(ws, raw);
    } catch (e) { console.error('ws handler', e); }
  });

  function handleWsMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (ws.userId) {
      const active = db.prepare('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL AND banned = 0').get(ws.userId);
      if (!active) {
        try { ws.close(4001, 'account unavailable'); } catch { /* ignore */ }
        return;
      }
    }
    if (msg.type === 'join_table') {
      const table = getLiveTable(msg.tableId);
      if (!table) return ws.send(JSON.stringify({ type: 'error', error: 'table not found' }));
      const entry = LIVE_TABLES.get(msg.tableId);
      // ensure there is a seat for the human
      const u = db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL AND banned = 0').get(ws.userId);
      if (!u) return ws.send(JSON.stringify({ type: 'error', error: 'login required' }));
      if (msg.observe) {
        // Watching is read-only: never seed bots, start a hand or take a seat.
        entry.clients.add(ws);
        ws.tables.add(msg.tableId);
        ws.send(JSON.stringify({ type: 'joined', tableId: msg.tableId, seat: null, observe: true }));
        chatService.sendHistory(ws, msg.tableId);
        broadcastState(table);
        return;
      }
      const seated = table.seatOf(u.id);
      if (seated) {
        // Reconnect (or a second window): the seat and stack are still here.
        seated.player.disconnected = false;
        seated.player.disconnectedAt = 0;
        if (seated.player.away) {
          // Seated in absence at the tournament start: opening the table sits them back in.
          seated.player.away = false;
          seated.player.missedTurns = 0;
          table.requestSitOut(u.id, false);
        }
      } else {
        if (table.tournament) {
          // Tournament seats are only handed out by /play, which checks the registration.
          // A flight can move a player between tables; a stale link follows them.
          const room = TOURNAMENT_ROOMS.get(table.cfg.tournamentId);
          const actual = room?.tableOf(u.id);
          if (actual && actual.cfg.id !== msg.tableId) {
            const stack = actual.seatOf(u.id)?.player?.stack || 0;
            return ws.send(JSON.stringify({
              type: 'table_move', tableId: actual.cfg.id, from: msg.tableId,
              reason: 'redirect', index: room.flightIndexOf(actual.cfg.id), stack,
            }));
          }
          entry.clients.add(ws);
          ws.tables.add(msg.tableId);
          ws.send(JSON.stringify({ type: 'joined', tableId: msg.tableId, seat: null, observe: true }));
          chatService.sendHistory(ws, msg.tableId);
          broadcastState(table);
          return;
        }
        if (getSetting('maintenance', false) && !u.is_admin) {
          return ws.send(JSON.stringify({ type: 'error', error: 'Tables are closed for maintenance' }));
        }
        const held = heldSeatFor(msg.tableId, u.id);
        const hasRoom = held || table.occupiedSeats().some((s) => s.player.isBot) || table.freeSeatFor(u.id);
        if (!hasRoom) {
          const queued = waitlistJoin(msg.tableId, u.id);
          if (queued.status !== 'queued') {
            const error = queued.status === 'full' ? 'The waiting list is full' : 'You are on too many waiting lists';
            return ws.send(JSON.stringify({ type: 'error', error }));
          }
          entry.clients.add(ws);
          ws.tables.add(msg.tableId);
          ws.send(JSON.stringify({ type: 'joined', tableId: msg.tableId, seat: null, observe: true, waitlist: queued.position }));
          chatService.sendHistory(ws, msg.tableId);
          ws.send(JSON.stringify({ type: 'waitlist', position: queued.position, tableId: msg.tableId }));
          broadcastState(table);
          return;
        }
        const buyin = toInt(msg.buyin) || table.cfg.min_buyin;
        let res = seatHuman(table, u, buyin, held ? held.seat : msg.seat);
        if (!res.ok && msg.seat != null && !held) res = seatHuman(table, u, buyin, null);
        if (!res.ok) return ws.send(JSON.stringify({ type: 'error', error: res.error }));
        // Taking the held seat consumes the offer; any other seat just leaves the queue.
        if (held) setWaitlist(held.state);
        waitlistLeave(msg.tableId, u.id);
      }
      // fill part of the table with bots, always leaving the choice of seats to humans
      const botsNeeded = Math.max(0, table.cfg.seats - table.occupiedSeats().length);
      if (!table.tournament) table.fillBots(Math.min(botsNeeded, Math.max(3, Math.ceil(table.cfg.seats / 2))));
      entry.clients.add(ws);
      ws.tables.add(msg.tableId);
      table.maybeStart();
      ws.send(JSON.stringify({ type: 'joined', tableId: msg.tableId, seat: table.seatOf(u.id)?.index ?? null }));
      chatService.sendHistory(ws, msg.tableId);
      broadcastState(table);
      return;
    }
    if (msg.type === 'option') {
      const entry = LIVE_TABLES.get(msg.tableId);
      if (!entry) return;
      // Table options belong to the players at the table, not to watchers.
      if (!entry.table.seatOf(ws.userId)) {
        return ws.send(JSON.stringify({ type: 'error', error: 'Take a seat to change table options' }));
      }
      if (msg.straddle != null) {
        const res = entry.table.setStraddle(!!msg.straddle);
        if (!res.ok) ws.send(JSON.stringify({ type: 'error', error: res.error }));
      }
      if (msg.autoMuck != null) entry.table.setAutoMuck(ws.userId, !!msg.autoMuck);
      if (msg.insurance != null) {
        const res = entry.table.setInsurance(ws.userId, !!msg.insurance);
        if (!res.ok) ws.send(JSON.stringify({ type: 'error', error: res.error }));
      }
      if (msg.runItTwice != null) {
        const res = entry.table.setRunItTwice(!!msg.runItTwice);
        if (!res.ok) ws.send(JSON.stringify({ type: 'error', error: res.error }));
      }
      broadcastState(entry.table);
      return;
    }
    if (msg.type === 'leave_table') {
      const entry = LIVE_TABLES.get(msg.tableId);
      if (entry) {
        entry.clients.delete(ws);
        ws.tables.delete(msg.tableId);
        const table = entry.table;
        const hadSeat = !!table.seatOf(ws.userId);
        // Another window of the same player may still be showing this table.
        if (hadSeat && !hasLiveSocket(entry, ws.userId)) {
          cashOutSeat(table, ws.userId, `Cash-out ${table.cfg.name}`);
          notifyWaitlist(msg.tableId);
        } else if (!hadSeat) {
          waitlistLeave(msg.tableId, ws.userId);
        }
        broadcastState(table);
      }
      return;
    }
    if (msg.type === 'timebank') {
      const entry = LIVE_TABLES.get(msg.tableId);
      if (!entry) return;
      const res = entry.table.useTimeBank(ws.userId, msg.seconds);
      if (!res.ok) ws.send(JSON.stringify({ type: 'error', error: res.error }));
      else broadcastState(entry.table);
      return;
    }
    if (msg.type === 'action') {
      const entry = LIVE_TABLES.get(msg.tableId);
      if (!entry) return;
      const table = entry.table;
      const res = table.act(ws.userId, msg.action, msg.amount);
      if (!res.ok) ws.send(JSON.stringify({ type: 'error', error: res.error }));
      return;
    }
    if (msg.type === 'rebuy') {
      const entry = LIVE_TABLES.get(msg.tableId);
      if (!entry) return;
      const table = entry.table;
      const seat = table.seatOf(ws.userId);
      if (!seat) return ws.send(JSON.stringify({ type: 'error', error: 'not seated' }));
      if (table.tournament || table.spin) return ws.send(JSON.stringify({ type: 'error', error: 'Rebuys are not available here' }));
      const inLiveHand = table.handInProgress() && seat.player.inHand && !seat.player.folded;
      if (inLiveHand) return ws.send(JSON.stringify({ type: 'error', error: 'Finish the hand first' }));
      const amount = toInt(msg.amount, { min: 1 });
      const stackAfter = seat.player.stack + (amount || 0);
      if (amount === null || stackAfter < table.cfg.min_buyin || stackAfter > table.cfg.max_buyin) {
        return ws.send(JSON.stringify({ type: 'error', error: 'Top-up must bring your stack within the table buy-in limits' }));
      }
      const u = db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL AND banned = 0').get(ws.userId);
      if (!u || u.balance < amount) return ws.send(JSON.stringify({ type: 'error', error: 'not enough balance' }));
      if (!seat.player.sessionId) seat.player.sessionId = `${table.cfg.id}:${randomUUID()}`;
      const sessionId = seat.player.sessionId;
      const rebuyNo = (seat.player.rebuyCount || 0) + 1;
      const award = addTransactionEx(u.id, 'rebuy', -amount, `Rebuy ${table.cfg.name}`, 'USD', {
        sessionId, reference: `in:${sessionId}:r${rebuyNo}`, onDuplicate: 'skip',
      });
      if (!award.applied) return ws.send(JSON.stringify({ type: 'error', error: 'Rebuy already applied' }));
      seat.player.rebuyCount = rebuyNo;
      seat.player.stack += amount;
      // Reloading clears the bust prompt; the deal can resume sooner.
      table.clearRebuyHold(ws.userId);
      broadcastState(table);
      return;
    }
    if (msg.type === 'sit_out') {
      const entry = LIVE_TABLES.get(msg.tableId);
      if (!entry) return;
      const seat = entry.table.seatOf(ws.userId);
      if (!seat) return ws.send(JSON.stringify({ type: 'error', error: 'Take a seat first' }));
      if (!msg.value) seat.player.missedTurns = 0;
      const res = entry.table.requestSitOut(ws.userId, !!msg.value);
      if (!res.ok) return ws.send(JSON.stringify({ type: 'error', error: res.error }));
      broadcastState(entry.table);
      return;
    }
    if (msg.type === 'shuffle') {
      const entry = LIVE_TABLES.get(msg.tableId);
      if (!entry) return;
      const seat = entry.table.seatOf(ws.userId);
      if (!seat) return ws.send(JSON.stringify({ type: 'error', error: 'Take a seat first' }));
      const now = Date.now();
      if (now - (entry.lastShuffleAt || 0) < 3000) return;
      entry.lastShuffleAt = now;
      entry.table.emit({ type: 'chip_shuffle', seat: seat.index, playerId: ws.userId, nick: seat.player.nick });
      return;
    }
    if (msg.type === 'show_cards') {
      const entry = LIVE_TABLES.get(msg.tableId);
      if (!entry) return;
      const res = entry.table.showCards(ws.userId, msg.cards);
      if (!res.ok) return ws.send(JSON.stringify({ type: 'error', error: res.error }));
      return;
    }
    if (msg.type === 'rabbit') {
      const entry = LIVE_TABLES.get(msg.tableId);
      if (!entry) return;
      const t = entry.table;
      // Revealing the undealt board is a player action, not a spectator one.
      if (!t.seatOf(ws.userId)) return;
      if (t.street === 'ended' && t.board.length < 5) {
        const deck = [...t.deck];
        const cards = [];
        while (cards.length < 5 - t.board.length && deck.length) cards.push(cardStr(deck.pop()));
        const evt = { type: 'rabbit', cards, at: Date.now() };
        for (const client of entry.clients) if (client.readyState === 1) client.send(JSON.stringify({ type: 'event', event: evt }));
      }
      return;
    }
    if (msg.type === 'chat' || msg.type === 'reaction' || msg.type === 'emote') {
      return chatService.handleFrame(ws, msg);
    }
    if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong', t: Date.now() }));
  }

  ws.on('close', () => {
    for (const id of ws.tables) {
      const entry = LIVE_TABLES.get(id);
      if (!entry) continue;
      entry.clients.delete(ws);
      const table = entry.table;
      const seat = table.seatOf(ws.userId);
      if (seat) {
        // Hold the seat: a dropped connection is not a decision to leave. sweepDisconnected()
        // cashes the player out if they have not come back within the grace period.
        if (!hasLiveSocket(entry, ws.userId)) {
          seat.player.disconnected = true;
          seat.player.disconnectedAt = Date.now();
        }
      } else {
        waitlistLeave(id, ws.userId);
      }
      broadcastState(table);
    }
  });
});

setInterval(flushRushQueue, 900).unref();

// Scheduled tournaments move out of registration on their own start time and
// open their room, so every flight shares one blind clock from that moment.
setInterval(() => {
  try {
    const rows = db.prepare("SELECT * FROM tournaments WHERE status = 'registering' AND enabled = 1").all();
    for (const t of rows) {
      const start = Date.parse(t.start_at);
      if (Number.isFinite(start) && start <= Date.now() && Number(t.entrants) >= 2) startTournament(t);
    }
    // A finished event whose tables are all gone no longer needs its room.
    for (const [id, room] of TOURNAMENT_ROOMS) {
      if (room.winner && !room.flights.length) TOURNAMENT_ROOMS.delete(id);
    }
  } catch (err) { console.error('tournament scheduler', err); }
}, TOURNAMENT_SCHEDULER_MS).unref();

// Multi-table tournaments rebalance and break short tables between hands.
setInterval(() => {
  for (const room of TOURNAMENT_ROOMS.values()) {
    try { room.sweep(); } catch (err) { console.error('tournament sweep', err); }
  }
}, 2000).unref();

function identityTaken(name, exceptUserId = 0) {
  return !!db.prepare('SELECT 1 FROM users WHERE (lower(login) = lower(?) OR lower(nick) = lower(?)) AND id != ?').get(name, name, exceptUserId);
}

function parseBet(value) {
  return Math.max(MIN_BET, Math.min(MAX_BET, toInt(value) ?? 100));
}

function removeFromLiveTables(userId, reason) {
  for (const entry of LIVE_TABLES.values()) {
    if (entry.table.seatOf(userId)) cashOutSeat(entry.table, userId, reason);
  }
  for (const client of wss.clients) if (client.userId === userId) client.close(4003, reason);
}

// A normal quit must settle every seat at its real stack; only a hard crash falls back to
// the buy-in refund performed by refundOpenSessions() on the next start.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    for (const id of [...LIVE_TABLES.keys()]) closeLiveTable(id, 'Client closed');
  } catch (e) {
    console.error('shutdown cash-out failed', e);
  }
  console.log(`SHUTDOWN ${signal}`);
  for (const client of wss.clients) client.terminate();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const refunded = refundOpenSessions();
if (refunded) console.log(`refunded ${refunded} open table session(s)`);
server.listen(PORT, process.env.GGPOKER_BIND || '127.0.0.1', () => {
  const port = server.address().port;
  console.log(`LISTENING ${port}`);
  console.log(`GGPoker clone server: http://127.0.0.1:${port}`);
});
