import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash, scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrateIdentity } from './identity-migrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.GGPOKER_DATA || path.join(__dirname, 'data');

import fs from 'node:fs';
import { applyPendingRestore } from './admin-restore.js';
import { SPIN_SEATS, SPIN_STAKES, spinSmallBlinds } from './spin.js';
import { disableBattleRoyaleTables } from './battleroyale.js';
fs.mkdirSync(DATA_DIR, { recursive: true });

// A restore queued from the admin console is applied here, before the live DB is opened.
const RESTORE_RESULT = applyPendingRestore({ dataDir: DATA_DIR });

export const db = new DatabaseSync(path.join(DATA_DIR, 'ggpoker.db'));
db.exec('PRAGMA journal_mode = WAL;');

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

export function checkPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(String(password), salt, 32);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
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
    elo INTEGER NOT NULL DEFAULT 1000,
    is_admin INTEGER NOT NULL DEFAULT 0,
    banned INTEGER NOT NULL DEFAULT 0,
    chat_muted INTEGER NOT NULL DEFAULT 0,
    country TEXT DEFAULT 'RO',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    device TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS tables (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    game TEXT NOT NULL,             -- holdem | omaha | omaha5 | omaha6 | shortdeck | rush | aof | spingold | battleroyale | flipandgo
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
    sort INTEGER NOT NULL DEFAULT 0,
    owner_id INTEGER,
    private INTEGER NOT NULL DEFAULT 0,
    bomb_pot INTEGER NOT NULL DEFAULT 0
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
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL,
    target_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    hand_id TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  );
  CREATE TABLE IF NOT EXISTS elo_ratings (
    user_id INTEGER NOT NULL,
    game TEXT NOT NULL,
    elo INTEGER NOT NULL DEFAULT 1000,
    PRIMARY KEY (user_id, game)
  );
  CREATE TABLE IF NOT EXISTS elo_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    hand_id TEXT,
    delta INTEGER NOT NULL,
    before INTEGER NOT NULL,
    after INTEGER NOT NULL,
    game TEXT NOT NULL DEFAULT 'all',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS notification_reads (
    user_id INTEGER NOT NULL,
    item_key TEXT NOT NULL,
    read_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, item_key)
  );
  CREATE TABLE IF NOT EXISTS direct_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id INTEGER NOT NULL,
    to_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS bonus_claims (
    user_id INTEGER NOT NULL,
    claim_key TEXT NOT NULL,
    amount INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, claim_key)
  );
  CREATE TABLE IF NOT EXISTS table_mutes (
    table_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (table_id, user_id)
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
    late_reg INTEGER NOT NULL DEFAULT 90,
    format TEXT DEFAULT 'NLH',
    mode TEXT DEFAULT 'STANDARD',
    bounty INTEGER DEFAULT 0,
    ticket TEXT DEFAULT '',
    banner TEXT DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    owner_id INTEGER,
    private INTEGER NOT NULL DEFAULT 0,
    bomb_pot INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS tournament_invites (tournament_id TEXT PRIMARY KEY REFERENCES tournaments(id) ON DELETE CASCADE, token TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS tourney_award_entries (
    tournament_id INTEGER NOT NULL, user_id INTEGER NOT NULL, entry_id TEXT,
    PRIMARY KEY(tournament_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS tourney_regs (
    tournament_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (tournament_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS tourney_state (
    tournament_id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  CREATE TABLE IF NOT EXISTS friend_requests (
    from_id INTEGER NOT NULL,
    to_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (from_id, to_id)
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

  if (!db.prepare('PRAGMA table_info(tourney_regs)').all().some(c => c.name === 'entry_id'))
    db.exec('ALTER TABLE tourney_regs ADD COLUMN entry_id TEXT');
  db.exec('INSERT OR IGNORE INTO tourney_award_entries(tournament_id,user_id,entry_id) SELECT tournament_id,user_id,entry_id FROM tourney_regs WHERE entry_id IS NOT NULL');
  try { db.exec('ALTER TABLE hands ADD COLUMN actions TEXT'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE tables ADD COLUMN owner_id INTEGER'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE tables ADD COLUMN private INTEGER DEFAULT 0'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE tables ADD COLUMN bomb_pot INTEGER DEFAULT 0'); } catch { /* already exists */ }
  // Owner-set seconds per decision (null = default 15 s).
  try { db.exec('ALTER TABLE tables ADD COLUMN action_seconds INTEGER'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE tables ADD COLUMN rake_percent INTEGER CHECK(rake_percent IN (2,3,4,5))'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE tables ADD COLUMN rake_cap INTEGER CHECK(rake_cap BETWEEN 1 AND 9000000000)'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE reports ADD COLUMN hand_id TEXT'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE hands ADD COLUMN hand_id TEXT'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE hands ADD COLUMN meta TEXT'); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE elo_history ADD COLUMN game TEXT NOT NULL DEFAULT 'all'"); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE sessions ADD COLUMN device TEXT DEFAULT ''"); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE users ADD COLUMN deleted_at TEXT'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE users ADD COLUMN chat_muted INTEGER DEFAULT 0'); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE chat_messages ADD COLUMN kind TEXT DEFAULT 'chat'"); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE users ADD COLUMN elo INTEGER DEFAULT 1000'); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE tournaments ADD COLUMN mode TEXT DEFAULT 'STANDARD'"); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE tournaments ADD COLUMN bounty INTEGER DEFAULT 0'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE tournaments ADD COLUMN late_reg INTEGER DEFAULT 90'); } catch { /* already exists */ }
  try { db.exec("ALTER TABLE tournaments ADD COLUMN ticket TEXT DEFAULT ''"); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE tournaments ADD COLUMN owner_id INTEGER'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE tournaments ADD COLUMN private INTEGER DEFAULT 0'); } catch { /* already exists */ }
  renameBrandNames();
  db.exec("UPDATE tournaments SET mode='FLIP' WHERE name LIKE 'Quick Flip%' AND (mode IS NULL OR mode='STANDARD')");
  db.exec("UPDATE tournaments SET mode='BOUNTY', bounty=500 WHERE name LIKE 'Bounty Hunters%' AND (mode IS NULL OR mode='STANDARD')");
  db.exec("UPDATE tournaments SET mode='MYSTERY', bounty=1000 WHERE name LIKE 'Mystery Bounty%' AND (mode IS NULL OR mode='STANDARD')");
  try { db.exec('ALTER TABLE transactions ADD COLUMN session_id TEXT'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE transactions ADD COLUMN reference TEXT'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE transactions ADD COLUMN tournament_id TEXT'); } catch { /* already exists */ }
  const refIndex = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_transactions_reference'").get();
  if (refIndex && /WHERE/i.test(refIndex.sql || '')) db.exec('DROP INDEX idx_transactions_reference');
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(user_id, reference)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_transactions_session ON transactions(session_id)");
  db.exec(`CREATE TABLE IF NOT EXISTS player_claims (
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    period_key TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    claimed INTEGER NOT NULL DEFAULT 0,
    amount INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, kind, period_key)
  )`);
  db.prepare(`INSERT OR IGNORE INTO player_claims (user_id, kind, period_key, progress, claimed, amount)
    SELECT user_id,
      CASE WHEN day = 'honey-welcome' OR day LIKE 'honey-%' THEN 'honeymoon'
           WHEN day LIKE 'care-%' THEN 'ggcare' ELSE 'daily' END,
      CASE WHEN day = 'honey-welcome' THEN 'welcome'
           WHEN day LIKE 'honey-%' THEN substr(day, 7)
           WHEN day LIKE 'care-%' THEN substr(day, 6) ELSE day END,
      0, 1, amount
    FROM daily_claims`).run();
  if (!db.prepare('PRAGMA table_info(sessions)').all().some(col => col.name === 'device_id')) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('ALTER TABLE sessions ADD COLUMN device_id TEXT');
      const update = db.prepare('UPDATE sessions SET token = ?, device_id = ? WHERE token = ?');
      for (const {token} of db.prepare('SELECT token FROM sessions').all()) {
        update.run(sessionHash(token), randomUUID(), token);
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_device ON sessions(device_id)');
  db.exec("DELETE FROM sessions WHERE julianday(expires_at) <= julianday('now')");
  db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)');
  // Lobby AvgPot/VPIP/H-hr read the newest hands per table (table-stats.js).
  db.exec('CREATE INDEX IF NOT EXISTS idx_hands_table ON hands(table_id, id)');
  migrateIdentity(db);
  // Existing negative wallets may recover incrementally, but cannot go further into debt.
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS user_wallet_floor_insert BEFORE INSERT ON users
    WHEN NEW.balance < 0 OR NEW.gems < 0
    BEGIN SELECT RAISE(ABORT, 'wallet floor'); END;
    CREATE TRIGGER IF NOT EXISTS user_wallet_floor_update BEFORE UPDATE OF balance,gems ON users
    WHEN NEW.balance < min(0, OLD.balance) OR NEW.gems < min(0, OLD.gems)
    BEGIN SELECT RAISE(ABORT, 'wallet floor'); END;
  `);
  const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (!count) seed();
  ensurePloVariants();
  ensureRushLadder();
  ensureSpinTables();
  disableBattleRoyaleTables(db);
  ensureSeries();
}

// DanGG display names replace the GGPoker product names stored by older seeds. Pairs run in
// order (the exact uppercase/series forms before the bare words); no new name contains an
// old one, so a second boot changes nothing. Ids, game keys and modes are not touched.
export const BRAND_RENAMES = Object.freeze([
  ['Rush & Cash', 'Fast Fold'],
  ['Spin & Gold', 'Jackpot SNG'],
  ['Mystery Battle Royale', 'Battle Royale'],
  ['Flip & Go', 'Quick Flip'],
  ['Fish Buffet', 'Prize Wheel'],
  ['GG Care', 'Player Care'],
  ['Ocean Rewards', 'DanGG Rewards'],
  ['#ThanksGG', '#ThanksDanGG'],
  ['GGCheers', 'DanGG Cheers'],
  ['GGMasters', 'Masters'],
  ['Daily $100,000 Flipout', 'Daily Chip Flipout'],
  ['WSOP Express', 'Live Series'],
  ['WSOP EXPRESS', 'LIVE SERIES'],
  ['WSOP', 'Live Series'],
  ['GGMillion$', 'Millions'],
  ['PokerCraft', 'Hand History'],
].map(Object.freeze));
const BRAND_RENAME_COLUMNS = Object.freeze([
  ['tables', 'name'], ['tournaments', 'name'], ['banners', 'title'], ['banners', 'subtitle'],
]);

/** Renames stored GGPoker display names to DanGG ones; returns the number of changed rows. */
export function renameBrandNames() {
  let changed = 0;
  for (const [table, column] of BRAND_RENAME_COLUMNS) {
    const update = db.prepare(`UPDATE ${table} SET ${column} = replace(${column}, ?, ?) WHERE instr(${column}, ?) > 0`);
    for (const [from, to] of BRAND_RENAMES) changed += Number(update.run(from, to, from).changes);
  }
  const siteName = db.prepare(`UPDATE settings SET value = ? WHERE key = 'site_name' AND value IN (?, ?)`)
    .run(JSON.stringify('DanGG'), JSON.stringify('GGPoker'), JSON.stringify('GG Poker'));
  return changed + Number(siteName.changes);
}

function ensurePloVariants() {
  const ins = db.prepare(`INSERT OR IGNORE INTO tables
    (id,name,game,category,sb,bb,ante,min_buyin,max_buyin,seats,speed,featured,sort)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  let sort = 900;
  for (const [game, label] of [['omaha5', 'PLO5'], ['omaha6', 'PLO6']]) {
    for (let i = 1; i <= 6; i++) {
      ins.run(`${game}-platinum-${i}`, `${label} Platinum ${String(i).padStart(2, '0')}`, game, 'Platinum',
        500, 1000, 0, 20000, 100000, 6, 'Normal', 0, sort++);
    }
  }
}

// Jackpot SNG tables (P0 slice S1b): only the observed 3-max play-money stakes. Ids are
// deterministic so each boot inserts only missing rows; level-1 blinds come from the
// verified ladder. Starting chips and time-bank cards are unobserved and not configured.
const SPIN_TABLES_PER_STAKE = 4;
const SPIN_SORT_BASE = 950;

export function ensureSpinTables() {
  const ins = db.prepare(`INSERT OR IGNORE INTO tables
    (id,name,game,category,sb,bb,ante,min_buyin,max_buyin,seats,speed,featured,sort)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const sb = spinSmallBlinds[0];
  let inserted = 0;
  SPIN_STAKES.forEach((stake, stakeIndex) => {
    for (let i = 1; i <= SPIN_TABLES_PER_STAKE; i++) {
      const res = ins.run(`spingold-${stake}-${i}`, `Jackpot SNG ${stake.toLocaleString('en-US')} ${String(i).padStart(2, '0')}`,
        'spingold', 'Spin', sb, sb * 2, 0, stake, stake, SPIN_SEATS, 'Fast', 0,
        SPIN_SORT_BASE + stakeIndex * 10 + i);
      inserted += Number(res.changes);
    }
  });
  // Unobserved rows (the old 15,000 3-max and 30,000 6-max seeds) are switched off, never deleted.
  const stakes = SPIN_STAKES.join(',');
  const disabled = db.prepare(`UPDATE tables SET enabled = 0
    WHERE game = 'spingold' AND enabled = 1
      AND NOT (seats = ${SPIN_SEATS} AND min_buyin = max_buyin AND min_buyin IN (${stakes}))`).run().changes;
  return { inserted, disabled: Number(disabled) };
}

// Fast Fold stake ladder (P0 slice R2, plan § 4). One pool = game + sb/bb; table ids are
// deterministic, so each boot inserts only the rows that are missing. The Hold'em 500/1000
// pool keeps the original `rush-platinum-N` tables created by seed().
export const RUSH_LADDER = Object.freeze([
  { game: 'rush', label: 'Fast Fold', category: 'Bronze', sb: 50, bb: 100, tables: 4 },
  { game: 'rush', label: 'Fast Fold', category: 'Silver', sb: 100, bb: 200, tables: 4 },
  { game: 'rush', label: 'Fast Fold', category: 'Gold', sb: 250, bb: 500, tables: 4 },
  { game: 'rush', label: 'Fast Fold', category: 'Platinum', sb: 500, bb: 1000, tables: 8, idPrefix: 'rush-platinum' },
  { game: 'rush', label: 'Fast Fold', category: 'Diamond', sb: 1000, bb: 2000, tables: 4 },
  { game: 'rushplo', label: 'Fast Fold PLO', category: 'Silver', sb: 100, bb: 200, tables: 4 },
  { game: 'rushplo', label: 'Fast Fold PLO', category: 'Platinum', sb: 500, bb: 1000, tables: 4 },
].map(Object.freeze));
const RUSH_MIN_BUYIN_BB = 20;
const RUSH_MAX_BUYIN_BB = 100;
const RUSH_SEATS = 6;
const RUSH_SORT_BASE = 1000;

/** Inserts the missing Rush ladder tables; returns how many rows were added (0 when complete). */
export function ensureRushLadder() {
  const ins = db.prepare(`INSERT OR IGNORE INTO tables
    (id,name,game,category,sb,bb,ante,min_buyin,max_buyin,seats,speed,featured,sort)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  let inserted = 0;
  RUSH_LADDER.forEach((pool, poolIndex) => {
    const prefix = pool.idPrefix || `${pool.game}-${pool.sb}-${pool.bb}`;
    for (let i = 1; i <= pool.tables; i++) {
      const name = `${pool.label} ${pool.category} ${pool.sb}/${pool.bb} ${String(i).padStart(2, '0')}`;
      const res = ins.run(`${prefix}-${i}`, name, pool.game, pool.category, pool.sb, pool.bb, 0,
        pool.bb * RUSH_MIN_BUYIN_BB, pool.bb * RUSH_MAX_BUYIN_BB, RUSH_SEATS, 'Fast', 0,
        RUSH_SORT_BASE + poolIndex * 10 + i);
      inserted += Number(res.changes);
    }
  });
  return inserted;
}

function ensureSeries() {
  const tins = db.prepare(`INSERT INTO tournaments (id,name,buyin,fee,gtd,start_at,entrants,format) VALUES (?,?,?,?,?,?,?,?)`);
  for (const [id, name, buyin, fee, gtd, hours, fmt] of [
    ['flip-go', 'Quick Flip $20K', 2000, 200, 20000, 6, 'NLH'],
    ['wsop-express-2', 'Live Series $30K', 3000, 300, 30000, 10, 'NLH'],
  ]) {
    if (!db.prepare('SELECT 1 FROM tournaments WHERE id = ?').get(id)) {
      tins.run(id, name, buyin, fee, gtd * 100, new Date(Date.now() + hours * 3600_000).toISOString(), 300 + (gtd % 400), fmt);
    }
  }
  for (const [id, name, buyin, hours] of [
    ['sat-sunday', '$1 Step to Sunday Major', 1000, 8],
    ['sat-mid', '$5 Step to Sunday Major', 5000, 6],
    ['sat-high', '$25 Step to Sunday Major', 25000, 4],
  ]) {
    if (!db.prepare('SELECT 1 FROM tournaments WHERE id = ?').get(id)) {
      tins.run(id, name, buyin, Math.round(buyin * 0.1), 0, new Date(Date.now() + hours * 3600_000).toISOString(), 120, 'NLH');
      db.prepare("UPDATE tournaments SET mode='SATELLITE', ticket='Sunday Major $250K' WHERE id=?").run(id);
    }
  }
  // Battle Royale tiers (reference 11): seeded once, then left alone.
  for (const [id, name, buyin, gtd, hours, entrants] of [
    ['mbr-1', 'Battle Royale $5K', 25, 5000, 1.5, 1841],
    ['mbr-2', 'Battle Royale $10K', 100, 10000, 3, 1622],
    ['mbr-3', 'Battle Royale $30K', 300, 30000, 5, 1408],
    ['mbr-4', 'Battle Royale $100K', 1000, 100000, 8, 977],
    ['mbr-5', 'Battle Royale $250K', 2500, 250000, 12, 412],
  ]) {
    if (!db.prepare('SELECT 1 FROM tournaments WHERE id = ?').get(id)) {
      tins.run(id, name, buyin, 0, gtd * 100, new Date(Date.now() + hours * 3600_000).toISOString(), entrants, 'NLH');
    }
  }
  db.exec("UPDATE tournaments SET mode='MYSTERY', bounty=MAX(1, buyin/2), blind_speed=3 WHERE id LIKE 'mbr-%'");
  // The tiers seed up to 1,841 entrants, so the field cap must hold them (the default is 1,000).
  db.prepare("UPDATE tournaments SET max_players = ? WHERE id LIKE 'mbr-%' AND max_players < ?")
    .run(BATTLE_ROYALE_MAX_PLAYERS, BATTLE_ROYALE_MAX_PLAYERS);
  fixSeedFormats();
  db.exec("UPDATE tournaments SET mode='FLIP' WHERE name LIKE 'Quick Flip%' AND mode='STANDARD'");
  db.exec("UPDATE tournaments SET mode='BOUNTY', bounty=500 WHERE name LIKE 'Bounty Hunters%' AND mode='STANDARD'");
  db.exec("UPDATE tournaments SET mode='MYSTERY', bounty=1000 WHERE name LIKE 'Mystery Bounty%' AND mode='STANDARD'");
}

const BATTLE_ROYALE_MAX_PLAYERS = 2000;
// Seeded tournaments whose name names a game are dealt in that game (older seeds stored them as NLH).
const SEED_FORMAT_FIXES = Object.freeze([['t6', 'Omaha Weekly%', 'PLO'], ['t7', 'Short Deck%', 'Short Deck']]);

/** Aligns the seeded game-named tournaments with their format while nobody can be seated in them yet. */
function fixSeedFormats() {
  const update = db.prepare("UPDATE tournaments SET format = ? WHERE id = ? AND name LIKE ? AND format != ? AND status = 'registering'");
  for (const [id, pattern, format] of SEED_FORMAT_FIXES) update.run(format, id, pattern, format);
}

function seed() {
  const insertUser = db.prepare(
    `INSERT INTO users (login, nick, password, email, avatar, balance, play_chips, tickets, gems, xp, vip_level, vip_points, is_admin)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const adminPassword = process.env.GGPOKER_ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin123');
  if (process.env.NODE_ENV === 'production' && String(adminPassword).length < 16) {
    throw new Error('Set GGPOKER_ADMIN_PASSWORD to at least 16 characters before first production start');
  }
  const seedDemo = process.env.GGPOKER_SEED_DEMO !== '0' && process.env.NODE_ENV !== 'production';
  if (seedDemo) insertUser.run('DansiDanutz', 'DansiDanutz', hashPassword('ggpoker'), 'dansi@example.com', '', 1000000, 5000, 50, 1240, 8200, 5, 18400, 0);
  insertUser.run('admin', 'Administrator', hashPassword(adminPassword), 'admin@ggpoker.local', '', 100000000, 1000000, 999, 99999, 999999, 10, 999999, 1);
  if (seedDemo) insertUser.run('guest', 'Guest', hashPassword('guest'), '', '', 500000, 0, 0, 0, 0, 1, 0, 0);

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
    tables.push({ id: `rush-platinum-${i}`, name: `Fast Fold Platinum ${String(i).padStart(2, '0')}`, game: 'rush', category: 'Platinum', sb: 500, bb: 1000, ante: 0, min_buyin: 20000, max_buyin: 100000, seats: 6, speed: 'Fast', sort: sort++ });
  }
  for (let i = 1; i <= 8; i++) {
    tables.push({ id: `aof-gold-${i}`, name: `AoF Gold ${String(i).padStart(2, '0')}`, game: 'aof', category: 'Gold', sb: 500, bb: 1000, ante: 0, min_buyin: 20000, max_buyin: 40000, seats: 6, speed: 'Fast', sort: sort++ });
  }
  const ins = db.prepare(`INSERT INTO tables (id,name,game,category,sb,bb,ante,min_buyin,max_buyin,seats,speed,featured,sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const t of tables) ins.run(t.id, t.name, t.game, t.category, t.sb, t.bb, t.ante, t.min_buyin, t.max_buyin, t.seats, t.speed || 'Normal', t.featured || 0, t.sort);

  const now = Date.now();
  const tourneys = [
    ['Daily Chip Flipout', 2500, 250, 100000, 0.5, 'NLH'],
    ['Live Series $50K', 5000, 500, 50000, 1.5, 'NLH'],
    ['Bounty Hunters $30K', 1500, 150, 30000, 2.5, 'NLH'],
    ['Masters $150K', 11000, 1000, 150000, 4, 'NLH'],
    ['Mystery Bounty $200K', 5250, 500, 200000, 6, 'NLH'],
    ['Omaha Weekly $25K', 3000, 300, 25000, 9, 'PLO'],
    ['Short Deck $10K', 1000, 100, 10000, 12, 'Short Deck'],
    ['Jackpot SNG Challenge', 1000, 0, 5000, 15, 'NLH'],
    ['Sunday Major $250K', 22000, 2000, 250000, 20, 'NLH'],
    ['Turbo $15K', 750, 75, 15000, 24, 'NLH'],
    ['Freeroll $2,000', 0, 0, 2000, 30, 'NLH'],
    ['After The Fold $40K', 2000, 200, 40000, 36, 'NLH'],
  ];
  const tins = db.prepare(`INSERT INTO tournaments (id,name,buyin,fee,gtd,start_at,entrants,format) VALUES (?,?,?,?,?,?,?,?)`);
  let ti = 0;
  for (const [name, buyin, fee, gtd, hours, format] of tourneys) {
    ti++;
    tins.run(`t${ti}`, name, buyin, fee, gtd * 100, new Date(now + hours * 3600_000).toISOString(), 120 + ((ti * 337) % 800), format);
  }

  for (const [id, name, buyin, fee, gtd, hours, fmt] of [
    ['flip-go', 'Quick Flip $20K', 2000, 200, 20000, 6, 'NLH'],
    ['wsop-express-2', 'Live Series $30K', 3000, 300, 30000, 10, 'NLH'],
  ]) {
    if (!db.prepare('SELECT 1 FROM tournaments WHERE id = ?').get(id)) {
      tins.run(id, name, buyin, fee, gtd * 100, new Date(Date.now() + hours * 3600_000).toISOString(), 300 + gtd % 400, fmt);
    }
  }

  db.prepare(`INSERT INTO missions (id,title,description,goal,progress,reward,reward_kind,claimed,active,sort) VALUES
    ('daily-hands','Play 20 hands','Play any 20 hands in cash games',20,6,5000,'USD',0,1,1),
    ('daily-win','Win 3 pots','Win three pots in any Hold''em game',3,1,2500,'USD',0,1,2),
    ('daily-flop','See a flop 10 times','Reach the flop in 10 hands',10,4,1000,'PLAY',0,1,3),
    ('daily-tourney','Register a tournament','Join any tournament today',1,0,10,'TICKET',0,1,4),
    ('weekly-vip','Earn 500 VIP points','Play raked hands to earn points',500,120,50000,'USD',0,1,5)`).run();

  db.prepare(`INSERT INTO banners (slot,title,subtitle,image,link,sort) VALUES
    ('home','DAILY $100,000 FLIPOUT','#ThanksDanGG · DanGG Cheers','/assets/chrome/promo.png','/promotions',1),
    ('home','After The Fold','$40,000 Daily','/assets/chrome/tab_aof.png','/game/aof',2),
    ('tournaments','LIVE SERIES','Win your seat to the Main Event','/assets/chrome/promo.png','/tournaments',1),
    ('slots','GATES OF OLYMPUS','1000x max win','/assets/chrome/spin.png','/slots',1),
    ('casino','LIVE CASINO','Roulette · Blackjack · Baccarat','/assets/chrome/jackpot.png','/casino',1)`).run();

  const settings = {
    site_name: 'DanGG',
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

if (RESTORE_RESULT.applied) {
  db.prepare(`INSERT INTO audit_log (actor,action,detail) VALUES ('system','restore_applied',?)`)
    .run(RESTORE_RESULT.backupName ? `previous database kept as ${RESTORE_RESULT.backupName}` : 'no previous database');
}

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

export function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, JSON.stringify(value));
}

function walletWrite(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
}

function recordWalletEntry(userId, kind, amount, memo, currency = 'USD', opts = {}) {
  const { sessionId = null, reference = null, onDuplicate = 'throw', tournamentId = null } = opts;
  const col = currency === 'PLAY' ? 'play_chips' : currency === 'TICKET' ? 'tickets' : currency === 'GEM' ? 'gems' : 'balance';
  const row = db.prepare(`SELECT ${col} v FROM users WHERE id = ?`).get(userId);
  if (!row) throw new Error('user not found');
  if (opts.requiredFunds != null && row.v < opts.requiredFunds) {
    throw Object.assign(new Error(currency === 'GEM' ? 'Not enough gems' : 'Insufficient balance'), { status: 400 });
  }
  if (reference) {
    const predicted = row.v + amount;
    const sql = onDuplicate === 'skip'
      ? `INSERT INTO transactions (user_id,kind,currency,amount,balance_after,memo,session_id,reference,tournament_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,strftime('%Y-%m-%d %H:%M:%f','now')) ON CONFLICT(user_id,reference) DO NOTHING`
       : `INSERT INTO transactions (user_id,kind,currency,amount,balance_after,memo,session_id,reference,tournament_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,strftime('%Y-%m-%d %H:%M:%f','now'))`;
    const info = db.prepare(sql).run(userId, kind, currency, amount, predicted, memo || '', sessionId, reference, tournamentId);
    if (info.changes === 0) {
      return { applied: false, balance: row.v };
    }
    db.prepare(`UPDATE users SET ${col} = ? WHERE id = ?`).run(predicted, userId);
    return { applied: true, balance: predicted };
  }
  db.prepare(`UPDATE users SET ${col} = ${col} + ? WHERE id = ?`).run(amount, userId);
  const after = db.prepare(`SELECT ${col} v FROM users WHERE id = ?`).get(userId).v;
  db.prepare("INSERT INTO transactions (user_id,kind,currency,amount,balance_after,memo,session_id,tournament_id,created_at) VALUES (?,?,?,?,?,?,?,?,strftime('%Y-%m-%d %H:%M:%f','now'))")
    .run(userId, kind, currency, amount, after, memo || '', sessionId, tournamentId);
  return { applied: true, balance: after };
}

export function addTransactionEx(...args) {
  return walletWrite(() => recordWalletEntry(...args));
}

export function settleWager(userId, kind, stake, payout, memo, opts = {}) {
  if (!Number.isSafeInteger(stake) || stake <= 0 || !Number.isSafeInteger(payout) || payout < 0) throw new Error('Invalid wager');
  return addTransactionEx(userId, kind, payout - stake, memo, 'USD', { ...opts, requiredFunds: stake }).balance;
}

export function registerTournamentEntry(userId, t, entryId) {
  const total = t.buyin + t.fee;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid tournament entry price');
  walletWrite(() => {
    db.prepare('INSERT INTO tourney_regs(tournament_id,user_id,entry_id) VALUES(?,?,?)').run(t.id,userId,entryId);
    // Awards may arrive after seat cleanup has removed the registration.
    db.prepare('INSERT INTO tourney_award_entries VALUES(?,?,?) ON CONFLICT(tournament_id,user_id) DO UPDATE SET entry_id=excluded.entry_id').run(t.id,userId,entryId);
    recordWalletEntry(userId, 'tourney_buyin', -total, `Registration ${t.name}`, 'USD', {
      sessionId: entryId, tournamentId: t.id, reference: 'entry:' + entryId, requiredFunds: total,
    });
    db.prepare('UPDATE tournaments SET entrants=entrants+1 WHERE id=?').run(t.id);
  });
}

export function refundTournamentEntry(userId, t) {
  walletWrite(() => {
    const receipt = db.prepare(`SELECT x.amount,r.entry_id FROM tourney_regs r JOIN transactions x
      ON x.user_id=r.user_id AND x.tournament_id=r.tournament_id AND x.reference='entry:' || r.entry_id
      WHERE r.tournament_id=? AND r.user_id=? AND x.kind='tourney_buyin' AND x.currency='USD' AND x.amount<=0`).get(t.id,userId);
    if (!receipt) throw Object.assign(new Error('Entry receipt unavailable; contact support for reconciliation.'), { status: 409 });
    recordWalletEntry(userId, 'tourney_refund', -receipt.amount, `Unregistration ${t.name}`, 'USD', {
      sessionId: receipt.entry_id, tournamentId: t.id, reference: 'withdraw:' + receipt.entry_id,
    });
    db.prepare('UPDATE tourney_award_entries SET entry_id=NULL WHERE tournament_id=? AND user_id=? AND entry_id=?').run(t.id,userId,receipt.entry_id);
    db.prepare('DELETE FROM tourney_regs WHERE tournament_id=? AND user_id=?').run(t.id,userId);
    db.prepare('UPDATE tournaments SET entrants=MAX(0,entrants-1) WHERE id=?').run(t.id);
  });
}

function tournamentAwardSession(userId, tournamentId) {
  if (tournamentId) {
    const current = db.prepare('SELECT entry_id FROM tourney_award_entries WHERE tournament_id=? AND user_id=?').get(tournamentId,userId);
    if (current && !current.entry_id) throw new Error('Tournament entry was refunded; reconcile prize.');
    if (current) return current.entry_id;
  }
  const entries = tournamentId ? db.prepare(`SELECT e.session_id FROM transactions e
    WHERE e.user_id=? AND e.tournament_id=? AND e.kind='tourney_buyin' AND e.currency='USD'
    AND e.reference='entry:' || e.session_id AND NOT EXISTS (SELECT 1 FROM transactions r
      WHERE r.user_id=e.user_id AND r.reference='withdraw:' || e.session_id)
    ORDER BY e.id DESC LIMIT 2`).all(userId,tournamentId) : [];
  if (entries.length > 1) throw new Error('Ambiguous tournament entry; reconcile prize.');
  return entries[0]?.session_id;
}

export function awardSatelliteTicket(userId, tournamentId, memo) {
  return walletWrite(() => {
    const sessionId = tournamentAwardSession(userId, tournamentId);
    if (sessionId) {
      const reference = 'prize:' + sessionId;
      const prior = db.prepare('SELECT kind,amount FROM transactions WHERE user_id=? AND reference=?').get(userId, reference);
      if (prior && (prior.kind !== 'tourney_win' || prior.amount !== 0)) throw new Error('Conflicting tournament award; reconcile prize.');
      recordWalletEntry(userId, 'tourney_win', 0, memo, 'USD', { sessionId, tournamentId, reference, onDuplicate: 'skip' });
    }
    return recordWalletEntry(userId, 'satellite_win', 1, memo, 'TICKET', {
      sessionId, tournamentId, reference: tournamentId ? 'satellite:ticket:' + tournamentId : null, onDuplicate: 'skip',
    });
  });
}

export function recordTournamentPrize(userId, tournamentId, kind, amount, memo, awardReference = null) {
  return walletWrite(() => {
    const sessionId = tournamentAwardSession(userId, tournamentId);
    if (!sessionId && amount === 0) return;
    const reference = awardReference ?? (sessionId ? 'prize:' + sessionId : null);
    if (reference) {
      const prior = db.prepare('SELECT kind,amount FROM transactions WHERE user_id=? AND reference=?').get(userId,reference);
      if (prior) {
        if (prior.amount !== amount || prior.kind !== kind) throw new Error('Conflicting tournament award; reconcile prize.');
        return false;
      }
    }
    recordWalletEntry(userId, kind, amount, memo, 'USD', { tournamentId, sessionId, reference });
    return true;
  });
}

export function buyOceanItem(userId, item) {
  const memo = `Ocean store: ${item.name}`;
  walletWrite(() => {
    recordWalletEntry(userId, 'ocean_spend', -item.cost, memo, 'GEM', { requiredFunds: item.cost });
    recordWalletEntry(userId, 'ocean', item.amount, memo, item.kind);
  });
}

export function addTransaction(userId, kind, amount, memo, currency = 'USD', opts = {}) {
  return addTransactionEx(userId, kind, amount, memo, currency, opts).balance;
}

export function openSessions() {
  return db.prepare(`SELECT t.user_id, t.session_id,
      -SUM(CASE WHEN t.kind IN ('buyin','rebuy','chips_refund','remove_chips') THEN t.amount ELSE 0 END) AS chips_in
    FROM transactions t
    WHERE t.session_id IS NOT NULL
    GROUP BY t.user_id, t.session_id
    HAVING SUM(CASE WHEN t.reference LIKE 'out:%' OR t.reference LIKE 'refund:%' THEN 1 ELSE 0 END) = 0
       AND -SUM(CASE WHEN t.kind IN ('buyin','rebuy','chips_refund','remove_chips') THEN t.amount ELSE 0 END) > 0`).all();
}

export function refundOpenSessions(options = {}) {
  const refund = options.refund || addTransactionEx;
  let refunded = 0;
  for (const s of openSessions()) {
    try {
      const tableId = String(s.session_id).split(':')[0] || 'table';
      const award = refund(s.user_id, 'buyin_refund', s.chips_in, `Crash refund ${tableId}`, 'USD', {
        sessionId: s.session_id, reference: `refund:${s.session_id}`, onDuplicate: 'skip',
      });
      if (award.applied) refunded++;
    } catch (e) {
      console.error('refund session failed', s.session_id, e && e.message);
    }
  }
  return refunded;
}

export function getClaim(userId, kind, periodKey) {
  return db.prepare('SELECT * FROM player_claims WHERE user_id = ? AND kind = ? AND period_key = ?').get(userId, kind, periodKey);
}

export function claimReward(userId, kind, periodKey, amount, currency = 'USD', memo = '') {
  db.prepare(`INSERT INTO player_claims (user_id, kind, period_key, progress, claimed, amount)
    VALUES (?,?,?,0,0,0) ON CONFLICT(user_id, kind, period_key) DO NOTHING`).run(userId, kind, periodKey);
  const row = getClaim(userId, kind, periodKey);
  if (row.claimed) return { claimed: false, amount: row.amount };
  const reference = `claim:${kind}:${periodKey}`;
  const award = addTransactionEx(userId, kind, amount, memo || `${kind} reward`, currency, {
    reference, onDuplicate: 'skip',
  });
  let paid = amount;
  if (!award.applied) {
    const prior = db.prepare('SELECT amount FROM transactions WHERE user_id = ? AND reference = ?').get(userId, reference);
    if (prior) paid = prior.amount;
  }
  db.prepare(`UPDATE player_claims SET claimed = 1, amount = ?, updated_at = datetime('now')
    WHERE user_id = ? AND kind = ? AND period_key = ?`).run(paid, userId, kind, periodKey);
  return { claimed: true, amount: paid, balance: award.balance, reapplied: !award.applied };
}

export function missionPeriodKey(missionId, now = Date.now()) {
  const d = new Date(now);
  if (String(missionId).startsWith('weekly-')) {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dow = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dow);
    const year = t.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const week = Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
    return `mission:${missionId}:week:${year}-W${String(week).padStart(2, '0')}`;
  }
  return `mission:${missionId}:day:${d.toISOString().slice(0, 10)}`;
}

export function bumpMission(userId, missionId, delta = 1) {
  const m = db.prepare('SELECT goal FROM missions WHERE id = ?').get(missionId);
  if (!m) return;
  const period = missionPeriodKey(missionId);
  db.prepare(`INSERT INTO player_claims (user_id, kind, period_key, progress, claimed, amount)
    VALUES (?, 'mission', ?, 0, 0, 0) ON CONFLICT(user_id, kind, period_key) DO NOTHING`).run(userId, period);
  db.prepare(`UPDATE player_claims SET progress = MIN(?, progress + ?), updated_at = datetime('now')
    WHERE user_id = ? AND kind = 'mission' AND period_key = ?`).run(m.goal, delta, userId, period);
}

export function setMissionDone(userId, missionId) {
  const m = db.prepare('SELECT goal FROM missions WHERE id = ?').get(missionId);
  if (!m) return;
  const period = missionPeriodKey(missionId);
  db.prepare(`INSERT INTO player_claims (user_id, kind, period_key, progress, claimed, amount)
    VALUES (?, 'mission', ?, ?, 0, 0)
    ON CONFLICT(user_id, kind, period_key) DO UPDATE SET progress = excluded.progress, updated_at = datetime('now')`).run(userId, period, m.goal);
}

export function createAccountWithSession(login, nick, password, email, device) {
  const hashed = hashPassword(password);
  return walletWrite(() => {
    const welcome = getSetting('welcome_bonus', 100000);
    const start = getSetting('default_balance', 5000) + welcome;
    const { lastInsertRowid: id } = db.prepare('INSERT INTO users (login,nick,password,email,balance,tickets) VALUES (?,?,?,?,0,5)').run(login,nick,hashed,email);
    recordWalletEntry(id, 'welcome', start, 'Welcome bonus');
    db.prepare("INSERT INTO bonus_claims (user_id,claim_key,amount) VALUES (?,'welcome',?)").run(id,welcome);
    return { user: db.prepare('SELECT * FROM users WHERE id=?').get(id), token: newSession(id, device) };
  });
}

export function sessionHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function newSession(userId, device = '') {
  const token = randomUUID();
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  db.prepare('INSERT INTO sessions (token,device_id,user_id,expires_at,device) VALUES (?,?,?,?,?)').run(sessionHash(token), randomUUID(), userId, expires, String(device).slice(0, 160));
  return token;
}

export function userByToken(token) {
  if (!token) return null;
  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND julianday(s.expires_at) > julianday('now') AND u.deleted_at IS NULL`).get(sessionHash(token));
  return row || null;
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, login: u.login, nick: u.nick, email: u.email, avatar: u.avatar,
    is_guest: /^guest_[0-9a-f]{8}-[0-9a-f]{3}$/.test(u.login),
    balance: u.balance, play_chips: u.play_chips, tickets: u.tickets, gems: u.gems,
    xp: u.xp, vip_level: u.vip_level, vip_points: u.vip_points, elo: u.elo ?? 1000, is_admin: !!u.is_admin,
    banned: !!u.banned, chat_muted: !!u.chat_muted, country: u.country, created_at: u.created_at,
  };
}
