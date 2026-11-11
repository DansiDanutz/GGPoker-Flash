import { DatabaseSync } from 'node:sqlite';
import { randomUUID, scryptSync, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.GGPOKER_DATA || path.join(__dirname, 'data');

import fs from 'node:fs';
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'ggpoker.db'));
db.exec('PRAGMA journal_mode = WAL;');

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

export function checkPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  return scryptSync(password, salt, 32).toString('hex') === hash;
}

function init() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT UNIQUE NOT NULL,
    nick TEXT NOT NULL,
    password TEXT NOT NULL,
    email TEXT,
    avatar TEXT DEFAULT '',
    balance INTEGER NOT NULL DEFAULT 0,          -- USD play money, in cents
    play_chips INTEGER NOT NULL DEFAULT 0,       -- P$
    tickets INTEGER NOT NULL DEFAULT 0,          -- T$
    gems INTEGER NOT NULL DEFAULT 0,             -- ocean gems / XP currency
    xp INTEGER NOT NULL DEFAULT 0,
    vip_level INTEGER NOT NULL DEFAULT 1,
    vip_points INTEGER NOT NULL DEFAULT 0,
    is_admin INTEGER NOT NULL DEFAULT 0,
    banned INTEGER NOT NULL DEFAULT 0,
    country TEXT DEFAULT 'RO',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tables (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    game TEXT NOT NULL,             -- holdem | omaha | omaha5 | shortdeck | rush | aof | spingold | battleroyale | flipandgo
    category TEXT NOT NULL,         -- Diamond | Platinum | Gold | Silver ...
    sb INTEGER NOT NULL,
    bb INTEGER NOT NULL,
    ante INTEGER NOT NULL DEFAULT 0,
    min_buyin INTEGER NOT NULL,
    max_buyin INTEGER NOT NULL,
    seats INTEGER NOT NULL DEFAULT 6,
    speed TEXT DEFAULT 'Normal',
    featured INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    min_players INTEGER NOT NULL DEFAULT 2,
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS hands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hand_no INTEGER NOT NULL,
    table_id TEXT,
    table_name TEXT,
    game TEXT,
    players TEXT,       -- json
    board TEXT,
    pot INTEGER,
    result TEXT,        -- json
    hero_cards TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    game TEXT DEFAULT 'holdem',
    buyin INTEGER NOT NULL,
    fee INTEGER NOT NULL DEFAULT 0,
    gtd INTEGER NOT NULL DEFAULT 0,
    start_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'registering',
    max_players INTEGER NOT NULL DEFAULT 1000,
    entrants INTEGER NOT NULL DEFAULT 0,
    starting_stack INTEGER NOT NULL DEFAULT 10000,
    blind_speed INTEGER NOT NULL DEFAULT 8,
    format TEXT DEFAULT 'NLH',
    banner TEXT DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS tourney_regs (
    tournament_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (tournament_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL,           -- deposit | withdraw | buyin | win | claim | admin | rake
    currency TEXT NOT NULL DEFAULT 'USD',
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    memo TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS missions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    goal INTEGER NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    reward INTEGER NOT NULL,
    reward_kind TEXT NOT NULL DEFAULT 'USD',
    claimed INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS banners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot TEXT NOT NULL,           -- home | tournaments | slots | casino | cashier
    title TEXT,
    subtitle TEXT,
    image TEXT,
    link TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT,
    action TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    nick TEXT,
    table_id TEXT,
    channel TEXT DEFAULT 'lobby',
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS brand_assets (
    slot TEXT PRIMARY KEY,
    mime TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS friends (
    user_id INTEGER NOT NULL,
    friend_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, friend_id)
  );
  CREATE TABLE IF NOT EXISTS player_notes (
    user_id INTEGER NOT NULL,
    target TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT 'yellow',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, target)
  );
  CREATE TABLE IF NOT EXISTS daily_claims (
    user_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    amount INTEGER NOT NULL,
    PRIMARY KEY (user_id, day)
  );
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY,
    json TEXT NOT NULL DEFAULT '{}'
  );
  `);

  try { db.exec('ALTER TABLE hands ADD COLUMN actions TEXT'); } catch { /* already exists */ }
  const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (!count) seed();
}

function seed() {
  const insertUser = db.prepare(
    `INSERT INTO users (login, nick, password, email, avatar, balance, play_chips, tickets, gems, xp, vip_level, vip_points, is_admin)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  insertUser.run('DansiDanutz', 'DansiDanutz', hashPassword('ggpoker'), 'dansi@example.com', '', 1000000, 5000, 50, 1240, 8200, 5, 18400, 0);
  insertUser.run('admin', 'Administrator', hashPassword('admin123'), 'admin@ggpoker.local', '', 100000000, 1000000, 999, 99999, 999999, 10, 999999, 1);
  insertUser.run('guest', 'Guest', hashPassword('guest'), '', '', 500000, 0, 0, 0, 0, 1, 0, 0);

  const tables = [];
  const cats = [
    ['Diamond', 2000, 1000, 50000, 6],
    ['Platinum', 1000, 500, 20000, 6],
    ['Gold', 500, 200, 10000, 6],
    ['Silver', 200, 100, 4000, 6],
    ['Bronze', 100, 50, 2000, 6],
  ];
  let sort = 0;
  for (const [cat, bb, sb, buyin, seats] of cats) {
    for (let i = 1; i <= 12; i++) {
      tables.push({
        id: `nlh-${cat.toLowerCase()}-${String(i).padStart(2, '0')}`,
        name: `NLH ${cat} ${String(i).padStart(2, '0')}`,
        game: 'holdem', category: cat, sb, bb, ante: 0,
        min_buyin: bb * (cat === 'Diamond' ? 25 : 20), max_buyin: bb * 100, seats,
        featured: i === 1 && cat === 'Diamond' ? 1 : 0, sort: sort++,
      });
    }
  }
  for (let i = 1; i <= 8; i++) {
    tables.push({ id: `plo-platinum-${i}`, name: `PLO Platinum ${String(i).padStart(2, '0')}`, game: 'omaha', category: 'Platinum', sb: 500, bb: 1000, ante: 0, min_buyin: 20000, max_buyin: 100000, seats: 6, sort: sort++ });
  }
  for (let i = 1; i <= 6; i++) {
    tables.push({ id: `sd-gold-${i}`, name: `Short Deck Gold ${String(i).padStart(2, '0')}`, game: 'shortdeck', category: 'Gold', sb: 500, bb: 1000, ante: 100, min_buyin: 20000, max_buyin: 80000, seats: 6, sort: sort++ });
  }
  for (let i = 1; i <= 8; i++) {
    tables.push({ id: `rush-platinum-${i}`, name: `Rush & Cash Platinum ${String(i).padStart(2, '0')}`, game: 'rush', category: 'Platinum', sb: 500, bb: 1000, ante: 0, min_buyin: 20000, max_buyin: 100000, seats: 6, speed: 'Fast', sort: sort++ });
  }
  for (let i = 1; i <= 8; i++) {
    tables.push({ id: `aof-gold-${i}`, name: `AoF Gold ${String(i).padStart(2, '0')}`, game: 'aof', category: 'Gold', sb: 500, bb: 1000, ante: 0, min_buyin: 20000, max_buyin: 40000, seats: 6, speed: 'Fast', sort: sort++ });
  }
  for (let i = 1; i <= 6; i++) {
    tables.push({ id: `spingold-${i}`, name: `Spin & Gold ${i}`, game: 'spingold', category: 'Spin', sb: 500, bb: 1000, ante: 0, min_buyin: 15000, max_buyin: 15000, seats: 3, speed: 'Fast', sort: sort++ });
  }
  for (let i = 1; i <= 4; i++) {
    tables.push({ id: `br-${i}`, name: `Mystery Battle Royale ${i}`, game: 'battleroyale', category: 'Battle', sb: 500, bb: 1000, ante: 0, min_buyin: 25000, max_buyin: 25000, seats: 6, speed: 'Fast', sort: sort++ });
  }
  const ins = db.prepare(`INSERT INTO tables (id,name,game,category,sb,bb,ante,min_buyin,max_buyin,seats,speed,featured,sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const t of tables) ins.run(t.id, t.name, t.game, t.category, t.sb, t.bb, t.ante, t.min_buyin, t.max_buyin, t.seats, t.speed || 'Normal', t.featured || 0, t.sort);

  const now = Date.now();
  const tourneys = [
    ['Daily $100,000 Flipout', 2500, 250, 100000, 0.5],
    ['WSOP Express $50K', 5000, 500, 50000, 1.5],
    ['Bounty Hunters $30K', 1500, 150, 30000, 2.5],
    ['GGMasters $150K', 11000, 1000, 150000, 4],
    ['Mystery Bounty $200K', 5250, 500, 200000, 6],
    ['Omaha Weekly $25K', 3000, 300, 25000, 9],
    ['Short Deck $10K', 1000, 100, 10000, 12],
    ['Spin & Gold Challenge', 1000, 0, 5000, 15],
    ['Sunday Major $250K', 22000, 2000, 250000, 20],
    ['Turbo $15K', 750, 75, 15000, 24],
    ['Freeroll $2,000', 0, 0, 2000, 30],
    ['After The Fold $40K', 2000, 200, 40000, 36],
  ];
  const tins = db.prepare(`INSERT INTO tournaments (id,name,buyin,fee,gtd,start_at,entrants,format) VALUES (?,?,?,?,?,?,?,?)`);
  let ti = 0;
  for (const [name, buyin, fee, gtd, hours] of tourneys) {
    ti++;
    tins.run(`t${ti}`, name, buyin, fee, gtd * 100, new Date(now + hours * 3600_000).toISOString(), 120 + ((ti * 337) % 800), ti % 4 === 0 ? 'PLO' : 'NLH');
  }

  db.prepare(`INSERT INTO missions (id,title,description,goal,progress,reward,reward_kind,claimed,active,sort) VALUES
    ('daily-hands','Play 20 hands','Play any 20 hands in cash games',20,6,5000,'USD',0,1,1),
    ('daily-win','Win 3 pots','Win three pots in any Hold''em game',3,1,2500,'USD',0,1,2),
    ('daily-flop','See a flop 10 times','Reach the flop in 10 hands',10,4,1000,'PLAY',0,1,3),
    ('daily-tourney','Register a tournament','Join any tournament today',1,0,10,'TICKET',0,1,4),
    ('weekly-vip','Earn 500 VIP points','Play raked hands to earn points',500,120,50000,'USD',0,1,5)`).run();

  db.prepare(`INSERT INTO banners (slot,title,subtitle,image,link,sort) VALUES
    ('home','DAILY $100,000 FLIPOUT','#ThanksGG · GGCheers','/assets/chrome/promo.png','/promotions',1),
    ('home','After The Fold','$40,000 Daily','/assets/chrome/tab_aof.png','/game/aof',2),
    ('tournaments','WSOP EXPRESS','Win your seat to the Main Event','/assets/chrome/promo.png','/tournaments',1),
    ('slots','GATES OF OLYMPUS','1000x max win','/assets/chrome/spin.png','/slots',1),
    ('casino','LIVE CASINO','Roulette · Blackjack · Baccarat','/assets/chrome/jackpot.png','/casino',1)`).run();

  const settings = {
    site_name: 'GGPoker',
    online_base: 192000,
    jackpot: 199026635,
    rake_percent: 5,
    rake_cap: 300,
    bot_speed_ms: 1100,
    default_balance: 500000,
    maintenance: false,
    welcome_bonus: 100000,
    sounds_enabled: true,
    animations_enabled: true,
  };
  const sins = db.prepare('INSERT INTO settings (key,value) VALUES (?,?)');
  for (const [k, v] of Object.entries(settings)) sins.run(k, JSON.stringify(v));
  db.prepare(`INSERT INTO audit_log (actor,action,detail) VALUES ('system','seed','database initialised')`).run();
}

init();

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

export function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, JSON.stringify(value));
}

export function addTransaction(userId, kind, amount, memo, currency = 'USD') {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const col = currency === 'PLAY' ? 'play_chips' : currency === 'TICKET' ? 'tickets' : currency === 'GEM' ? 'gems' : 'balance';
  db.prepare(`UPDATE users SET ${col} = ${col} + ? WHERE id = ?`).run(amount, userId);
  const after = db.prepare(`SELECT ${col} v FROM users WHERE id = ?`).get(userId).v;
  db.prepare('INSERT INTO transactions (user_id,kind,currency,amount,balance_after,memo) VALUES (?,?,?,?,?,?)')
    .run(userId, kind, currency, amount, after, memo || '');
  return after;
}

export function newSession(userId) {
  const token = randomUUID();
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').run(token, userId, expires);
  return token;
}

export function userByToken(token) {
  if (!token) return null;
  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > datetime('now')`).get(token);
  return row || null;
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, login: u.login, nick: u.nick, email: u.email, avatar: u.avatar,
    balance: u.balance, play_chips: u.play_chips, tickets: u.tickets, gems: u.gems,
    xp: u.xp, vip_level: u.vip_level, vip_points: u.vip_points, is_admin: !!u.is_admin,
    banned: !!u.banned, country: u.country, created_at: u.created_at,
  };
}
