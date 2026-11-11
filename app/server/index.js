import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import {
  db, DATA_DIR, hashPassword, checkPassword, addTransaction, newSession, userByToken,
  publicUser, getSetting, setSetting,
} from './db.js';
import { PokerTable, botName } from './table.js';
import { makeDeck, shuffle, cardStr } from './poker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5198);
const APP_DIR = path.join(__dirname, '..');
const DIST = path.join(APP_DIR, 'dist');
const PUBLIC = path.join(APP_DIR, 'public');

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
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
        db.prepare(`INSERT INTO hands (hand_no,table_id,table_name,game,players,board,pot,result,hero_cards)
          VALUES (?,?,?,?,?,?,?,?,?)`).run(
          h.handNo, h.tableId, h.tableName, h.game, JSON.stringify(h.players),
          h.board.join(' '), h.pot, JSON.stringify(h.result), h.heroCards || ''
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
    onTournamentEnd: (table, winner) => {
      try {
        const tid = table.cfg.tournamentId;
        if (tid) {
          db.prepare("UPDATE tournaments SET status = 'completed' WHERE id = ?").run(tid);
        }
        const u = db.prepare('SELECT * FROM users WHERE id = ?').get(winner.id);
        if (u) addTransaction(u.id, 'tourney_win', winner.prize, `Tournament win: ${table.cfg.name}`);
        db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run('system', 'tournament_end', `${table.cfg.name} winner ${winner.nick} ${winner.prize}`);
      } catch (e) { console.error('tournament end', e); }
    },
    onHandComplete: ({ table, winner }) => {
      // mission progress for humans
      for (const s of table.seats) {
        if (!s.player || s.player.isBot) continue;
        db.prepare(`UPDATE missions SET progress = MIN(goal, progress + 1) WHERE id = 'daily-hands' AND claimed = 0`).run();
        if (winner && winner.id === s.player.id) {
          db.prepare(`UPDATE missions SET progress = MIN(goal, progress + 1) WHERE id = 'daily-win' AND claimed = 0`).run();
        }
        if (table.board.length >= 3) {
          db.prepare(`UPDATE missions SET progress = MIN(goal, progress + 1) WHERE id = 'daily-flop' AND claimed = 0`).run();
        }
      }
    },
  });
  const entry = { table, clients: new Set(), timer: null, lastBroadcast: 0 };
  entry.emptySince = null;
  entry.timer = setInterval(() => {
    try {
      table.tick();
      if (Date.now() - entry.lastBroadcast > 450) broadcastState(table);
      if (entry.clients.size === 0) {
        if (!entry.emptySince) entry.emptySince = Date.now();
        else if (Date.now() - entry.emptySince > 45000) {
          clearInterval(entry.timer);
          LIVE_TABLES.delete(id);
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

function seatHuman(table, user, buyin, seatIndex) {
  const existing = table.seatOf(user.id);
  if (existing) return { ok: true, seat: existing.index };
  const stack = Number(buyin) || table.cfg.min_buyin;
  if (stack < table.cfg.min_buyin || stack > table.cfg.max_buyin) return { ok: false, error: 'invalid buy-in' };
  if (user.balance < stack) return { ok: false, error: 'not enough balance' };
  addTransaction(user.id, 'buyin', -stack, `Buy-in ${table.cfg.name}`);
  const res = table.sit({ id: user.id, nick: user.nick, avatar: user.avatar }, seatIndex ?? null, stack);
  if (!res.ok) { addTransaction(user.id, 'refund', stack, 'Buy-in refund'); return res; }
  return res;
}

/* ------------------------------------------------------------------ */
/* HTTP API                                                            */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  try {
    // ---------- auth ----------
    if (p === '/api/auth/login' && req.method === 'POST') {
      const body = await readBody(req);
      const user = db.prepare('SELECT * FROM users WHERE lower(login) = lower(?) OR lower(nick) = lower(?)').get(body.login || '', body.login || '');
      if (!user || !checkPassword(body.password || '', user.password)) return json(res, 400, { error: 'Invalid account ID or password' });
      if (user.banned) return json(res, 403, { error: 'This account is locked. Contact support.' });
      db.prepare('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?').run(user.id);
      const token = newSession(user.id);
      return json(res, 200, { token, user: publicUser(user) });
    }

    if (p === '/api/auth/register' && req.method === 'POST') {
      const body = await readBody(req);
      const login = String(body.login || '').trim();
      const nick = String(body.nick || login).trim();
      if (login.length < 3) return json(res, 400, { error: 'Account ID must be at least 3 characters' });
      if ((body.password || '').length < 4) return json(res, 400, { error: 'Password must be at least 4 characters' });
      if (db.prepare('SELECT id FROM users WHERE lower(login)=lower(?)').get(login)) return json(res, 400, { error: 'Account already exists' });
      const start = getSetting('default_balance', 5000) + getSetting('welcome_bonus', 100000);
      db.prepare(`INSERT INTO users (login,nick,password,email,balance,tickets) VALUES (?,?,?,?,?,?)`)
        .run(login, nick, hashPassword(body.password), body.email || '', start, 5);
      const user = db.prepare('SELECT * FROM users WHERE login = ?').get(login);
      addTransaction(user.id, 'welcome', start, 'Welcome bonus');
      const token = newSession(user.id);
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
      db.prepare(`INSERT INTO user_settings (user_id,json) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET json=excluded.json`)
        .run(u.id, JSON.stringify(body || {}));
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
      const nick = String(body.nick || '').trim().slice(0, 20);
      if (nick.length < 2) return json(res, 400, { error: 'Nickname too short' });
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
      const total = t.buyin + t.fee;
      if (u.balance < total) return json(res, 400, { error: 'Insufficient balance' });
      addTransaction(u.id, 'tourney_buyin', -total, `Registration ${t.name}`);
      db.prepare('INSERT INTO tourney_regs (tournament_id,user_id) VALUES (?,?)').run(id, u.id);
      db.prepare('UPDATE tournaments SET entrants = entrants + 1 WHERE id = ?').run(id);
      db.prepare(`UPDATE missions SET progress = goal WHERE id = 'daily-tourney' AND claimed = 0`).run();
      return json(res, 200, { ok: true });
    }

    if (p.startsWith('/api/tournaments/') && p.endsWith('/play') && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const id = p.split('/')[3];
      const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
      if (!t) return json(res, 404, { error: 'not found' });
      const reg = db.prepare('SELECT 1 FROM tourney_regs WHERE tournament_id = ? AND user_id = ?').get(id, u.id);
      if (!reg && t.buyin > 0) return json(res, 400, { error: 'Register first' });
      const tableId = `tourney-${id}`;
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
      addTransaction(u.id, 'tourney_refund', t.buyin + t.fee, `Unregistration ${t.name}`);
      db.prepare('DELETE FROM tourney_regs WHERE tournament_id = ? AND user_id = ?').run(id, u.id);
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
      const amount = Math.round(Number(body.amount || 0));
      if (amount <= 0 || amount > 100000000) return json(res, 400, { error: 'Invalid amount' });
      const after = addTransaction(u.id, 'deposit', amount, body.method || 'Instant bank transfer');
      return json(res, 200, { ok: true, balance: after });
    }

    if (p === '/api/cashier/withdraw' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const body = await readBody(req);
      const amount = Math.round(Number(body.amount || 0));
      if (amount <= 0 || amount > u.balance) return json(res, 400, { error: 'Invalid amount' });
      const after = addTransaction(u.id, 'withdraw', -amount, body.method || 'Bank transfer');
      return json(res, 200, { ok: true, balance: after });
    }

    // ---------- hand history ----------
    if (p === '/api/hands') {
      const u = requireUser(req, res); if (!u) return;
      const rows = db.prepare('SELECT * FROM hands ORDER BY id DESC LIMIT 60').all();
      return json(res, 200, {
        hands: rows.map((h) => ({
          id: h.id, handNo: h.hand_no, tableId: h.table_id, tableName: h.table_name, game: h.game,
          board: h.board, pot: h.pot, result: JSON.parse(h.result || '{}'), players: JSON.parse(h.players || '[]'),
          heroCards: h.hero_cards, created_at: h.created_at,
        })),
      });
    }

    // ---------- missions / rewards ----------
    if (p === '/api/missions') {
      const u = requireUser(req, res); if (!u) return;
      return json(res, 200, { missions: db.prepare('SELECT * FROM missions WHERE active = 1 ORDER BY sort').all() });
    }

    if (p.startsWith('/api/missions/') && p.endsWith('/claim') && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const id = p.split('/')[3];
      const m = db.prepare('SELECT * FROM missions WHERE id = ?').get(id);
      if (!m) return json(res, 404, { error: 'not found' });
      if (m.claimed) return json(res, 400, { error: 'Already claimed' });
      if (m.progress < m.goal) return json(res, 400, { error: 'Mission not complete' });
      db.prepare('UPDATE missions SET claimed = 1 WHERE id = ?').run(id);
      const after = addTransaction(u.id, 'claim', m.reward, `Mission: ${m.title}`, m.reward_kind);
      return json(res, 200, { ok: true, balance: after, reward: m.reward, kind: m.reward_kind });
    }

    if (p === '/api/leaderboard') {
      const rows = db.prepare('SELECT nick, vip_level, xp, vip_points, avatar FROM users WHERE banned = 0 ORDER BY vip_points DESC LIMIT 50').all();
      return json(res, 200, { leaders: rows.map((r, i) => ({ rank: i + 1, ...r })) });
    }

    if (p === '/api/rewards/daily' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const day = new Date().toISOString().slice(0, 10);
      const already = db.prepare('SELECT * FROM daily_claims WHERE user_id = ? AND day = ?').get(u.id, day);
      if (already) return json(res, 400, { error: 'Daily freebie already claimed today', amount: already.amount });
      const amount = 500 + Math.floor(Math.random() * 20) * 250;
      db.prepare('INSERT INTO daily_claims (user_id,day,amount) VALUES (?,?,?)').run(u.id, day, amount);
      const after = addTransaction(u.id, 'daily', amount, 'Daily freebie');
      return json(res, 200, { ok: true, amount, balance: after });
    }

    if (p === '/api/rewards/daily') {
      const u = requireUser(req, res); if (!u) return;
      const day = new Date().toISOString().slice(0, 10);
      const already = db.prepare('SELECT * FROM daily_claims WHERE user_id = ? AND day = ?').get(u.id, day);
      return json(res, 200, { claimed: !!already, amount: already?.amount || 0 });
    }

    if (p === '/api/rewards/spin' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const prizes = [0, 500, 1000, 2500, 5000, 10000, 25000, 100000];
      const idx = Math.floor(Math.random() * prizes.length);
      const amount = prizes[idx];
      if (amount) addTransaction(u.id, 'fishbuffet', amount, 'Fish Buffet wheel');
      return json(res, 200, { index: idx, amount, prizes });
    }


    // ---------- casino games ----------
    if (p === '/api/games/slot' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const body = await readBody(req);
      const bet = Math.max(10, Math.min(1000000, Math.round(Number(body.bet) || 100)));
      if (u.balance < bet) return json(res, 400, { error: 'Insufficient balance' });
      const symbols = ['cherry', 'lemon', 'bell', 'star', 'diamond', 'seven', 'clover', 'wild'];
      const weights = [26, 24, 18, 12, 9, 6, 4, 1];
      const pick = () => {
        const total = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        for (let i = 0; i < symbols.length; i++) { r -= weights[i]; if (r <= 0) return symbols[i]; }
        return symbols[0];
      };
      const grid = Array.from({ length: 5 }, () => Array.from({ length: 3 }, pick));
      const lines = [];
      const pay = { cherry: 4, lemon: 5, bell: 8, star: 12, diamond: 20, seven: 50, clover: 7, wild: 100 };
      const lineDefs = [
        [1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],
        [0,0,1,2,2],[2,2,1,0,0],[0,1,0,1,0],[2,1,2,1,2],[1,0,1,2,1],
      ];
      let win = 0;
      for (const def of lineDefs) {
        const first = grid[0][def[0]];
        let count = 1;
        for (let i = 1; i < 5; i++) {
          const sym = grid[i][def[i]];
          if (sym === first || sym === 'wild' || first === 'wild') count++;
          else break;
        }
        if (count >= 3) {
          const mult = (pay[first] || 5) * (count === 3 ? 1 : count === 4 ? 4 : 20);
          win += Math.round(bet * mult);
          lines.push({ line: lineDefs.indexOf(def), symbols: def.map((r, i) => grid[i][r]), count, amount: Math.round(bet * mult) });
        }
      }
      const after = addTransaction(u.id, 'slots', win - bet, `Slots ${win ? 'win ' + win : 'spin'}`, 'USD');
      return json(res, 200, { grid, lines, win, bet, balance: after });
    }

    if (p === '/api/games/roulette' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const body = await readBody(req);
      const bet = Math.max(10, Math.min(1000000, Math.round(Number(body.bet) || 100)));
      if (u.balance < bet) return json(res, 400, { error: 'Insufficient balance' });
      const number = Math.floor(Math.random() * 37);
      const reds = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
      let payout = 0;
      const kind = String(body.kind || 'red');
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
        case 'number': if (number === Number(body.value)) payout = bet * 36; break;
        default: break;
      }
      const after = addTransaction(u.id, 'roulette', payout - bet, `Roulette ${number}`, 'USD');
      return json(res, 200, { number, red: reds.has(number), payout, bet, balance: after });
    }

    if (p === '/api/games/blackjack' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const body = await readBody(req);
      const action = String(body.action || 'deal');
      const bet = Math.max(10, Math.min(1000000, Math.round(Number(body.bet) || 100)));
      const deck = shuffle(makeDeck(false));
      const val = (c) => (c.v >= 10 ? 10 : c.v === 14 ? 11 : c.v);
      const total = (cards) => {
        let sum = cards.reduce((a, c) => a + val(c), 0);
        let aces = cards.filter((c) => c.v === 14).length;
        while (sum > 21 && aces > 0) { sum -= 10; aces--; }
        return sum;
      };
      if (action === 'deal') {
        if (u.balance < bet) return json(res, 400, { error: 'Insufficient balance' });
        const player = [deck.pop(), deck.pop()];
        const dealer = [deck.pop(), deck.pop()];
        addTransaction(u.id, 'blackjack', -bet, 'Blackjack bet');
        const bj = total(player) === 21;
        return json(res, 200, { player: player.map(cardStr), dealer: [cardStr(dealer[0]), '??'], dealerHidden: dealer.map(cardStr), playerTotal: total(player), balance: u.balance - bet, bet, blackjack: bj });
      }
      // simplified settle endpoint for hit/stand flow kept client-side
      if (action === 'settle') {
        const amount = Math.round(Number(body.amount) || 0);
        const after = addTransaction(u.id, 'blackjack', amount, 'Blackjack result');
        return json(res, 200, { balance: after });
      }
      return json(res, 400, { error: 'unknown action' });
    }

    if (p === '/api/games/tablegame' && req.method === 'POST') {
      const u = requireUser(req, res); if (!u) return;
      const body = await readBody(req);
      const game = String(body.game || 'baccarat');
      const bet = Math.max(10, Math.min(1000000, Math.round(Number(body.bet) || 100)));
      const pick = String(body.pick || '');
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
        if (pick === winner) payout = bet * (winner === 'tie' ? 8 : winner === 'banker' ? 1.95 : 2);
        result = { player: p1.map(cardStr), banker: b1.map(cardStr), playerTotal: pt, bankerTotal: bt, winner };
      } else if (game === 'dragontiger') {
        const d = [deck.pop()];
        const t = [deck.pop()];
        const dv = rank(d[0]), tv = rank(t[0]);
        const winner = dv > tv ? 'dragon' : tv > dv ? 'tiger' : 'tie';
        if (pick === winner) payout = bet * (winner === 'tie' ? 8 : 2);
        result = { dragon: d.map(cardStr), tiger: t.map(cardStr), winner, dragonRank: dv, tigerRank: tv };
      } else if (game === 'sicbo') {
        const dice = [1, 2, 3].map(() => 1 + Math.floor(Math.random() * 6));
        const sum = dice.reduce((a, b) => a + b, 0);
        const triple = dice[0] === dice[1] && dice[1] === dice[2];
        if (pick === 'big' && sum >= 11 && sum <= 17 && !triple) payout = bet * 2;
        else if (pick === 'small' && sum >= 4 && sum <= 10 && !triple) payout = bet * 2;
        else if (pick === 'triple' && triple) payout = bet * 30;
        else if (pick === 'anytie' && triple) payout = bet * 8;
        else if (pick.startsWith('total') && Number(pick.slice(5)) === sum) payout = bet * (sum === 4 || sum === 17 ? 60 : sum === 5 || sum === 16 ? 30 : 12);
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
      const stake = Math.max(10, Math.min(1000000, Math.round(Number(body.stake) || 100)));
      if (u.balance < stake) return json(res, 400, { error: 'Insufficient balance' });
      const markets = {
        coinflip: { win: Math.random() < 0.5, mult: 1.96 },
        river_ace: { win: Math.random() < 0.22, mult: 4.2 },
        next_hand_red: { win: Math.random() < 0.5, mult: 1.9 },
        any_flush: { win: Math.random() < 0.18, mult: 5.1 },
        player_wins: { win: Math.random() < 0.48, mult: 2.0 },
      };
      const m = markets[body.market] || markets.coinflip;
      const won = m.win;
      const payout = won ? Math.round(stake * m.mult) : 0;
      const after = addTransaction(u.id, 'propbet', payout - stake, `Prop bet ${body.market} ${won ? 'won' : 'lost'}`, 'USD');
      return json(res, 200, { won, payout, stake, balance: after, market: body.market });
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
      db.prepare('INSERT INTO chat_messages (user_id,nick,channel,message) VALUES (?,?,?,?)').run(u.id, u.nick, 'lobby', msg);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/chat') {
      const rows = db.prepare(`SELECT * FROM chat_messages WHERE channel='lobby' ORDER BY id DESC LIMIT 50`).all().reverse();
      return json(res, 200, { messages: rows });
    }

    /* ---------------- admin ---------------- */
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
        const after = addTransaction(id, 'admin', Math.round(body.amount || 0), `Admin credit by ${a.login}`);
        db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(a.login, 'credit', `user ${id} ${body.amount}`);
        return json(res, 200, { ok: true, balance: after });
      }
      if (body.action === 'set') {
        for (const field of ['balance', 'play_chips', 'tickets', 'gems', 'xp', 'vip_level', 'vip_points']) {
          if (body[field] != null) db.prepare(`UPDATE users SET ${field} = ? WHERE id = ?`).run(Math.round(Number(body[field])), id);
        }
        db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(a.login, 'set', `user ${id} ${JSON.stringify(body)}`);
        return json(res, 200, { ok: true });
      }
      if (body.action === 'ban' || body.action === 'unban') {
        db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(body.action === 'ban' ? 1 : 0, id);
        db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(a.login, body.action, `user ${id}`);
        return json(res, 200, { ok: true });
      }
      if (body.action === 'resetpw') {
        db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(String(body.password || 'ggpoker')), id);
        return json(res, 200, { ok: true });
      }
      if (body.action === 'delete' && !target.is_admin) {
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
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
      const id = b.id || `custom-${Date.now()}`;
      db.prepare(`INSERT INTO tables (id,name,game,category,sb,bb,ante,min_buyin,max_buyin,seats,speed,featured,enabled,sort)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, game=excluded.game, category=excluded.category,
        sb=excluded.sb, bb=excluded.bb, ante=excluded.ante, min_buyin=excluded.min_buyin, max_buyin=excluded.max_buyin,
        seats=excluded.seats, speed=excluded.speed, featured=excluded.featured, enabled=excluded.enabled`)
        .run(id, b.name || 'New Table', b.game || 'holdem', b.category || 'Gold', Number(b.sb) || 100, Number(b.bb) || 200,
          Number(b.ante) || 0, Number(b.min_buyin) || 2000, Number(b.max_buyin) || 20000, Number(b.seats) || 6,
          b.speed || 'Normal', b.featured ? 1 : 0, b.enabled === false ? 0 : 1, Number(b.sort) || 999);
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
      for (const s of [...entry.table.seats]) {
        if (s.player && !s.player.isBot) {
          const stack = s.player.stack;
          const uid = s.player.id;
          entry.table.stand(uid);
          if (stack > 0) addTransaction(uid, 'cashout', stack, `Table closed by admin`);
        }
      }
      clearInterval(entry.timer);
      LIVE_TABLES.delete(id);
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
      db.prepare('INSERT INTO chat_messages (user_id,nick,channel,message) VALUES (?,?,?,?)').run(a.id, a.nick, b.channel || 'lobby', String(b.message || ''));
      return json(res, 200, { ok: true });
    }

    /* ---------------- static ---------------- */
    if (p.startsWith('/api/')) return json(res, 404, { error: 'not found' });

    let file = null;
    if (p.startsWith('/assets/')) {
      const rel = decodeURIComponent(p.replace('/assets/', ''));
      for (const base of [path.join(PUBLIC, 'assets'), path.join(DIST, 'assets')]) {
        const cand = path.join(base, rel);
        if (cand.startsWith(base) && fs.existsSync(cand) && fs.statSync(cand).isFile()) { file = cand; break; }
      }
    } else if (fs.existsSync(DIST)) {
      const cand = path.join(DIST, p === '/' ? 'index.html' : decodeURIComponent(p));
      if (cand.startsWith(DIST) && fs.existsSync(cand) && fs.statSync(cand).isFile()) file = cand;
      else if (!path.extname(p)) file = path.join(DIST, 'index.html');
    }
    if (!file && fs.existsSync(path.join(PUBLIC, 'index.html'))) file = path.join(PUBLIC, 'index.html');
    if (file && fs.existsSync(file)) return serveFile(res, file);
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    console.error('api error', p, err);
    json(res, 500, { error: 'internal error', detail: String(err && err.message) });
  }
});

/* ------------------------------------------------------------------ */
/* WebSocket                                                           */
/* ------------------------------------------------------------------ */

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  const user = userByToken(token);
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
      if (!table.seatOf(u.id)) {
        if (table.tournament) {
          table.sit({ id: u.id, nick: u.nick, avatar: u.avatar }, null, table.cfg.min_buyin);
        } else {
          const res = seatHuman(table, u, Number(msg.buyin) || table.cfg.min_buyin);
          if (!res.ok) return ws.send(JSON.stringify({ type: 'error', error: res.error }));
        }
      }
      // fill the table with bots
      const humans = table.humans().length;
      const target = table.cfg.seats;
      const botsNeeded = Math.max(0, target - table.occupiedSeats().length - 0);
      table.fillBots(Math.min(botsNeeded, Math.max(3, Math.ceil(target / 2))));
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
        const seat = table.seatOf(ws.userId);
        if (seat) {
          const stack = seat.player.stack;
          const res = table.stand(ws.userId);
          if (stack > 0) addTransaction(ws.userId, 'cashout', stack, `Cash-out ${table.cfg.name}`);
        }
        broadcastState(table);
      }
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
      if (seat.player.inHand) return ws.send(JSON.stringify({ type: 'error', error: 'Finish the hand first' }));
      const amount = Math.round(Number(msg.amount) || 0);
      if (amount < table.cfg.min_buyin || amount > table.cfg.max_buyin) return ws.send(JSON.stringify({ type: 'error', error: 'invalid amount' }));
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(ws.userId);
      if (!u || u.balance < amount) return ws.send(JSON.stringify({ type: 'error', error: 'not enough balance' }));
      addTransaction(u.id, 'rebuy', -amount, `Rebuy ${table.cfg.name}`);
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
        if (msg.value && entry.table.actor === ws.userId) entry.table.act(ws.userId, 'fold');
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
      if (!text.trim()) return;
      const evt = { type: 'chat', nick: ws.nick, userId: ws.userId, message: text, at: Date.now() };
      for (const client of entry.clients) if (client.readyState === 1) client.send(JSON.stringify({ type: 'event', event: evt }));
      return;
    }
    if (msg.type === 'emote') {
      const entry = LIVE_TABLES.get(msg.tableId);
      if (!entry) return;
      const evt = { type: 'emote', nick: ws.nick, userId: ws.userId, emote: msg.emote, at: Date.now() };
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
        seat.player.disconnected = true;
        const stack = seat.player.stack;
        table.stand(ws.userId);
        if (stack > 0) addTransaction(ws.userId, 'cashout', stack, `Cash-out ${table.cfg.name}`);
      }
      broadcastState(table);
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`GGPoker clone server: http://127.0.0.1:${PORT}`);
});
