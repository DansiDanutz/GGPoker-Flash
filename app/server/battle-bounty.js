import { randomInt } from 'node:crypto';
import { addTransactionEx } from './db.js';
import { buildPots, oddChipOrder } from './pots.js';
import { ensureBattleStore } from './battle-event.js';

function transaction(db, callback) {
  if (db.isTransaction) return callback();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function ensureBattleBountyStore(db) {
  ensureBattleStore(db);
  db.exec(`CREATE TABLE IF NOT EXISTS battle_bounty_awards (
    award_id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    hand_id TEXT NOT NULL,
    hand_no INTEGER NOT NULL CHECK(hand_no>0),
    victim_id INTEGER NOT NULL,
    pot_index INTEGER NOT NULL CHECK(pot_index>=0),
    item_id TEXT NOT NULL,
    ticket INTEGER NOT NULL CHECK(ticket>=0),
    amount INTEGER NOT NULL CHECK(amount>=0),
    created_at TEXT NOT NULL,
    UNIQUE(event_id,victim_id)
  );
  CREATE TABLE IF NOT EXISTS battle_bounty_shares (
    award_id INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    amount INTEGER NOT NULL CHECK(amount>=0),
    hunter_order INTEGER NOT NULL,
    PRIMARY KEY(award_id,account_id),
    UNIQUE(award_id,hunter_order)
  );`);
}

export function battleBountyRequests(table) {
  if (!table || !table.handId || !Number.isSafeInteger(table.handNo) || table.handNo < 1 || table.result?.reason !== 'showdown') return [];
  const contributions = table.seats.filter((seat) => seat.player?.totalBet > 0).map((seat) => ({ key: seat.player.id, amount: seat.player.totalBet, folded: !!seat.player.folded }));
  const pots = buildPots(contributions).pots;
  const requests = [];
  for (const seat of oddChipOrder(table.seats.map((entry) => entry.index), table.button, table.seats.length)) {
    const player = table.seats[seat].player;
    if (!player || player.folded || !player.inHand || player.stack !== 0 || !(table.handStartStack[player.id] > 0)) continue;
    const potIndex = pots.findLastIndex((pot) => pot.eligible.includes(player.id));
    if (potIndex < 0) throw new Error('Battle victim has no contested pot');
    const hunters = oddChipOrder([...new Set((table.result.winners || []).filter((winner) => winner.potIndex === potIndex && winner.amount > 0 && winner.id !== player.id).map((winner) => table.seatOf(winner.id)?.index).filter((index) => index !== undefined))], table.button, table.seats.length);
    if (!hunters.length) throw new Error('Battle victim has no bounty hunter');
    requests.push({ handId: table.handId, handNo: table.handNo, roomId: table.cfg.id, victimId: player.id, potIndex, hunterIds: hunters.map((index) => table.seats[index].player.id) });
  }
  return requests;
}

function archive(db, eventId) {
  const awards = db.prepare('SELECT award_id,room_id,hand_id,hand_no,victim_id,pot_index,item_id,amount,created_at FROM battle_bounty_awards WHERE event_id = ? ORDER BY award_id').all(eventId);
  const shareQuery = db.prepare('SELECT account_id,amount FROM battle_bounty_shares WHERE award_id = ? ORDER BY hunter_order');
  return awards.map((award) => ({
    awardId: award.award_id, roomId: award.room_id, handId: award.hand_id, handNo: award.hand_no,
    victimId: award.victim_id, potIndex: award.pot_index, itemId: award.item_id, amount: award.amount,
    createdAt: award.created_at, hunters: shareQuery.all(award.award_id).map((share) => ({ accountId: share.account_id, amount: share.amount })),
  }));
}

export function battleBountyState(db, eventId) {
  ensureBattleBountyStore(db);
  const inventory = db.prepare('SELECT item_id,amount,frequency_units,remaining_units FROM battle_bounty_items WHERE event_id = ? ORDER BY item_order').all(eventId);
  return {
    eventId,
    remainingCount: inventory.reduce((sum, item) => sum + item.remaining_units, 0),
    remaining: inventory.reduce((sum, item) => sum + item.remaining_units * item.amount, 0),
    inventory: inventory.map((item) => ({ itemId: item.item_id, amount: item.amount, frequencyUnits: item.frequency_units, remainingUnits: item.remaining_units })),
    awards: archive(db, eventId),
  };
}

export function awardBattleBounties(db, { eventId, table, drawTicket = (available) => randomInt(available) }) {
  ensureBattleBountyStore(db);
  const requests = battleBountyRequests(table);
  if (!requests.length) return battleBountyState(db, eventId);
  return transaction(db, () => {
    for (const request of requests) {
      const prior = db.prepare('SELECT hand_id,room_id,pot_index FROM battle_bounty_awards WHERE event_id = ? AND victim_id = ?').get(eventId, request.victimId);
      if (prior) {
        if (prior.hand_id !== request.handId || prior.room_id !== request.roomId || prior.pot_index !== request.potIndex) throw new Error('Battle bounty victim was already awarded');
        continue;
      }
      const items = db.prepare('SELECT item_id,amount,remaining_units FROM battle_bounty_items WHERE event_id = ? AND remaining_units > 0 ORDER BY item_order').all(eventId);
      const available = items.reduce((sum, item) => sum + item.remaining_units, 0);
      if (!available) continue;
      const ticket = drawTicket(available, request);
      if (!Number.isSafeInteger(ticket) || ticket < 0 || ticket >= available) throw new Error('Invalid Battle bounty ticket');
      let offset = ticket;
      const item = items.find((entry) => {
        if (offset < entry.remaining_units) return true;
        offset -= entry.remaining_units;
        return false;
      });
      if (!item) throw new Error('Battle bounty inventory changed');
      const consumed = db.prepare('UPDATE battle_bounty_items SET remaining_units = remaining_units - 1 WHERE event_id = ? AND item_id = ? AND remaining_units > 0').run(eventId, item.item_id);
      if (consumed.changes !== 1) throw new Error('Battle bounty inventory changed');
      const award = db.prepare(`INSERT INTO battle_bounty_awards (event_id,room_id,hand_id,hand_no,victim_id,pot_index,item_id,ticket,amount,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`).run(eventId, request.roomId, request.handId, request.handNo, request.victimId, request.potIndex, item.item_id, ticket, item.amount);
      for (const [hunterOrder, accountId] of request.hunterIds.entries()) {
        const amount = Math.floor(item.amount / request.hunterIds.length) + Number(hunterOrder < item.amount % request.hunterIds.length);
        db.prepare('INSERT INTO battle_bounty_shares (award_id,account_id,amount,hunter_order) VALUES (?,?,?,?)').run(award.lastInsertRowid, accountId, amount, hunterOrder);
        const payment = addTransactionEx(accountId, 'battle_bounty', amount, `Battle Royale bounty ${eventId}`, 'USD', { reference: `battle:bounty:${eventId}:${request.victimId}:${accountId}`, joinTransaction: true, database: db, onDuplicate: 'skip' });
        if (!payment.applied) throw new Error('Battle bounty payment conflict');
      }
    }
    return battleBountyState(db, eventId);
  });
}
