// Rush instant re-seat: a fast folder leaves the running hand at once for a new table of the
// same pool (or the pool's FIFO queue), with their stack minus what they bet, their Time Bank
// Cards, and the folded hand still in their history.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';
import { createRushPool } from './rush-pool.js';
import { pointEarners } from './dailyLeaderboard.js';

const STAKE = Object.freeze({ game: 'rush', sb: 5, bb: 10, min_buyin: 100, max_buyin: 5000, rakePercent: 0 });

function rushTable(id, seats = 4) {
  const t = new PokerTable({ ...STAKE, id, name: id, seats });
  t.nextHandAt = Date.now() + 1e9;
  return t;
}

/** Real PokerTables wired to a Rush pool with an in-memory wallet and hand store. */
function world(tables) {
  const byId = new Map(tables.map((t) => [t.cfg.id, t]));
  const wallet = new Map();
  const saved = [];
  const sent = [];
  const credit = (id, amount) => wallet.set(id, (wallet.get(id) || 0) + amount);
  for (const t of tables) t.hooks.onHandSave = (h) => saved.push(h);
  const pool = createRushPool({
    listPoolTableIds: () => tables.map((t) => t.cfg.id),
    getLiveTable: (id) => byId.get(id) || null,
    getEntry: (id) => ({ table: byId.get(id), clients: [{ userId: 'H', readyState: 1, send: (m) => sent.push(JSON.parse(m)) }] }),
    findUser: (id) => ({ id, nick: id }),
    cashOutSeat: (table, userId, _reason, opts) => credit(userId, table.stand(userId, opts).stack),
    seatHuman: (table, user, buyin) => {
      credit(user.id, -buyin);
      const res = table.sit({ id: user.id, nick: user.nick, timeBankCards: user.timeBankCards, timeBankHands: user.timeBankHands }, null, buyin);
      return res;
    },
    broadcastState: () => {},
    isRealUser: () => true,
    getSetting: (_k, fallback) => fallback,
    ledger: { hasDrop: () => false, credit: () => true },
  });
  return { pool, wallet, saved, sent };
}

/** H on the button of a 4-handed hand at `from`: bots B (SB), C (BB), D (first to act). */
function handWithHero(from) {
  from.sit({ id: 'H', nick: 'H', timeBankCards: 2, timeBankHands: 5 }, 0, 1000);
  for (const [i, id] of ['B', 'C', 'D'].entries()) from.sit({ id, nick: id, isBot: true }, i + 1, 1000);
  from.button = 3; from.nextHandAt = 0; from.startHand();
  assert.equal(from.actor, 'D');
}

test('a quick fold before your turn moves you to a new table at once with your stack', () => {
  const from = rushTable('r1');
  const to = rushTable('r2');
  handWithHero(from);
  const { pool, wallet, sent } = world([from, to]);

  assert.equal(from.quickFold('H').ok, true);
  assert.equal(pool.foldOut(from, 'H'), 'moved');

  assert.equal(from.seatOf('H'), undefined, 'gone from the old table mid-hand');
  assert.equal(to.seatOf('H').player.stack, 1000, 'the button had nothing in the pot');
  assert.equal(wallet.get('H'), 0, 'cash-out and buy-in net to zero');
  assert.deepEqual(sent, [{ type: 'rush_move', tableId: 'r2', stack: 1000 }]);
  assert.ok(['preflop', 'flop'].includes(from.street), 'the old hand keeps running without them');
});

test('the old table finishes the hand without the folder; their blind stays in the pot', () => {
  const from = rushTable('r1');
  const to = rushTable('r2');
  from.sit({ id: 'A', nick: 'A', isBot: true }, 0, 1000);
  from.sit({ id: 'H', nick: 'H' }, 1, 1000); // H posts the small blind
  from.sit({ id: 'C', nick: 'C', isBot: true }, 2, 1000);
  from.sit({ id: 'D', nick: 'D', isBot: true }, 3, 1000);
  from.button = 3; from.nextHandAt = 0; from.startHand(); // A button? D acts first after blinds
  const sbSeat = from.sbSeat;
  assert.equal(from.seats[sbSeat].player.id, 'H');
  const { pool, saved } = world([from, to]);

  from.quickFold('H');
  assert.equal(pool.foldOut(from, 'H'), 'moved');
  assert.equal(to.seatOf('H').player.stack, 995, 'stack minus the small blind they put in');

  // The rest of the hand plays out: everyone else folds to the big blind.
  while (from.street !== 'ended') from.act(from.actor, 'fold');
  const bb = from.seats[from.bbSeat].player;
  assert.equal(bb.stack, 1005, 'the big blind wins the folder\'s dead small blind');

  const hand = saved.at(-1);
  const row = hand.players.find((p) => p.id === 'H');
  assert.ok(row, 'the folded hand is in the history of the player who moved');
  assert.equal(row.folded, true);
  assert.equal(row.totalBet, 5);
  assert.equal(row.cards.length, 2);
});

test('a departed fast folder still counts as a participant of the hand they were dealt (rewards)', () => {
  const from = rushTable('r1');
  const to = rushTable('r2');
  from.sit({ id: 'A', nick: 'A', isBot: true }, 0, 1000);
  from.sit({ id: 'H', nick: 'H' }, 1, 1000); // small blind
  from.sit({ id: 'C', nick: 'C', isBot: true }, 2, 1000);
  from.sit({ id: 'D', nick: 'D', isBot: true }, 3, 1000);
  from.button = 3; from.nextHandAt = 0; from.startHand();
  const { pool } = world([from, to]);
  from.quickFold('H');
  pool.foldOut(from, 'H');
  from.sit({ id: 'L', nick: 'L' }, 1, 1000); // a late arrival takes the seat mid-hand
  const participants = from.handParticipants();
  assert.deepEqual(participants.map((p) => p.id).sort(), ['A', 'C', 'D', 'H']);
  assert.equal(participants.find((p) => p.id === 'H').totalBet, 5);
  assert.deepEqual(pointEarners(from), ['H'], 'the Daily Leaderboard credits the departed folder');
});

test('Time Bank Cards follow an instant re-seat', () => {
  const from = rushTable('r1');
  const to = rushTable('r2');
  handWithHero(from);
  const { pool } = world([from, to]);
  from.quickFold('H');
  pool.foldOut(from, 'H');
  const moved = to.seatOf('H').player;
  assert.deepEqual([moved.timeBankCards, moved.timeBankHands], [2, 5]);
});

test('with no open seat the fast folder joins the pool queue now and moves as soon as a seat opens', () => {
  const from = rushTable('r1');
  const full = rushTable('r2', 2);
  full.sit({ id: 'X', nick: 'X', isBot: true }, 0, 1000);
  full.sit({ id: 'Y', nick: 'Y', isBot: true }, 1, 1000);
  handWithHero(from);
  const { pool, sent } = world([from, full]);

  from.quickFold('H');
  assert.equal(pool.foldOut(from, 'H'), 'queued');
  assert.deepEqual(pool.waitingList().map((w) => [w.userId, w.fromTable]), [['H', 'r1']]);
  assert.deepEqual(sent, [{ type: 'rush_queued' }]);

  full.stand('Y');
  pool.flush(); // the old hand is still running, but H already folded it
  assert.ok(full.seatOf('H'), 'served while their old table is mid-hand');
  assert.equal(from.seatOf('H'), undefined);
  assert.deepEqual(pool.waitingList(), []);
});

test('a fast folder never jumps players already waiting in the pool', () => {
  const from = rushTable('r1'); // full: H and three bots
  const to = rushTable('r2', 2);
  to.sit({ id: 'X', nick: 'X', isBot: true }, 0, 1000);
  to.sit({ id: 'Y', nick: 'Y', isBot: true }, 1, 1000);
  const other = rushTable('r3', 2); // W folded there; that hand is over
  other.sit({ id: 'W', nick: 'W' }, 0, 1000);
  other.seatOf('W').player.rushQueued = true;
  handWithHero(from);
  const { pool } = world([from, to, other]);
  pool.moveQueued(other);
  assert.deepEqual(pool.poolQueue('rush:5/10').map((w) => w.userId), ['W'], 'every other table is full');

  from.quickFold('H');
  assert.equal(pool.foldOut(from, 'H'), 'queued');
  assert.deepEqual(pool.poolQueue('rush:5/10').map((w) => w.userId), ['W', 'H']);

  to.stand('Y');
  pool.flush();
  assert.ok(to.seatOf('W'), 'the earlier arrival takes the first open seat');
  assert.ok(other.seatOf('H'), 'H follows into the seat W just left at r3');
  assert.deepEqual(pool.waitingList(), []);
});

test('foldOut is a no-op for a player still in the hand, a bot, a settled hand or a non-Rush table', () => {
  const from = rushTable('r1');
  const to = rushTable('r2');
  handWithHero(from);
  const { pool } = world([from, to]);
  assert.equal(pool.foldOut(from, 'H'), null, 'H has not folded');
  assert.equal(pool.foldOut(from, 'D'), null, 'bots stay put');
  const holdem = new PokerTable({ ...STAKE, game: 'holdem', id: 'h1', name: 'h1', seats: 2 });
  assert.equal(pool.foldOut(holdem, 'H'), null);
  assert.ok(from.seatOf('H'));
});
