import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.GGPOKER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-battle-event-'));
const { db } = await import('./db.js');
const { abortBattle, battleEventState, createBattleEvent, registerBattle, cancelBattle, reopenBattle, validateBattleConfig } = await import('./battle-event.js');
const { buildQualificationPlan, buildShootoutGroups, evaluateShootoutRound } = await import('./battle-qualification.js');

let sequence = 0;
function user() {
  const id = ++sequence + 100;
  db.prepare('INSERT INTO users (id,login,nick,password,balance) VALUES (?,?,?,?,100000)').run(id, `battle_${id}`, `Battle${id}`, 'x');
  return id;
}
function config(suffix = '', overrides = {}) {
  return {
    id: `battle-${suffix || 'base'}`, name: 'Practice Battle', capacity: 3, finalSeats: 2, startingChips: 1000,
    entry: 1000, rushMinutes: 10, tableSize: 2, smallBlind: 10, bigBlind: 20,
    rushStartLevel: 1, shootoutStartLevel: 1, finalStartLevel: 1, prizeShares: [50, 50],
    bountyItems: [{ id: 'b1', amount: 500, frequencyUnits: 1 }], ...overrides,
  };
}

test('configuration enforces event, prize, blind and bounty bounds', () => {
  assert.throws(() => validateBattleConfig(config('bad-prizes', { prizeShares: [60, 40, 10] })), /Prize shares/);
  assert.throws(() => validateBattleConfig(config('bad-blinds', { smallBlind: 30 })), /seats or blinds/);
  assert.throws(() => validateBattleConfig(config('bad-bounty', { bountyItems: [{ id: 'x', amount: 0, frequencyUnits: 0 }] })), /Bounty item/);
  assert.equal(validateBattleConfig(config('valid')).capacity, 3);
});

test('registration, cancellation and reopen preserve the wallet exactly once', () => {
  const actorId = user();
  const eventId = 'battle-wallet';
  assert.equal(createBattleEvent(db, { actorId: 0, operationId: 'create-wallet', config: config('wallet') }).status, 200);
  const registered = registerBattle(db, { actorId, eventId, expectedRevision: 1, operationId: 'register-wallet' });
  assert.equal(registered.status, 200, JSON.stringify(registered.body));
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = ?').get(actorId).balance, 99000);
  assert.equal(registerBattle(db, { actorId, eventId, expectedRevision: 2, operationId: 'duplicate-wallet' }).status, 409);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = ?').get(actorId).balance, 99000);
  const cancelled = cancelBattle(db, { actorId, eventId, expectedRevision: 2, operationId: 'cancel-wallet' });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = ?').get(actorId).balance, 100000);
  assert.equal(registerBattle(db, { actorId, eventId, expectedRevision: 3, operationId: 'register-again' }).status, 409);
  assert.equal(reopenBattle(db, { actorId, eventId, expectedRevision: 3, operationId: 'reopen-wallet' }).status, 409);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = ?').get(actorId).balance, 100000);
  assert.equal(battleEventState(db, eventId, actorId).myRegistration.status, 'cancelled');
});

test('capacity starts Rush and abort refunds every active registration before the first deal', () => {
  const first = user();
  const second = user();
  const third = user();
  const eventId = 'battle-start';
  createBattleEvent(db, { actorId: 0, operationId: 'create-start', config: config('start', { capacity: 2 }) });
  assert.equal(registerBattle(db, { actorId: first, eventId, expectedRevision: 1, operationId: 'start-1' }).status, 200);
  const started = registerBattle(db, { actorId: second, eventId, expectedRevision: 2, operationId: 'start-2' });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.state.status, 'rush');
  assert.equal(started.body.state.registeredCount, 2);
  const beforeReopen = db.prepare('SELECT balance FROM users WHERE id = ?').get(first).balance;
  assert.equal(reopenBattle(db, { actorId: first, eventId, expectedRevision: 3, operationId: 'reopen-started' }).status, 200);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = ?').get(first).balance, beforeReopen);
  assert.equal(registerBattle(db, { actorId: third, eventId, expectedRevision: 3, operationId: 'start-3' }).status, 409);
  assert.equal(abortBattle(db, { actorId: 0, eventId, expectedRevision: 3, operationId: 'abort-started' }).status, 409);

  const abortEvent = 'battle-abort';
  createBattleEvent(db, { actorId: 0, operationId: 'create-abort', config: config('abort', { capacity: 2 }) });
  registerBattle(db, { actorId: first, eventId: abortEvent, expectedRevision: 1, operationId: 'abort-register' });
  const before = db.prepare('SELECT balance FROM users WHERE id = ?').get(first).balance;
  const aborted = abortBattle(db, { actorId: 0, eventId: abortEvent, expectedRevision: 2, operationId: 'abort-now' });
  assert.equal(aborted.status, 200, JSON.stringify(aborted.body));
  assert.equal(aborted.body.state.status, 'aborted');
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = ?').get(first).balance, before + 1000);
  assert.equal(reopenBattle(db, { actorId: first, eventId: abortEvent, expectedRevision: 3, operationId: 'reopen-aborted' }).status, 409);
});

test('qualification handles direct survivors, contiguous groups, byes and the ten-round bound', () => {
  const players = Array.from({ length: 7 }, (_, index) => ({ id: index + 1, stack: 1000 - index * 100, entryOrder: index }));
  assert.deepEqual(buildQualificationPlan(players.slice(0, 2), { finalSeats: 2, tableSize: 2 }).qualified.map((player) => player.id), [1, 2]);
  const shootout = buildQualificationPlan(players, { finalSeats: 2, tableSize: 2 });
  assert.deepEqual(shootout.direct.map((player) => player.id), [1]);
  assert.deepEqual(shootout.groups.map((group) => [group.players.map((player) => player.id), group.bye.map((player) => player.id)]), [[[2, 3], []], [[4, 5], []], [[6, 7], []]]);
  const three = buildShootoutGroups(players.slice(1, 4), 2);
  assert.deepEqual(three.map((group) => [group.players.map((player) => player.id), group.bye.map((player) => player.id)]), [[[2, 3], []], [[], [4]]]);
  const regrouped = buildShootoutGroups(players.slice(0, 4), 3);
  assert.deepEqual(regrouped.map((group) => group.players.map((player) => player.id)), [[1, 2], [3, 4]]);
  assert.equal(evaluateShootoutRound({ direct: [players[0]], survivors: players.slice(1, 3), tableSize: 2, round: 10 }).qualified[0].id, 1);
  assert.equal(evaluateShootoutRound({ direct: [], survivors: players.slice(1, 3), tableSize: 2, round: 10 }).qualified[0].id, 2);
});
