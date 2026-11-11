import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomInt } from 'node:crypto';
import { WebSocketServer } from 'ws';
import {
  db, DATA_DIR, hashPassword, checkPassword, addTransaction, addTransactionEx, newSession, userByToken,
  publicUser, getSetting, setSetting, refundOpenSessions, getClaim, claimReward, bumpMission, setMissionDone,
} from './db.js';
import { PokerTable, botName } from './table.js';
import { makeDeck, shuffle, cardStr } from './poker.js';
import {
  isLocalHost, isLocalOrigin, resolveInside, SECURITY_HEADERS, HTML_CSP, createRateLimiter,
} from './security.js';
import { toInt, cleanNick, parseTableConfig } from './validate.js';
import { handForViewer } from './hand-history.js';
import { spinSlots } from './slots.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5198);
const APP_DIR = path.join(__dirname, '..');
const DIST = path.join(APP_DIR, 'dist');
const PUBLIC = path.join(APP_DIR, 'public');

// How long a seat is held for a player whose connection dropped before they are cashed out.
const DISCONNECT_GRACE_MS = Number(process.env.GGPOKER_DISCONNECT_GRACE_MS || 60_000);
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
};

function serveFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  const stat = fs.statSync(file);
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    ...(ext === '.html' ? { 'content-security-policy': HTML_CSP } : {}),
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
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
    const wait = players >= t.seats ? 1 + (h % 3) : 0;
    TABLE_OCCUPANCY.set(t.id, { players, wait });
  }
  return TABLE_OCCUPANCY.get(t.id);
}

function lobbyTables() {
  const rows = db.prepare('SELECT * FROM tables WHERE enabled = 1 ORDER BY sort ASC').all();
  return rows.map((t) => {
    const occ = occupancyFor(t);
    const seed = [...t.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    const players = occ.players;
    const avgPot = Math.round((t.bb * (8 + (seed % 60))) / 10) * 10;
    return {
      id: t.id, name: t.name, game: t.game, category: t.category,
      sb: t.sb, bb: t.bb, ante: t.ante, min_buyin: t.min_buyin, max_buyin: t.max_buyin,
      seats: t.seats, speed: t.speed, featured: !!t.featured,
      players, wait: occ.wait,
      avgPot: players ? avgPot : 0,
      vpip: players ? 18 + (seed % 45) : 0,
      handsPerHour: 55 + (seed % 80),
      running: LIVE_TABLES.has(t.id),
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
const WAITLISTS = new Map(); // tableId -> [{ userId, nick, since }]
const BJ_HANDS = new Map(); // userId -> { deck, player, dealer, bet }

function waitlistJoin(tableId, userId, nick) {
  const list = WAITLISTS.get(tableId) || [];
  const existing = list.find((w) => w.userId === userId);
  if (existing) return list.indexOf(existing) + 1;
  list.push({ userId, nick, since: Date.now() });
  WAITLISTS.set(tableId, list);
  return list.length;
}
function waitlistLeave(tableId, userId) {
  const list = WAITLISTS.get(tableId);
  if (!list) return;
  const next = list.filter((w) => w.userId !== userId);
  if (next.length) WAITLISTS.set(tableId, next); else WAITLISTS.delete(tableId);
}
function notifyWaitlist(tableId) {
  const list = WAITLISTS.get(tableId);
  if (!list || !list.length) return;
  const first = list[0];
  for (const client of wss.clients) {
    if (client.readyState !== 1 || client.userId !== first.userId) continue;
    client.send(JSON.stringify({ type: 'event', event: { type: 'waitlist_ready', tableId, position: 1 } }));
  }
}

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
        db.prepare(`INSERT INTO hands (hand_no,table_id,table_name,game,players,board,pot,result,hero_cards,actions)
          VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
          h.handNo, h.tableId, h.tableName, h.game, JSON.stringify(h.players),
          h.board.join(' '), h.pot, JSON.stringify(h.result), h.heroCards || '', JSON.stringify(h.actions || [])
        );
      } catch (e) { console.error('hand save', e); }
    },
    onTournamentPayout: (table, p) => {
      try {
        const u = db.prepare('SELECT * FROM users WHERE id = ?').get(p.id);
        if (u) addTransaction(u.id, 'tourney_payout', p.payout, `${table.cfg.name} — finished ${p.place}${p.place === 2 ? 'nd' : 'rd'}`);
        table.emit({ type: 'tourney_payout', ...p });
      } catch (e) { console.error('tourney payout', e); }
    },
    onTournamentBust: (table, p) => {
      try { consumeTournamentEntry(table, p.id); } catch (e) { console.error('tourney bust', e); }
    },
    onTournamentEnd: (table, winner) => {
      try {
        const tid = table.cfg.tournamentId;
        if (tid) {
          db.prepare("UPDATE tournaments SET status = 'completed' WHERE id = ?").run(tid);
          db.prepare('DELETE FROM tourney_regs WHERE tournament_id = ?').run(tid);
        }
        const u = db.prepare('SELECT * FROM users WHERE id = ?').get(winner.id);
        if (u) addTransaction(u.id, 'tourney_win', winner.prize, `Tournament win: ${table.cfg.name}`);
        db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run('system', 'tournament_end', `${table.cfg.name} winner ${winner.nick} ${winner.prize}`);
      } catch (e) { console.error('tournament end', e); }
    },
    onHandComplete: ({ table, winner, summary }) => {
      rewardHandPlayed(table, summary);
      // mission progress for humans who were dealt in
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
          closeLiveTable(id, 'Table idle close');
        }
      } else {
        entry.emptySince = null;
      }
    } catch (e) { console.error('tick', e); }
  }, 260);
  LIVE_TABLES.set(id, entry);
  return table;
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
  if (!makeRoomForHuman(table, wantedSeat)) return { ok: false, error: 'table full' };
  const sessionId = `${table.cfg.id}:${randomUUID()}`;
  addTransactionEx(user.id, 'buyin', -stack, `Buy-in ${table.cfg.name}`, 'USD', {
    sessionId, reference: `in:${sessionId}:1`, onDuplicate: 'skip',
  });
  const res = table.sit({ id: user.id, nick: user.nick, avatar: user.avatar }, wantedSeat, stack);
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

// Bots only fill empty chairs: a human always takes priority over one.
function makeRoomForHuman(table, wantedSeat) {
  const target = wantedSeat != null ? table.seats[wantedSeat] : null;
  if (target && !target.player) return true;
  if (target && target.player && !target.player.isBot) return table.seats.some((s) => !s.player) || evictBot(table);
  if (target && target.player && target.player.isBot) { table.stand(target.player.id); return true; }
  if (table.seats.some((s) => !s.player)) return true;
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
  if (sessionId) {
    addTransactionEx(userId, stack > 0 ? 'cashout' : 'session_close', stack, reason, 'USD', {
      sessionId, reference: `out:${sessionId}`, onDuplicate: 'skip',
    });
  } else if (stack > 0) {
    addTransaction(userId, 'cashout', stack, reason);
  }
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

// Cash out players whose connection has been gone longer than the grace period.
function sweepDisconnected(entry) {
  const table = entry.table;
  const now = Date.now();
  for (const p of table.humans()) {
    if (!p.disconnectedAt) continue;
    if (hasLiveSocket(entry, p.id)) { p.disconnectedAt = 0; p.disconnected = false; continue; }
    if (now - p.disconnectedAt < DISCONNECT_GRACE_MS) continue;
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
  if (!isLocalHost(req.headers.host)) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    return res.end('Forbidden');
  }
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  try {
    // ---------- auth ----------
    if (p === '/api/auth/login' && req.method === 'POST') {
      const body = await readBody(req);
      const loginKey = String(body.login || '').trim().toLowerCase();
      if (loginLimiter.isBlocked(loginKey)) return json(res, 429, { error: 'Too many failed attempts. Try again in a few minutes.' });
      // Exact account ID wins over a nickname match so a look-alike nickname cannot shadow an account.
      const user = db.prepare('SELECT * FROM users WHERE lower(login) = ?').get(loginKey)
        || db.prepare('SELECT * FROM users WHERE lower(nick) = ?').get(loginKey);
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
      db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(String(body.avatar || '').slice(0, 400000), u.id);
      return json(res, 200, { ok: true });
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

    // ---------- lobby ----------
    if (p === '/api/lobby') {
      const tables = lobbyTables();
      const banners = db.prepare('SELECT * FROM banners WHERE slot = ? AND enabled = 1 ORDER BY sort').all('home');
      const u = userByToken(tokenFrom(req));
      return json(res, 200, {
        tables,
        banners,
        online: sitesStats().online,
        jackpot: getSetting('jackpot', 199026635),
        user: publicUser(u),
        missions: db.prepare('SELECT * FROM missions WHERE active = 1 ORDER BY sort').all(),
        settings: { site_name: getSetting('site_name', 'GGPoker'), maintenance: getSetting('maintenance', false) },
      });
    }

    if (p === '/api/tables') {
      return json(res, 200, { tables: lobbyTables() });
    }

    // ---------- tournaments ----------
    if (p === '/api/tournaments') {
      const u = userByToken(tokenFrom(req));
      const rows = db.prepare('SELECT * FROM tournaments WHERE enabled = 1 ORDER BY start_at').all();
      const regs = u ? db.prepare('SELECT tournament_id FROM tourney_regs WHERE user_id = ?').all(u.id).map((r) => r.tournament_id) : [];
      return json(res, 200, { tournaments: rows, registered: regs });
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
      const tableId = `tourney-${id}`;
      const existing = LIVE_TABLES.get(tableId);
      const alreadySeated = !!existing?.table.seatOf(u.id);
      if (t.status === 'completed' && !alreadySeated) return json(res, 400, { error: 'This tournament has finished' });
      // One registration buys exactly one stack; it is consumed when the player busts, leaves or wins.
      if (!reg && !alreadySeated) return json(res, 400, { error: 'Register first' });
      if (existing && existing.table.tournament && existing.table.tournament.winner) {
        clearInterval(existing.timer);
        LIVE_TABLES.delete(tableId);
        CUSTOM_CFG.delete(tableId);
      }
      if (!CUSTOM_CFG.has(tableId)) {
        const bb = Math.max(20, Math.round(t.starting_stack / 100));
        CUSTOM_CFG.set(tableId, {
          id: tableId, name: t.name, game: 'holdem', category: 'Tournament', sb: bb, bb: bb * 2,
          ante: 0, min_buyin: t.starting_stack, max_buyin: t.starting_stack, seats: 6, speed: 'Normal',
          tournamentId: id,
          tournament: {
            prizePool: Math.max(t.gtd, t.entrants * (t.buyin + t.fee)),
            level: 1, blindEvery: Math.max(5, t.blind_speed),
          },
        });
      }
      db.prepare("UPDATE tournaments SET status = 'running' WHERE id = ? AND status = 'registering'").run(id);
      const table = getLiveTable(tableId);
      if (!table) return json(res, 500, { error: 'cannot create table' });
      if (!table.seatOf(u.id)) {
        table.sit({ id: u.id, nick: u.nick, avatar: u.avatar }, null, t.starting_stack);
      }
      table.fillBots(Math.max(0, table.cfg.seats - table.occupiedSeats().length));
      table.maybeStart();
      const entry = LIVE_TABLES.get(tableId);
      if (entry) broadcastState(table);
      return json(res, 200, { ok: true, tableId });
    }

    if (p.startsWith('/api/tournaments/') && p.endsWith('/unregister') && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const id = p.split('/')[3];
      const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
      const already = db.prepare('SELECT 1 FROM tourney_regs WHERE tournament_id = ? AND user_id = ?').get(id, u.id);
      if (!already || !t) return json(res, 400, { error: 'Not registered' });
      if (t.status !== 'registering') return json(res, 400, { error: 'Unregistration is closed' });
      if (LIVE_TABLES.get(`tourney-${id}`)?.table.seatOf(u.id)) return json(res, 400, { error: 'You are already playing this tournament' });
      if (t.buyin + t.fee > 0) addTransaction(u.id, 'tourney_refund', t.buyin + t.fee, `Unregistration ${t.name}`);
      db.prepare('DELETE FROM tourney_regs WHERE tournament_id = ? AND user_id = ?').run(id, u.id);
      db.prepare('UPDATE tournaments SET entrants = MAX(0, entrants - 1) WHERE id = ?').run(id);
      return json(res, 200, { ok: true });
    }

    // ---------- cashier ----------
    if (p === '/api/cashier') {
      const u = requireUser(req, res); if (!u) return;
      const tx = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(u.id);
      return json(res, 200, { user: publicUser(u), transactions: tx });
    }

    if (p === '/api/cashier/deposit' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const body = await readBody(req);
      const amount = toInt(body.amount, { min: 1, max: 100000000 });
      if (amount === null) return json(res, 400, { error: 'Invalid amount' });
      const after = addTransaction(u.id, 'deposit', amount, String(body.method || 'Instant bank transfer').slice(0, 60));
      return json(res, 200, { ok: true, balance: after });
    }

    if (p === '/api/cashier/withdraw' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const body = await readBody(req);
      const amount = toInt(body.amount, { min: 1, max: u.balance });
      if (amount === null) return json(res, 400, { error: 'Invalid amount' });
      const after = addTransaction(u.id, 'withdraw', -amount, String(body.method || 'Bank transfer').slice(0, 60));
      return json(res, 200, { ok: true, balance: after });
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
      return json(res, 200, { missions: defs.map((m) => ({ ...m, progress: byId.get(m.id)?.progress || 0, claimed: byId.get(m.id)?.claimed || 0 })) });
    }

    if (p.startsWith('/api/missions/') && p.endsWith('/claim') && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const id = p.split('/')[3];
      const m = db.prepare('SELECT * FROM missions WHERE id = ?').get(id);
      if (!m) return json(res, 404, { error: 'not found' });
      const c = getClaim(u.id, 'mission', id);
      if (c?.claimed) return json(res, 400, { error: 'Already claimed' });
      if (!c || c.progress < m.goal) return json(res, 400, { error: 'Mission not complete' });
      const award = claimReward(u.id, 'mission', id, m.reward, m.reward_kind, `Mission: ${m.title}`);
      if (!award.claimed) return json(res, 400, { error: 'Already claimed' });
      return json(res, 200, { ok: true, balance: award.balance, reward: m.reward, kind: m.reward_kind });
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
      return json(res, 200, { ok: true, amount, balance: award.balance });
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
        if (BJ_HANDS.has(u.id)) return json(res, 400, { error: 'Finish your current hand first' });
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
    if (p === '/api/friends' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const b = await readBody(req);
      const nick = String(b.nick || '').trim();
      if (!nick) return json(res, 400, { error: 'Enter a nickname' });
      const target = db.prepare('SELECT * FROM users WHERE lower(nick) = lower(?) OR lower(login) = lower(?)').get(nick, nick);
      if (!target) return json(res, 404, { error: 'Player not found' });
      if (target.id === u.id) return json(res, 400, { error: 'That is you' });
      db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?,?)').run(u.id, target.id);
      return json(res, 200, { ok: true, nick: target.nick });
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
      const body = await readBody(req);
      const msg = String(body.message || '').slice(0, 300);
      if (!msg.trim()) return json(res, 400, { error: 'empty' });
      if (chatLimiter.isBlocked(`lobby:${u.id}`)) return json(res, 429, { error: 'You are sending messages too quickly' });
      chatLimiter.record(`lobby:${u.id}`);
      db.prepare('INSERT INTO chat_messages (user_id,nick,channel,message) VALUES (?,?,?,?)').run(u.id, u.nick, 'lobby', msg);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/chat') {
      const rows = db.prepare(`SELECT * FROM chat_messages WHERE channel='lobby' ORDER BY id DESC LIMIT 50`).all().reverse();
      return json(res, 200, { messages: rows });
    }

    /* ---------------- admin ---------------- */
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
      const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
      const hands = db.prepare('SELECT COUNT(*) c FROM hands').get().c;
      const tables = db.prepare('SELECT COUNT(*) c FROM tables').get().c;
      const tourneys = db.prepare('SELECT COUNT(*) c FROM tournaments').get().c;
      const turnover = db.prepare(`SELECT COALESCE(SUM(ABS(amount)),0) s FROM transactions`).get().s;
      const live = [...LIVE_TABLES.values()].map((e) => ({ id: e.table.cfg.id, name: e.table.cfg.name, players: e.table.occupiedSeats().length, hand: e.table.handNo, street: e.table.street }));
      return json(res, 200, { users, hands, tables, tourneys, turnover, live, online: sitesStats().online, jackpot: getSetting('jackpot') });
    }

    if (p === '/api/admin/users') {
      const a = requireAdmin(req, res); if (!a) return;
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const rows = db.prepare('SELECT * FROM users ORDER BY id').all()
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
        const after = addTransaction(id, 'admin', amount, `Admin credit by ${a.login}`);
        db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(a.login, 'credit', `user ${id} ${body.amount}`);
        return json(res, 200, { ok: true, balance: after });
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
        removeFromLiveTables(id, 'Account closed');
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
        db.prepare('DELETE FROM tourney_regs WHERE user_id = ?').run(id);
        db.prepare('DELETE FROM friends WHERE user_id = ? OR friend_id = ?').run(id, id);
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
        db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(a.login, 'delete_user', `user ${id} ${target.login}`);
        return json(res, 200, { ok: true });
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
      if (b.delete) { db.prepare('DELETE FROM tournaments WHERE id = ?').run(b.id); return json(res, 200, { ok: true }); }
      const id = b.id || `t${Date.now()}`;
      db.prepare(`INSERT INTO tournaments (id,name,game,buyin,fee,gtd,start_at,status,max_players,entrants,starting_stack,blind_speed,format,enabled)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, buyin=excluded.buyin, fee=excluded.fee, gtd=excluded.gtd,
        start_at=excluded.start_at, status=excluded.status, max_players=excluded.max_players, format=excluded.format, enabled=excluded.enabled`)
        .run(id, b.name || 'New Tournament', b.game || 'holdem', Number(b.buyin) || 0, Number(b.fee) || 0,
          Number(b.gtd) || 0, b.start_at || new Date().toISOString(), b.status || 'registering',
          Number(b.max_players) || 1000, Number(b.entrants) || 0, Number(b.starting_stack) || 10000,
          Number(b.blind_speed) || 8, b.format || 'NLH', b.enabled === false ? 0 : 1);
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
      db.prepare(`INSERT INTO missions (id,title,description,goal,progress,reward,reward_kind,active,sort,claimed)
        VALUES (?,?,?,?,?,?,?,?,?,0)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, goal=excluded.goal,
        reward=excluded.reward, reward_kind=excluded.reward_kind, active=excluded.active, sort=excluded.sort`)
        .run(b.id || `m${Date.now()}`, b.title || 'Mission', b.description || '', Number(b.goal) || 1,
          Number(b.progress) || 0, Number(b.reward) || 100, b.reward_kind || 'USD', b.active === false ? 0 : 1, Number(b.sort) || 0);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/admin/missions') {
      const a = requireAdmin(req, res); if (!a) return;
      return json(res, 200, { missions: db.prepare('SELECT * FROM missions ORDER BY sort').all() });
    }

    if (p.startsWith('/api/admin/live/') && p.endsWith('/close') && req.method === 'POST') {
      const a = requireAdmin(req, res); if (!a) return;
      const id = p.split('/')[4];
      const entry = LIVE_TABLES.get(id);
      if (!entry) return json(res, 404, { error: 'not running' });
      closeLiveTable(id, 'Table closed by admin');
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
  verifyClient: ({ req, origin }) => isLocalHost(req.headers.host) && isLocalOrigin(origin),
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
    if (msg.type === 'join_table') {
      const table = getLiveTable(msg.tableId);
      if (!table) return ws.send(JSON.stringify({ type: 'error', error: 'table not found' }));
      const entry = LIVE_TABLES.get(msg.tableId);
      // ensure there is a seat for the human
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(ws.userId);
      if (!u) return ws.send(JSON.stringify({ type: 'error', error: 'login required' }));
      if (msg.observe) {
        table.fillBots(Math.max(3, table.cfg.seats - 1));
        table.maybeStart();
        entry.clients.add(ws);
        ws.tables.add(msg.tableId);
        ws.send(JSON.stringify({ type: 'joined', tableId: msg.tableId, seat: null, observe: true }));
        broadcastState(table);
        return;
      }
      const seated = table.seatOf(u.id);
      if (seated) {
        // Reconnect (or a second window): the seat and stack are still here.
        seated.player.disconnected = false;
        seated.player.disconnectedAt = 0;
      } else {
        if (table.tournament) {
          // Tournament seats are only handed out by /play, which checks the registration.
          entry.clients.add(ws);
          ws.tables.add(msg.tableId);
          ws.send(JSON.stringify({ type: 'joined', tableId: msg.tableId, seat: null, observe: true }));
          broadcastState(table);
          return;
        }
        if (getSetting('maintenance', false) && !u.is_admin) {
          return ws.send(JSON.stringify({ type: 'error', error: 'Tables are closed for maintenance' }));
        }
        const hasRoom = table.occupiedSeats().some((s) => s.player.isBot) || table.occupiedSeats().length < table.cfg.seats;
        if (!hasRoom) {
          const pos = waitlistJoin(msg.tableId, u.id, u.nick);
          entry.clients.add(ws);
          ws.tables.add(msg.tableId);
          ws.send(JSON.stringify({ type: 'joined', tableId: msg.tableId, seat: null, observe: true, waitlist: pos }));
          ws.send(JSON.stringify({ type: 'waitlist', position: pos, tableId: msg.tableId }));
          broadcastState(table);
          return;
        }
        const buyin = toInt(msg.buyin) || table.cfg.min_buyin;
        let res = seatHuman(table, u, buyin, msg.seat);
        if (!res.ok && msg.seat != null) res = seatHuman(table, u, buyin, null);
        if (!res.ok) return ws.send(JSON.stringify({ type: 'error', error: res.error }));
        waitlistLeave(msg.tableId, u.id);
      }
      // fill part of the table with bots, always leaving the choice of seats to humans
      const botsNeeded = Math.max(0, table.cfg.seats - table.occupiedSeats().length);
      if (!table.tournament) table.fillBots(Math.min(botsNeeded, Math.max(3, Math.ceil(table.cfg.seats / 2))));
      entry.clients.add(ws);
      ws.tables.add(msg.tableId);
      table.maybeStart();
      ws.send(JSON.stringify({ type: 'joined', tableId: msg.tableId, seat: table.seatOf(u.id)?.index ?? null }));
      broadcastState(table);
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
      const res = entry.table.useTimeBank(ws.userId);
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
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(ws.userId);
      if (!u || u.balance < amount) return ws.send(JSON.stringify({ type: 'error', error: 'not enough balance' }));
      if (!seat.player.sessionId) seat.player.sessionId = `${table.cfg.id}:${randomUUID()}`;
      const sessionId = seat.player.sessionId;
      seat.player.rebuyCount = (seat.player.rebuyCount || 0) + 1;
      addTransactionEx(u.id, 'rebuy', -amount, `Rebuy ${table.cfg.name}`, 'USD', {
        sessionId, reference: `in:${sessionId}:r${seat.player.rebuyCount}`, onDuplicate: 'skip',
      });
      seat.player.stack += amount;
      broadcastState(table);
      return;
    }
    if (msg.type === 'sit_out') {
      const entry = LIVE_TABLES.get(msg.tableId);
      if (!entry) return;
      const seat = entry.table.seatOf(ws.userId);
      if (seat) {
        seat.player.sittingOut = !!msg.value;
        if (!msg.value) { seat.player.missedTurns = 0; entry.table.maybeStart(); }
        broadcastState(entry.table);
      }
      return;
    }
    if (msg.type === 'rabbit') {
      const entry = LIVE_TABLES.get(msg.tableId);
      if (!entry) return;
      const t = entry.table;
      if (t.street === 'ended' && t.board.length < 5) {
        const deck = [...t.deck];
        const cards = [];
        while (cards.length < 5 - t.board.length && deck.length) cards.push(cardStr(deck.pop()));
        const evt = { type: 'rabbit', cards, at: Date.now() };
        for (const client of entry.clients) if (client.readyState === 1) client.send(JSON.stringify({ type: 'event', event: evt }));
      }
      return;
    }
    if (msg.type === 'chat') {
      const entry = LIVE_TABLES.get(msg.tableId);
      if (!entry) return;
      const text = String(msg.message || '').slice(0, 200);
      if (!text.trim() || !ws.userId) return;
      if (chatLimiter.isBlocked(`ws:${ws.userId}`)) return ws.send(JSON.stringify({ type: 'error', error: 'You are sending messages too quickly' }));
      chatLimiter.record(`ws:${ws.userId}`);
      const evt = { type: 'chat', nick: ws.nick, userId: ws.userId, message: text, at: Date.now() };
      for (const client of entry.clients) if (client.readyState === 1) client.send(JSON.stringify({ type: 'event', event: evt }));
      return;
    }
    if (msg.type === 'emote') {
      const entry = LIVE_TABLES.get(msg.tableId);
      if (!entry) return;
      const emote = [...String(msg.emote || '')].slice(0, 4).join('');
      if (!emote || !ws.userId || chatLimiter.isBlocked(`ws:${ws.userId}`)) return;
      chatLimiter.record(`ws:${ws.userId}`);
      const evt = { type: 'emote', nick: ws.nick, userId: ws.userId, emote, at: Date.now() };
      for (const client of entry.clients) if (client.readyState === 1) client.send(JSON.stringify({ type: 'event', event: evt }));
      return;
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
server.listen(PORT, '127.0.0.1', () => {
  const port = server.address().port;
  console.log(`LISTENING ${port}`);
  console.log(`GGPoker clone server: http://127.0.0.1:${port}`);
});
