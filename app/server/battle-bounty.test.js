import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.GGPOKER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-battle-bounty-'));
const { db } = await import('./db.js');
const { createBattleEvent } = await import('./battle-event.js');
const { awardBattleBounties, battleBountyRequests, battleBountyState } = await import('./battle-bounty.js');

function config(items) {
  return {
    id: 'bounty-event', name: 'Bounty test', capacity: 4, finalSeats: 2, startingChips: 1000,
    entry: 0, rushMinutes: 10, tableSize: 4, smallBlind: 5, bigBlind: 10,
    rushStartLevel: 1, shootoutStartLevel: 1, finalStartLevel: 1, prizeShares: [60, 40], bountyItems: items,
  };
}

function player(id, stack, totalBet, extra = {}) {
  return { id, stack, totalBet, inHand: true, folded: false, ...extra };
}

function table(players, winners, button = 3) {
  return {
    cfg: { id: 'bounty-event:rush:1:0' }, handId: 'bounty-hand-1', handNo: 1, button,
    handStartStack: Object.fromEntries(players.map((entry) => [entry.id, entry.stack + entry.totalBet])),
    seats: players.map((entry, index) => ({ index, player: entry })),
    seatOf(id) { return this.seats.find((seat) => seat.player?.id === id); },
    result: { reason: 'showdown', winners },
  };
}

function addPlayer(id) {
  db.prepare('INSERT INTO users (id,login,nick,password,balance) VALUES (?,?,?,?,1000)').run(id, `bounty_${id}`, `Bounty${id}`, 'x');
}

test('fixed-ticket awards consume weighted inventory without replacement and split odd credits clockwise', () => {
  for (const id of [101, 102, 103, 104]) addPlayer(id);
  createBattleEvent(db, { actorId: 0, operationId: 'create-bounty', config: config([{ id: 'small', amount: 3, frequencyUnits: 2 }, { id: 'large', amount: 11, frequencyUnits: 1 }]) });
  const request = table([player(101, 0, 100), player(102, 100, 100), player(103, 100, 100)], [
    { id: 102, potIndex: 0, amount: 150 }, { id: 103, potIndex: 0, amount: 150 },
  ]);
  const state = awardBattleBounties(db, { eventId: 'bounty-event', table: request, drawTicket: () => 2 });
  assert.equal(state.awards.length, 1);
  assert.equal(state.awards[0].itemId, 'large');
  assert.deepEqual(state.awards[0].hunters, [{ accountId: 102, amount: 6 }, { accountId: 103, amount: 5 }]);
  assert.equal(state.remainingCount, 2);
  assert.equal(state.remaining, 6);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 102').get().balance, 1006);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 103').get().balance, 1005);
  const replay = awardBattleBounties(db, { eventId: 'bounty-event', table: request, drawTicket: () => { throw new Error('A replay must not draw'); } });
  assert.deepEqual(replay, state);
  assert.equal(db.prepare('SELECT SUM(balance) AS total FROM users WHERE id BETWEEN 101 AND 104').get().total, 4011);
  assert.equal('ticket' in state.awards[0], false);
  assert.equal('hunters' in state.awards[0] && !('cards' in state.awards[0]) && !('deck' in state.awards[0]), true);
});

test('side pots select the highest contested pot and each victim draws once', () => {
  for (const id of [5, 6, 7, 8]) addPlayer(id);
  createBattleEvent(db, { actorId: 0, operationId: 'create-side-bounty', config: { ...config([{ id: 'small', amount: 3, frequencyUnits: 2 }]), id: 'side-bounty' } });
  const request = table([player(5, 0, 100), player(6, 0, 300), player(7, 100, 300), player(8, 100, 300)], [
    { id: 7, potIndex: 0, amount: 200 }, { id: 8, potIndex: 0, amount: 200 }, { id: 8, potIndex: 1, amount: 600 },
  ]);
  const requests = battleBountyRequests(request);
  assert.deepEqual(requests.map((entry) => [entry.victimId, entry.potIndex, entry.hunterIds]), [[5, 0, [7, 8]], [6, 1, [8]]]);
  const state = awardBattleBounties(db, { eventId: 'side-bounty', table: request, drawTicket: () => 0 });
  assert.deepEqual(state.awards.map((entry) => entry.hunters), [[{ accountId: 7, amount: 2 }, { accountId: 8, amount: 1 }], [{ accountId: 8, amount: 3 }]]);
  assert.equal(state.remainingCount, 0);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 7').get().balance, 1002);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 8').get().balance, 1004);
});

test('exhausted inventory leaves gameplay and wallet untouched and rejects conflicting victim replays', () => {
  for (const id of [9, 10]) addPlayer(id);
  createBattleEvent(db, { actorId: 0, operationId: 'create-empty-bounty', config: { ...config([]), id: 'empty-bounty' } });
  const request = table([player(9, 0, 100), player(10, 200, 100)], [{ id: 10, potIndex: 0, amount: 200 }]);
  const state = awardBattleBounties(db, { eventId: 'empty-bounty', table: request });
  assert.deepEqual(state.awards, []);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = 10').get().balance, 1000);
  db.prepare("UPDATE battle_bounty_items SET remaining_units = 1 WHERE event_id = 'side-bounty' AND item_id = 'small'").run();
  const conflictingReplay = table([player(5, 0, 100), player(7, 100, 100)], [{ id: 7, potIndex: 0, amount: 200 }]);
  assert.throws(() => awardBattleBounties(db, { eventId: 'side-bounty', table: { ...conflictingReplay, handId: 'different-hand' } }), /already awarded/);
});
