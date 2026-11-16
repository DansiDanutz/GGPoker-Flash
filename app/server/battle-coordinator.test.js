import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.GGPOKER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-battle-coordinator-'));
const { db } = await import('./db.js');
const { createBattleEvent, registerBattle } = await import('./battle-event.js');
const { BattleCoordinator, battleTimestamp, battlePrizeAwards } = await import('./battle-coordinator.js');
const { battleBountyState } = await import('./battle-bounty.js');

const players = [];
function config() {
  return {
    id: 'coordinator-battle', name: 'Coordinator Battle', capacity: 4, finalSeats: 2, startingChips: 1000,
    entry: 1000, rushMinutes: 10, tableSize: 2, smallBlind: 10, bigBlind: 20,
    rushStartLevel: 1, shootoutStartLevel: 1, finalStartLevel: 1, prizeShares: [50, 50],
    bountyItems: [{ id: 'b1', amount: 500, frequencyUnits: 1 }],
  };
}
function play(coordinator) {
  let actions = 0;
  for (const table of coordinator.tables.values()) {
    if (table.cfg.id.split(':')[1] !== coordinator.event.status) continue;
    if (!table.handInProgress() && table.readySeats().length >= 2) table.startHand();
    while (table.handInProgress()) {
      if (++actions > 30) throw new Error('Battle hand did not settle');
      const result = table.act(table.actor, 'allin');
      assert.equal(result.ok, true);
      coordinator.advance();
    }
  }
  coordinator.advance();
}

test('SQLite deadlines are interpreted as UTC in every local timezone', () => {
  assert.equal(battleTimestamp('2026-11-15 21:49:31'), Date.parse('2026-11-15T21:49:31.000Z'));
  assert.equal(battleTimestamp('2026-11-15T21:49:31.000Z'), Date.parse('2026-11-15T21:49:31.000Z'));
  assert.equal(battleTimestamp(null), null);
});

test('simultaneous finalists split the pool of their tied places without overpayment', () => {
  const places = [{ account_id: 55, place: 1 }, { account_id: 45, place: 2 }, { account_id: 50, place: 2 }, { account_id: 47, place: 4 }, { account_id: 48, place: 4 }, { account_id: 57, place: 4 }];
  const amounts = [5400, 3960, 3240, 2160, 1800, 1440];
  const awards = battlePrizeAwards(places, amounts);
  assert.deepEqual(places.map((place) => awards.get(place.account_id)), [5400, 3600, 3600, 1800, 1800, 1800]);
  assert.equal([...awards.values()].reduce((sum, amount) => sum + amount, 0), 18000);
  const odd = battlePrizeAwards([{ account_id: 1, place: 1 }, { account_id: 2, place: 1 }, { account_id: 3, place: 1 }], [101]);
  assert.deepEqual([...odd.values()], [34, 34, 33]);
});

test('shootout and final settle real stacks, prizes and private recovery state', () => {
  for (let id = 101; id <= 104; id++) {
    db.prepare('INSERT INTO users (id,login,nick,password,balance) VALUES (?,?,?,?,100000)').run(id, `coord_${id}`, `Coord${id}`, 'x');
    players.push(id);
  }
  createBattleEvent(db, { actorId: 0, operationId: 'create-coordinator', config: config() });
  for (const [index, actorId] of players.entries()) registerBattle(db, { actorId, eventId: 'coordinator-battle', expectedRevision: index + 1, operationId: `coord-register-${index}` });
  const coordinator = new BattleCoordinator(db, 'coordinator-battle', { autoStart: false }).start();
  for (const table of coordinator.tables.values()) { table.handNo = 1; table.street = 'ended'; }
  coordinator.closeRush();
  coordinator.advance();
  assert.equal(coordinator.event.status, 'shootout');
  assert.equal([...coordinator.tables.values()].filter((table) => table.cfg.id.includes(':shootout:')).length, 1, 'the odd contender receives a bye, not a fictitious hand');
  const roomId = [...coordinator.tables.values()].find((table) => table.cfg.id.includes(':shootout:')).cfg.id;
  const before = coordinator.tables.get(roomId).recoveryState();
  const restored = new BattleCoordinator(db, 'coordinator-battle', { autoStart: false });
  const restoredTable = restored.restore(roomId);
  assert.deepEqual(restoredTable.recoveryState(), before);
  let transitions = 0;
  while (coordinator.event.status === 'shootout') {
    if (++transitions > 10) throw new Error('Shootout did not terminate');
    play(coordinator);
  }
  assert.ok(['final', 'finished'].includes(coordinator.event.status));
  assert.equal(coordinator.tables.size, 1);
  let finalAttempts = 0;
  while (coordinator.event.status === 'final') {
    if (++finalAttempts > 10) throw new Error('Final did not terminate');
    play(coordinator);
  }
  assert.equal(coordinator.event.status, 'finished');
  const prizes = db.prepare('SELECT account_id,place,amount FROM battle_prizes WHERE event_id = ? ORDER BY place').all('coordinator-battle');
  assert.equal(prizes.length, 2);
  assert.deepEqual(prizes.map((row) => row.amount), [2000, 2000]);
  assert.equal(prizes.reduce((sum, row) => sum + row.amount, 0), 4000);
  const bounties = battleBountyState(db, 'coordinator-battle');
  assert.equal(bounties.awards.length, 1);
  assert.equal(bounties.awards[0].amount, 500);
  assert.equal(bounties.remainingCount, 0);
  assert.equal(db.prepare('SELECT SUM(balance) AS total FROM users WHERE id BETWEEN 101 AND 104').get().total, 400500);
  const registrations = db.prepare('SELECT account_id,stack,status FROM battle_registrations WHERE event_id = ?').all('coordinator-battle');
  assert.equal(registrations.reduce((sum, row) => sum + row.stack, 0), 4000);
  assert.equal(registrations.filter((row) => row.stack > 0).length, 1);
  const finalHands = db.prepare("SELECT COUNT(*) AS count FROM battle_rooms WHERE event_id = ? AND stage = 'final'").get('coordinator-battle').count;
  assert.equal(finalHands, 1);
});
