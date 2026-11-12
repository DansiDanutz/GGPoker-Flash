// Rush & Cash pool rules (P0 slice R4): the Cash Drop.
//
// DanGG rule, not native evidence: neither the native client capture nor the Codex replica
// shows Cash Drop mechanics (see docs/designs/p0-design-plan.md § 4). Until slice R0
// provides evidence, the rule is an admin setting:
//   rush_cashdrop_rate       chance per saved Rush hand that a drop fires (0..1)
//   rush_cashdrop_amount_bb  flat drop size as a multiple of the table's big blind
// The drop never depends on the pot. Selection uses a crypto RNG by default and the
// ledger write is keyed by hand id, so a retried hand save cannot pay twice.
import { randomInt } from 'node:crypto';
import { isRushGame } from './validate.js';

export const CASHDROP_RULE_LABEL = 'DanGG rule';
export const CASHDROP_KIND = 'cashdrop';
export const CASHDROP_MEMO = 'Fast Fold cash drop';

export const CASHDROP_SETTING_KEYS = Object.freeze({
  rate: 'rush_cashdrop_rate',
  amountBb: 'rush_cashdrop_amount_bb',
});

// The previous hardcoded rule fired 12% of hands and capped the drop at 5,000 on the
// 500/1,000 Rush tables, i.e. 5 big blinds.
export const CASHDROP_DEFAULTS = Object.freeze({ rate: 0.12, amountBb: 5 });

export const CASHDROP_LIMITS = Object.freeze({
  rate: Object.freeze({ min: 0, max: 1 }),
  amountBb: Object.freeze({ min: 0, max: 1000 }),
});

const RNG_RESOLUTION = 2 ** 47; // randomInt requires max - min < 2^48

/** Uniform float in [0, 1) from the OS CSPRNG. */
export function cryptoRng() {
  return randomInt(0, RNG_RESOLUTION) / RNG_RESOLUTION;
}

function checkNumber(value, { min, max }, label, { integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return `${label} must be a number`;
  if (value < min || value > max) return `${label} must be between ${min} and ${max}`;
  if (integer && !Number.isInteger(value)) return `${label} must be a whole number`;
  return null;
}

/**
 * Validate the Cash Drop keys of an admin settings payload. Keys that are absent are
 * ignored; present keys must be in range. Returns the list of error messages.
 */
export function validateCashDropSettings(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') return errors;
  if (CASHDROP_SETTING_KEYS.rate in payload) {
    const err = checkNumber(payload[CASHDROP_SETTING_KEYS.rate], CASHDROP_LIMITS.rate, CASHDROP_SETTING_KEYS.rate);
    if (err) errors.push(err);
  }
  if (CASHDROP_SETTING_KEYS.amountBb in payload) {
    const err = checkNumber(payload[CASHDROP_SETTING_KEYS.amountBb], CASHDROP_LIMITS.amountBb,
      CASHDROP_SETTING_KEYS.amountBb, { integer: true });
    if (err) errors.push(err);
  }
  return errors;
}

/** Read the configured rule; a stored value that is out of range falls back to the default. */
export function readCashDropConfig(getSetting) {
  const rate = getSetting(CASHDROP_SETTING_KEYS.rate, CASHDROP_DEFAULTS.rate);
  const amountBb = getSetting(CASHDROP_SETTING_KEYS.amountBb, CASHDROP_DEFAULTS.amountBb);
  return Object.freeze({
    rate: checkNumber(rate, CASHDROP_LIMITS.rate, 'rate') ? CASHDROP_DEFAULTS.rate : rate,
    amountBb: checkNumber(amountBb, CASHDROP_LIMITS.amountBb, 'amountBb', { integer: true })
      ? CASHDROP_DEFAULTS.amountBb : amountBb,
    rule: CASHDROP_RULE_LABEL,
  });
}

/** Drop size for a stake: big blind × configured multiple (never a fraction of the pot). */
export function cashDropAmount(bb, config) {
  const blind = Number(bb);
  if (!Number.isFinite(blind) || blind <= 0) return 0;
  return Math.round(blind * config.amountBb);
}

export function cashDropReference(handId) {
  return `cashdrop:${handId}`;
}

/**
 * Decide whether a drop fires for one hand and who receives it. Pure: the caller
 * supplies the eligible players and the RNG. Returns null when no drop fires.
 */
export function rollCashDrop({ bb, candidates, config, rng = cryptoRng }) {
  if (!candidates?.length || config.rate <= 0) return null;
  if (rng() >= config.rate) return null;
  const amount = cashDropAmount(bb, config);
  if (amount <= 0) return null;
  const pick = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
  const lucky = candidates[pick];
  return Object.freeze({ userId: lucky.id, nick: lucky.nick, amount });
}

/**
 * Settle the Cash Drop for a saved Rush hand.
 * ledger.hasDrop(reference) → boolean and ledger.credit(userId, amount, memo, reference)
 * → boolean (true when a new row was written). A hand without an id never drops, so
 * every paid drop is idempotent on hand-save retry.
 */
export function settleCashDrop({ handId, bb, candidates, config, ledger, rng = cryptoRng }) {
  if (!handId) return null;
  const reference = cashDropReference(handId);
  if (ledger.hasDrop(reference)) return null;
  const drop = rollCashDrop({ bb, candidates, config, rng });
  if (!drop) return null;
  const written = ledger.credit(drop.userId, drop.amount, CASHDROP_MEMO, reference);
  return written ? Object.freeze({ ...drop, reference, rule: CASHDROP_RULE_LABEL }) : null;
}

/**
 * The SQLite-backed ledger used by settleCashDrop: one `cashdrop` transaction per hand,
 * keyed by `cashdrop:<handId>` (unique per user, and checked across users before rolling).
 */
export function createCashDropLedger(db, addTransactionEx) {
  const findDrop = db.prepare('SELECT 1 FROM transactions WHERE kind = ? AND reference = ?');
  return Object.freeze({
    hasDrop: (reference) => !!findDrop.get(CASHDROP_KIND, reference),
    credit: (userId, amount, memo, reference) =>
      addTransactionEx(userId, CASHDROP_KIND, amount, memo, 'USD', { reference, onDuplicate: 'skip' }).applied,
  });
}

/* ------------------------------------------------------------------ */
/* Rush pools (P0 slices R1, R5): fair queue, transfer and Cash Drop  */
/* ------------------------------------------------------------------ */

/** A Rush pool is every enabled table of one game at one stake. */
export function poolKeyOf({ game, sb, bb }) {
  return `${game}:${Number(sb)}/${Number(bb)}`;
}

/** The pool a live table belongs to, as the fields its key is built from. */
export function poolOf(table) {
  const { game, sb, bb } = table.cfg;
  return Object.freeze({ game, sb, bb, key: poolKeyOf({ game, sb, bb }) });
}

function notifyClient(entry, userId, payload) {
  if (!entry) return;
  for (const client of entry.clients) {
    if (client.userId === userId && client.readyState === 1) client.send(JSON.stringify(payload));
  }
}

/** Flushes a waiting player may be passed over by a newer arrival while their old hand runs. */
export const RUSH_MAX_PASSES = 2;

const SETTLED_STREETS = Object.freeze(['ended', 'idle']);
const NO_QUEUE = Object.freeze([]);

/** FIFO by arrival time, then by arrival sequence for equal timestamps. */
function byArrival(a, b) {
  return a.since - b.since || a.seq - b.seq;
}

/**
 * The live Rush pools: players who folded (`rushQueued`) move to the emptiest other table
 * of the same pool after the hand, or wait in the pool queue until a seat opens there.
 * A transfer never leaves the pool, so it never crosses stakes.
 *
 * Queue fairness (P0 slice R5): each pool has one FIFO ordered by arrival (`since`). An open
 * seat anywhere in the pool goes to the oldest waiting player who can take it; a new folder
 * joins the back of a non-empty queue instead of taking a seat ahead of it. A waiting player
 * whose previous table is still mid-hand can be passed over by a newer arrival, but at most
 * RUSH_MAX_PASSES flushes: after that the pool's open seats are held for them.
 *
 * deps:
 *   listPoolTableIds(pool)        ids of the enabled tables in a pool ({ game, sb, bb, key })
 *   getLiveTable(id)              the live PokerTable for an id (opened on demand) or null
 *   getEntry(id)                  the live entry ({ table, clients }) or undefined
 *   findUser(userId)              the users row or undefined
 *   cashOutSeat(table, userId, reason), seatHuman(table, user, buyin, seat) → { ok }
 *   broadcastState(table)
 *   isRealUser(userId)            true when the id is a stored user (Cash Drop eligibility)
 *   getSetting(key, fallback), ledger (createCashDropLedger)
 */
export function createRushPool(deps) {
  const now = deps.now || Date.now;
  // poolKey -> frozen array of frozen entries, oldest first:
  // { userId, user, stack, pool, fromTable, since, seq, passes }
  const queues = new Map();
  let arrivals = 0; // tie-break for equal `since`

  const queueFor = (key) => queues.get(key) || NO_QUEUE;

  function setQueue(key, list) {
    if (list.length) queues.set(key, Object.freeze(list));
    else queues.delete(key);
  }

  function findWaiting(userId) {
    for (const list of queues.values()) {
      const entry = list.find((w) => w.userId === userId);
      if (entry) return entry;
    }
    return null;
  }

  function dequeue(userId) {
    const entry = findWaiting(userId);
    if (entry) setQueue(entry.pool.key, queueFor(entry.pool.key).filter((w) => w.userId !== userId));
  }

  function enqueue({ user, stack, pool, fromTable }) {
    dequeue(user.id);
    const entry = Object.freeze({
      userId: user.id, user, stack, pool, fromTable, since: now(), seq: arrivals++, passes: 0,
    });
    setQueue(pool.key, [...queueFor(pool.key), entry].sort(byArrival));
  }

  function countPasses(key, passedIds) {
    if (!passedIds.size) return;
    setQueue(key, queueFor(key).map((w) => (passedIds.has(w.userId) ? Object.freeze({ ...w, passes: w.passes + 1 }) : w)));
  }

  function pickTarget(pool, excludeId) {
    let target = null;
    let targetCount = Infinity;
    for (const id of deps.listPoolTableIds(pool)) {
      if (id === excludeId) continue;
      const candidate = deps.getLiveTable(id);
      const occupied = candidate ? candidate.occupiedSeats().length : 0;
      if (candidate && occupied < candidate.cfg.seats && occupied < targetCount) { target = candidate; targetCount = occupied; }
    }
    return target;
  }

  /** After a hand: transfer every queued human on a Rush table, or park them in the pool queue. */
  function moveQueued(table) {
    if (!table.rush) return;
    const pool = poolOf(table);
    const queued = table.humans().filter((p) => table.seatOf(p.id)?.player?.rushQueued);
    for (const p of queued) {
      const seat = table.seatOf(p.id);
      const stack = seat?.player?.stack || 0;
      const user = deps.findUser(p.id);
      if (!user || stack <= 0) { if (seat?.player) seat.player.rushQueued = false; continue; }
      const waiting = findWaiting(p.id);
      // Already queued from this table: keep their place; flush() serves the queue in order.
      if (waiting && waiting.pool.key === pool.key && waiting.fromTable === table.cfg.id) continue;
      // Nobody may take a seat ahead of players already waiting in this pool.
      const target = queueFor(pool.key).length ? null : pickTarget(pool, table.cfg.id);
      if (!target) {
        enqueue({ user, stack, pool, fromTable: table.cfg.id });
        seat.player.rushQueued = true;
        seat.player.sittingOut = true;
        notifyClient(deps.getEntry(table.cfg.id), p.id, { type: 'rush_queued' });
        continue;
      }
      dequeue(p.id);
      // Time Bank Cards follow the player to the next Rush table.
      const timeBank = { timeBankCards: seat.player.timeBankCards, timeBankHands: seat.player.timeBankHands };
      deps.cashOutSeat(table, p.id, 'Rush transfer');
      const res = deps.seatHuman(target, { ...user, ...timeBank }, Math.min(stack, target.cfg.max_buyin), null);
      if (!res.ok) { seat.player && (seat.player.rushQueued = false); continue; }
      notifyClient(deps.getEntry(table.cfg.id), p.id,
        { type: 'rush_move', tableId: target.cfg.id, stack: Math.min(stack, target.cfg.max_buyin) });
      deps.broadcastState(target);
    }
  }

  /** Where a waiting player stands: gone from their old seat, mid-hand there, or free to move. */
  function readiness(wait) {
    const fromEntry = deps.getEntry(wait.fromTable);
    if (!fromEntry || !fromEntry.table.seatOf(wait.userId)?.player) return { state: 'stale' };
    if (!SETTLED_STREETS.includes(fromEntry.table.street)) return { state: 'busy', fromEntry };
    return { state: 'ready', fromEntry };
  }

  function seatFromQueue(wait, fromEntry, target) {
    dequeue(wait.userId);
    const from = fromEntry.table.seatOf(wait.userId)?.player;
    const timeBank = { timeBankCards: from?.timeBankCards, timeBankHands: from?.timeBankHands };
    deps.cashOutSeat(fromEntry.table, wait.userId, 'Rush queue transfer');
    const stack = Math.min(wait.stack, target.cfg.max_buyin);
    const res = deps.seatHuman(target, { ...wait.user, ...timeBank }, stack, null);
    if (!res.ok) return false;
    notifyClient(fromEntry, wait.userId, { type: 'rush_move', tableId: target.cfg.id, stack });
    return true;
  }

  /** One service round for a pool: open seats go to waiting players oldest first. */
  function servePool(key) {
    const skipped = []; // busy players a newer arrival may still pass this round
    const passed = new Set();
    for (const wait of queueFor(key)) {
      const { state, fromEntry } = readiness(wait);
      if (state === 'stale') { dequeue(wait.userId); continue; }
      const target = pickTarget(wait.pool, wait.fromTable);
      if (!target) continue; // no seat is open for this player (at most their own table has room)
      if (state === 'busy') {
        if (wait.passes >= RUSH_MAX_PASSES) break; // starvation bound: hold the pool's seats for them
        skipped.push(wait.userId);
        continue;
      }
      if (seatFromQueue(wait, fromEntry, target)) skipped.forEach((id) => passed.add(id));
    }
    countPasses(key, passed);
  }

  /** Periodic sweep: serve every pool queue once a table in that pool has room. */
  function flush() {
    for (const key of [...queues.keys()]) servePool(key);
  }

  /** Cash Drop for a saved Rush hand; emits the felt event when a drop is paid. */
  function settleHand(hand, table) {
    if (!isRushGame(hand.game)) return null;
    const candidates = (hand.players || []).filter((p) => p && p.id && !p.isBot && deps.isRealUser(p.id));
    const drop = settleCashDrop({
      handId: hand.handId, bb: table.cfg.bb, candidates, config: readCashDropConfig(deps.getSetting), ledger: deps.ledger,
    });
    if (drop) table.emit({ type: 'cashdrop', nick: drop.nick, amount: drop.amount, rule: drop.rule });
    return drop;
  }

  /** Read-only view of every pool queue (copies), for tests and monitoring. */
  function waitingList() {
    return [...queues.values()].flat().map((w) => Object.freeze({
      userId: w.userId, poolKey: w.pool.key, fromTable: w.fromTable, stack: w.stack, since: w.since,
    }));
  }

  /** One pool's FIFO, oldest first, with how many flushes each player has been passed over. */
  function poolQueue(poolKey) {
    return queueFor(poolKey).map((w, i) => Object.freeze({
      userId: w.userId, position: i + 1, fromTable: w.fromTable, since: w.since, passes: w.passes,
    }));
  }

  return Object.freeze({ moveQueued, flush, settleHand, waitingList, poolQueue });
}
