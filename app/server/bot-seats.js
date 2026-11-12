/**
 * Humans before bots (REA F05/F06). Bots exist only to keep a cash table alive; the rules:
 *
 *   1. A bot never gives up a seat while it holds live cards: it leaves between hands (or once
 *      it has folded), so a hand is never decided by a bot vanishing mid-hand.
 *   2. A human who wants a seat at a table full of bots takes an idle bot's seat at once; if
 *      every bot is still in the hand, the human queues and a bot stands up as the hand ends.
 *   3. A freed seat goes to the wait list first (seat holds); bots never fill a held seat.
 *   4. Bots never take a seat while anyone is waiting for this table or its group.
 *
 * Tournament and Spin tables are excluded: their seats are assigned, not first-come.
 */
import * as waitlist from './waitlist.js';

/** Bots seeded next to a human: half the table (at least 3), never more than the free seats. */
const BOT_FILL_SHARE = 0.5;
const BOT_FILL_MIN = 3;

const isCashTable = (table) => !table.tournament && !table.spin;

/** True while the seat's player still has cards in a hand that is being played. */
export function holdsLiveCards(table, seat) {
  const p = seat.player;
  return !!p && table.handInProgress() && p.inHand && !p.folded;
}

/** A bot seat that can be given to a human right now, or null. Bots not dealt in go first. */
export function evictableBotSeat(table) {
  const bots = table.occupiedSeats().filter((s) => s.player.isBot && !holdsLiveCards(table, s));
  return bots.find((s) => !s.player.inHand) || bots[0] || null;
}

/** Humans waiting for this table: its own queue plus its group queue. */
export function waitingFor(state, cfg) {
  return waitlist.queueSize(state, waitlist.tableQueue(cfg.id))
    + waitlist.queueSize(state, waitlist.groupQueue(waitlist.groupKey(cfg)));
}

/** How many bots may sit down now; zero while any human is waiting. */
export function botFillCount(table, waiting) {
  if (table.tournament || waiting > 0) return 0;
  const free = Math.max(0, table.cfg.seats - table.occupiedSeats().length);
  return Math.min(free, Math.max(BOT_FILL_MIN, Math.ceil(table.cfg.seats * BOT_FILL_SHARE)));
}

/**
 * Between hands, stand up one bot for each waiting human who has no free seat yet. Returns
 * the number of bots that left; the caller then offers the freed seats to the wait list.
 */
export function releaseBotsForWaiting(table, waiting) {
  if (!isCashTable(table) || waiting <= 0 || table.handInProgress()) return 0;
  const uncovered = waiting - table.offerableSeats().length;
  let released = 0;
  while (released < uncovered) {
    const seat = evictableBotSeat(table);
    if (!seat) break;
    table.stand(seat.player.id);
    released++;
  }
  return released;
}
