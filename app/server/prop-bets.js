// Player-created prop bets, settled by the server in play money.
//
//  - Last Longer: players registered in the same tournament stake the same amount;
//    whoever busts last (or wins) takes the pot.
//  - Bankroll / ELO Challenge: the creator sets a goal and a 1-100 day window, and
//    bettors take the other side 1:1. Bankroll counts only settled game results, so
//    cashier top-ups cannot fake progress; ELO uses the per-hand rating.
//
// Every stake, refund and payout carries a unique ledger reference, so a sweep that
// runs twice (or a crash between steps) never pays twice.

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const PROP_BET_RULES = Object.freeze({
  last_longer: { minAmount: 100, maxAmount: 1_000_000, minBettors: 1, maxBettors: 8, minLeadMs: 3 * MINUTE },
  bankroll: { minAmount: 100, maxAmount: 1_000_000, minBettors: 0, maxBettors: 10, minGoal: 100, maxGoal: 100_000_000 },
  elo: { minAmount: 100, maxAmount: 1_000_000, minBettors: 0, maxBettors: 10, minGoal: 300, maxGoal: 4_000 },
});

const CHALLENGE_MIN_MS = DAY;
const CHALLENGE_MAX_MS = 100 * DAY;
/** A Last Longer whose tournament never finishes is refunded after this long. */
const LAST_LONGER_EXPIRY_MS = 2 * DAY;

/** Ledger kinds that are real game results (cashier, bonuses and prop bets excluded). */
export const GAME_RESULT_KINDS = Object.freeze([
  'buyin', 'rebuy', 'cashout', 'session_close', 'chips_refund', 'remove_chips',
  'tourney_buyin', 'tourney_payout', 'tourney_win', 'tourney_refund', 'bounty', 'mystery_bounty',
  'spin_payout', 'slots', 'roulette', 'crash_bet', 'crash_win', 'blackjack', 'bad_beat_jackpot',
]);

export class PropBetError extends Error {}

const fail = (message) => { throw new PropBetError(message); };

/** Parse an ISO or SQLite ("YYYY-MM-DD HH:MM:SS", UTC) timestamp to ms. */
export function parseTime(value) {
  if (typeof value === 'number') return value;
  const text = String(value || '');
  const sqlite = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(text) ? `${text.replace(' ', 'T')}Z` : text;
  const ms = Date.parse(sqlite);
  return Number.isFinite(ms) ? ms : NaN;
}

function intIn(value, min, max, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) fail(`${label} must be between ${min} and ${max}`);
  return n;
}

/**
 * @param {{ db: import('node:sqlite').DatabaseSync,
 *           ledger: (userId:number, kind:string, amount:number, memo:string, reference:string) => { applied: boolean },
 *           now?: () => number }} deps
 */
export function createPropBets({ db, ledger, now = Date.now }) {
  const ensureSchema = () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS prop_bets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        creator_id INTEGER NOT NULL,
        tournament_id TEXT,
        amount INTEGER NOT NULL,
        max_bettors INTEGER NOT NULL,
        goal INTEGER,
        target INTEGER,
        start_at INTEGER NOT NULL,
        end_at INTEGER,
        status TEXT NOT NULL DEFAULT 'open',
        winner_id INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS prop_bet_entries (
        bet_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        side TEXT NOT NULL,
        stake INTEGER NOT NULL,
        out_seq INTEGER,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (bet_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS prop_bets_status ON prop_bets(status, start_at);
    `);
  };

  const getBet = (id) => db.prepare('SELECT * FROM prop_bets WHERE id = ?').get(Number(id));
  const entriesOf = (betId) => db.prepare('SELECT * FROM prop_bet_entries WHERE bet_id = ?').all(betId);
  const bettorsOf = (betId) => db.prepare("SELECT * FROM prop_bet_entries WHERE bet_id = ? AND side = 'bettor'").all(betId);
  const balanceOf = (userId) => Number(db.prepare('SELECT balance FROM users WHERE id = ? AND deleted_at IS NULL').get(userId)?.balance ?? NaN);
  const isRegistered = (tournamentId, userId) => !!db.prepare('SELECT 1 FROM tourney_regs WHERE tournament_id = ? AND user_id = ?').get(tournamentId, userId);
  const tournament = (id) => db.prepare('SELECT id, name, start_at, status FROM tournaments WHERE id = ?').get(String(id || ''));

  const requireFunds = (userId, amount) => {
    const balance = balanceOf(userId);
    if (!Number.isFinite(balance)) fail('Account not found');
    if (balance < amount) fail('Not enough balance for this stake');
  };

  const pay = (bet, userId, amount, what) => {
    if (amount === 0) return;
    ledger(userId, amount < 0 ? 'propbet_stake' : `propbet_${what}`, amount,
      `Prop bet #${bet.id} ${PROP_LABEL[bet.type]} — ${what}`, `propbet:${bet.id}:${userId}:${what}`);
  };

  const setStatus = (bet, status, winnerId = null) => {
    db.prepare('UPDATE prop_bets SET status = ?, winner_id = ? WHERE id = ?').run(status, winnerId, bet.id);
  };

  const refundAll = (bet) => {
    for (const e of entriesOf(bet.id)) pay(bet, e.user_id, e.stake, 'refund');
    setStatus(bet, 'refunded');
  };

  // ---------- create / join ----------

  const createLastLonger = (userId, input, rules) => {
    const t = tournament(input.tournamentId);
    if (!t || !isRegistered(t.id, userId)) fail('Register to a tournament first to create a Last Longer prop bet');
    const startAt = parseTime(t.start_at);
    if (t.status !== 'registering' || startAt - now() < rules.minLeadMs) {
      fail('Register to a tournament with at least 3 minutes left to start to create a Last Longer prop bet');
    }
    const amount = intIn(input.amount, rules.minAmount, rules.maxAmount, 'Bet amount');
    const maxBettors = intIn(input.maxBettors, rules.minBettors, rules.maxBettors, 'Players');
    const taken = db.prepare("SELECT 1 FROM prop_bets WHERE type = 'last_longer' AND tournament_id = ? AND creator_id = ? AND status IN ('open','running')").get(t.id, userId);
    if (taken) fail('You already have a Last Longer for this tournament');
    requireFunds(userId, amount);
    return { tournamentId: t.id, amount, maxBettors, goal: null, startAt, endAt: null, escrow: amount };
  };

  const createChallenge = (userId, input, rules) => {
    const amount = intIn(input.amount, rules.minAmount, rules.maxAmount, 'Bet amount');
    const maxBettors = intIn(input.maxBettors, rules.minBettors, rules.maxBettors, 'Bettors');
    const goal = intIn(input.goal, rules.minGoal, rules.maxGoal, 'Challenge goal');
    const startAt = parseTime(input.startAt);
    const endAt = parseTime(input.endAt);
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) fail('Pick a start and an end time');
    if (startAt < now() - MINUTE) fail('The start time is in the past');
    if (endAt - startAt < CHALLENGE_MIN_MS) fail('A challenge must last at least 1 day');
    if (endAt - startAt > CHALLENGE_MAX_MS) fail('A challenge can last at most 100 days');
    const escrow = amount * maxBettors;
    requireFunds(userId, escrow);
    return { tournamentId: null, amount, maxBettors, goal, startAt, endAt, escrow };
  };

  const create = (userId, input = {}) => {
    const type = String(input.type || '');
    const rules = PROP_BET_RULES[type];
    if (!rules) fail('Unknown prop bet type');
    const spec = type === 'last_longer' ? createLastLonger(userId, input, rules) : createChallenge(userId, input, rules);
    const info = db.prepare(`INSERT INTO prop_bets (type,creator_id,tournament_id,amount,max_bettors,goal,start_at,end_at,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(type, userId, spec.tournamentId, spec.amount, spec.maxBettors, spec.goal, spec.startAt, spec.endAt, now());
    const bet = getBet(info.lastInsertRowid);
    db.prepare('INSERT INTO prop_bet_entries (bet_id,user_id,side,stake,joined_at) VALUES (?,?,?,?,?)')
      .run(bet.id, userId, 'creator', spec.escrow, now());
    pay(bet, userId, -spec.escrow, 'stake');
    return detail(bet.id);
  };

  const join = (userId, betId) => {
    const bet = getBet(betId);
    if (!bet) fail('Prop bet not found');
    if (bet.status !== 'open' || now() >= bet.start_at) fail('This prop bet is closed');
    if (bet.type !== 'last_longer' && bet.creator_id === userId) fail('You cannot bet against your own challenge');
    if (db.prepare('SELECT 1 FROM prop_bet_entries WHERE bet_id = ? AND user_id = ?').get(bet.id, userId)) fail('You are already in this prop bet');
    if (bet.type === 'last_longer' && !isRegistered(bet.tournament_id, userId)) fail('Register to this tournament first to join its Last Longer');
    if (bettorsOf(bet.id).length >= bet.max_bettors) fail('This prop bet is full');
    requireFunds(userId, bet.amount);
    db.prepare('INSERT INTO prop_bet_entries (bet_id,user_id,side,stake,joined_at) VALUES (?,?,?,?,?)')
      .run(bet.id, userId, 'bettor', bet.amount, now());
    pay(bet, userId, -bet.amount, 'stake');
    return detail(bet.id);
  };

  // ---------- settlement ----------

  const recordBust = (tournamentId, userId) => {
    const rows = db.prepare(`SELECT e.bet_id FROM prop_bet_entries e JOIN prop_bets b ON b.id = e.bet_id
      WHERE b.type = 'last_longer' AND b.tournament_id = ? AND b.status IN ('open','running') AND e.user_id = ? AND e.out_seq IS NULL`)
      .all(String(tournamentId), Number(userId));
    for (const { bet_id: betId } of rows) {
      const seq = Number(db.prepare('SELECT COALESCE(MAX(out_seq), 0) m FROM prop_bet_entries WHERE bet_id = ?').get(betId).m) + 1;
      db.prepare('UPDATE prop_bet_entries SET out_seq = ? WHERE bet_id = ? AND user_id = ?').run(seq, betId, userId);
    }
  };

  /** Survivors first, then the latest to bust. */
  const outOrder = (e) => e.out_seq ?? Number.MAX_SAFE_INTEGER;
  const rankLastLonger = (entries) => [...entries].sort((a, b) => outOrder(b) - outOrder(a));

  const settleLastLonger = (bet) => {
    const t = tournament(bet.tournament_id);
    if (bet.status === 'open') {
      const started = !t || t.status !== 'registering' || now() >= bet.start_at;
      if (!started) {
        // Players who unregistered from the tournament leave the bet with their stake.
        for (const e of entriesOf(bet.id)) {
          if (isRegistered(bet.tournament_id, e.user_id)) continue;
          if (e.side === 'creator') return refundAll(bet);
          pay(bet, e.user_id, e.stake, 'refund');
          db.prepare('DELETE FROM prop_bet_entries WHERE bet_id = ? AND user_id = ?').run(bet.id, e.user_id);
        }
        return;
      }
      if (entriesOf(bet.id).length < 2) return refundAll(bet);
      setStatus(bet, 'running');
      bet = getBet(bet.id);
    }
    if (!t || t.status === 'crashed' || now() - bet.start_at > LAST_LONGER_EXPIRY_MS) return refundAll(bet);
    if (t.status !== 'completed') return;
    const entries = entriesOf(bet.id);
    const ranked = rankLastLonger(entries);
    const top = ranked.filter((e) => (e.out_seq ?? null) === (ranked[0].out_seq ?? null));
    const pot = entries.reduce((sum, e) => sum + e.stake, 0);
    const share = Math.floor(pot / top.length);
    top.forEach((e, i) => pay(bet, e.user_id, share + (i === 0 ? pot - share * top.length : 0), 'win'));
    setStatus(bet, 'settled', top.length === 1 ? top[0].user_id : null);
  };

  const challengeProgress = (bet) => {
    if (bet.type === 'elo') return Number(db.prepare('SELECT elo FROM users WHERE id = ?').get(bet.creator_id)?.elo ?? 0);
    const kinds = GAME_RESULT_KINDS;
    return Number(db.prepare(`SELECT COALESCE(SUM(amount), 0) s FROM transactions
      WHERE user_id = ? AND kind IN (${kinds.map(() => '?').join(',')})
        AND CAST(strftime('%s', created_at) AS INTEGER) * 1000 BETWEEN ? AND ?`)
      .get(bet.creator_id, ...kinds, bet.start_at, Math.min(bet.end_at, now())).s);
  };

  const settleChallenge = (bet) => {
    if (bet.status === 'open') {
      if (now() < bet.start_at) return;
      const filled = bettorsOf(bet.id).length;
      pay(bet, bet.creator_id, (bet.max_bettors - filled) * bet.amount, 'unfilled');
      const target = bet.type === 'elo' ? challengeProgress(bet) + bet.goal : bet.goal;
      db.prepare("UPDATE prop_bets SET status = 'running', target = ? WHERE id = ?").run(target, bet.id);
      bet = getBet(bet.id);
    }
    const bettors = bettorsOf(bet.id);
    if (challengeProgress(bet) >= bet.target) {
      pay(bet, bet.creator_id, 2 * bet.amount * bettors.length, 'win');
      return setStatus(bet, 'settled', bet.creator_id);
    }
    if (now() < bet.end_at) return;
    for (const b of bettors) pay(bet, b.user_id, 2 * bet.amount, 'win');
    setStatus(bet, 'settled', bettors.length === 1 ? bettors[0].user_id : null);
  };

  const sweep = () => {
    const live = db.prepare("SELECT * FROM prop_bets WHERE status IN ('open','running') ORDER BY id").all();
    for (const bet of live) {
      try {
        if (bet.type === 'last_longer') settleLastLonger(bet);
        else settleChallenge(bet);
      } catch (error) {
        console.error('prop bet settle failed', bet.id, error && error.message);
      }
    }
  };

  // ---------- read models ----------

  const nickOf = (userId) => db.prepare('SELECT nick FROM users WHERE id = ?').get(userId)?.nick || 'Player';

  const summary = (bet) => {
    const entries = entriesOf(bet.id);
    const t = bet.tournament_id ? tournament(bet.tournament_id) : null;
    return {
      id: bet.id,
      type: bet.type,
      status: bet.status,
      creatorId: bet.creator_id,
      creatorNick: nickOf(bet.creator_id),
      amount: bet.amount,
      maxBettors: bet.max_bettors,
      bettors: entries.filter((e) => e.side === 'bettor').length,
      players: entries.length,
      pot: entries.reduce((sum, e) => sum + e.stake, 0),
      goal: bet.goal,
      target: bet.target,
      progress: bet.type !== 'last_longer' && bet.status === 'running' ? challengeProgress(bet) : null,
      tournamentId: bet.tournament_id,
      tournamentName: t?.name || null,
      startAt: bet.start_at,
      endAt: bet.end_at,
      winnerId: bet.winner_id,
      winnerNick: bet.winner_id ? nickOf(bet.winner_id) : null,
    };
  };

  function detail(id) {
    const bet = getBet(id);
    if (!bet) return null;
    const entries = bet.type === 'last_longer' ? rankLastLonger(entriesOf(bet.id)) : entriesOf(bet.id);
    return {
      ...summary(bet),
      entries: entries.map((e) => ({ userId: e.user_id, nick: nickOf(e.user_id), side: e.side, stake: e.stake, out: e.out_seq != null })),
    };
  }

  const list = ({ type = '', includeClosed = false, limit = 60 } = {}) => {
    const statuses = includeClosed ? ['open', 'running', 'settled', 'refunded'] : ['open', 'running'];
    const rows = db.prepare(`SELECT * FROM prop_bets WHERE status IN (${statuses.map(() => '?').join(',')})
      ${PROP_BET_RULES[type] ? 'AND type = ?' : ''} ORDER BY (status = 'open') DESC, start_at ASC LIMIT ?`)
      .all(...statuses, ...(PROP_BET_RULES[type] ? [type] : []), Math.min(200, Math.max(1, Number(limit) || 60)));
    return rows.map(summary);
  };

  /** Tournaments this player may open a Last Longer on. */
  const eligibleTournaments = (userId) => db.prepare(`SELECT t.id, t.name, t.start_at, t.buyin FROM tournaments t
      JOIN tourney_regs r ON r.tournament_id = t.id AND r.user_id = ? WHERE t.status = 'registering'`).all(userId)
    .filter((t) => parseTime(t.start_at) - now() >= PROP_BET_RULES.last_longer.minLeadMs)
    .map((t) => ({ id: t.id, name: t.name, startAt: parseTime(t.start_at), buyin: t.buyin }));

  return { ensureSchema, create, join, recordBust, sweep, detail, list, eligibleTournaments };
}

const PROP_LABEL = { last_longer: 'Last Longer', bankroll: 'Bankroll Challenge', elo: 'ELO Challenge' };
