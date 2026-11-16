import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { startServer } from './test-helpers.js';

let srv;
let admin;
let handRow;
const players = [];

before(async () => {
  srv = await startServer();
  admin = await srv.login('admin', 'admin123');
  for (const name of ['share_a', 'share_b', 'share_outside']) {
    const response = await srv.post('/api/auth/register', { body: { login: name, nick: name, password: 'secret12' } });
    players.push({ id: response.data.user.id, token: response.data.token });
  }
  const db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
  const rowPlayers = [
    { id: players[0].id, nick: 'share_a', seat: 0, inHand: true, folded: true, stackBefore: 1000, stack: 900, contribution: 100, grossContribution: 100, award: 0, win: 0, totalBet: 100, cards: ['7s', '2d'], showed: true, shownIndices: [0] },
    { id: players[1].id, nick: 'share_b', seat: 1, inHand: true, folded: false, stackBefore: 1000, stack: 1100, contribution: 100, grossContribution: 100, award: 200, win: 200, totalBet: 100, cards: ['Ac', 'Ad'], showed: true, shownIndices: [0, 1] },
  ];
  const result = db.prepare(`INSERT INTO hands (hand_id,hand_no,table_id,table_name,game,players,board,pot,result,hero_cards,actions,meta,created_at)
    VALUES ('share-fixture',7,'table','Table','holdem',?, 'As Kd 2c',200,?, '7s 2d',?, '{"button":0}',datetime('now'))`).run(
    JSON.stringify(rowPlayers),
    JSON.stringify({ reason: 'showdown', winners: [{ id: players[1].id, nick: 'share_b', seat: 1, amount: 200, cards: ['Ac', 'Ad', 'As', 'Kd', '2c'] }], hands: [{ seat: 0, nick: 'share_a', cards: ['7s', '2d'] }, { seat: 1, nick: 'share_b', cards: ['Ac', 'Ad'] }] }),
    JSON.stringify([{ street: 'preflop', seat: 0, nick: 'share_a', action: 'call', amount: 100 }, { street: 'river', seat: 1, nick: 'share_b', action: 'raise', amount: 100 }]),
  );
  handRow = Number(result.lastInsertRowid);
  db.prepare(`INSERT INTO hands (hand_id,hand_no,table_id,table_name,game,players,board,pot,result,hero_cards,actions,meta,created_at)
    VALUES ('legacy-share',8,'table','Table','holdem',?, 'As Kd 2c',200, '{}', '7s 2d', '[]', '{}',datetime('now'))`).run(JSON.stringify(rowPlayers.map(({ stackBefore, shownIndices, ...player }) => player)));
  db.close();
});

after(async () => { await srv.stop(); });

test('Share Hand preserves participant authorization and one common public card policy', async () => {
  const history = await srv.get('/api/hands', { token: players[1].token });
  const detail = history.data.hands.find((hand) => hand.id === handRow);
  assert.deepEqual(detail.players[0].cards, ['7s']);
  assert.deepEqual(detail.players[1].cards, ['Ac', 'Ad']);

  assert.equal((await srv.post('/api/hands/share-fixture/share', { token: players[2].token, body: { expectedRevision: 0, operationId: 'outsider-share' } })).status, 404);
  const first = await srv.post('/api/hands/share-fixture/share', { token: players[0].token, body: { expectedRevision: 0, operationId: 'first-share' } });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.revision, 1);
  const shareId = first.data.state.shareId;
  const replay = await srv.post('/api/hands/share-fixture/share', { token: players[0].token, body: { expectedRevision: 0, operationId: 'first-share' } });
  assert.deepEqual(replay.data, first.data);
  const second = await srv.post('/api/hands/share-fixture/share', { token: players[1].token, body: { expectedRevision: 1, operationId: 'second-share' } });
  assert.equal(second.status, 200, JSON.stringify(second.data));
  assert.notEqual(second.data.state.shareId, shareId);

  const publicHand = await srv.get(`/api/shared-hands/${shareId}`);
  assert.equal(publicHand.status, 200, JSON.stringify(publicHand.data));
  assert.deepEqual(publicHand.data.hand.players[0].publicCards, ['7s']);
  assert.deepEqual(publicHand.data.hand.players[1].publicCards, ['Ac', 'Ad']);
  assert.equal(publicHand.data.hand.players[0].stackBefore, 1000);
  assert.equal(publicHand.data.hand.actions[0].seat, 0);
  const serialized = JSON.stringify(publicHand.data);
  for (const forbidden of ['"deck"', '"sessionId"', '"owner_id"', '"ownerId"', '"accountId"', '"id":']) assert.equal(serialized.includes(forbidden), false, forbidden);
  assert.equal(serialized.includes('2d'), false, 'the second folded card remains private');

  assert.equal((await srv.post('/api/hands/share-fixture/share/revoke', { token: players[1].token, body: { shareId, expectedRevision: 2, operationId: 'not-owner-revoke' } })).status, 403);
  const hidden = await srv.post(`/api/hands/${handRow}/hidden`, { token: players[1].token, body: { hidden: true } });
  assert.equal(hidden.status, 200);
  assert.equal((await srv.get(`/api/shared-hands/${shareId}`)).status, 404);
  await srv.post(`/api/hands/${handRow}/hidden`, { token: players[1].token, body: { hidden: false } });
  assert.equal((await srv.get(`/api/shared-hands/${shareId}`)).status, 200);

  const revoked = await srv.post('/api/hands/share-fixture/share/revoke', { token: players[0].token, body: { shareId, expectedRevision: 2, operationId: 'first-revoke' } });
  assert.equal(revoked.status, 200, JSON.stringify(revoked.data));
  assert.equal(revoked.data.revision, 3);
  assert.deepEqual((await srv.post('/api/hands/share-fixture/share/revoke', { token: players[0].token, body: { shareId, expectedRevision: 2, operationId: 'first-revoke' } })).data, revoked.data);
  assert.equal((await srv.get(`/api/shared-hands/${shareId}`)).status, 404);
  assert.equal((await srv.get(`/api/shared-hands/${second.data.state.shareId}`)).status, 200, 'the other link remains valid');
  const adminRevoked = await srv.post('/api/hands/share-fixture/share/revoke', { token: admin, body: { shareId: second.data.state.shareId, expectedRevision: 3, operationId: 'admin-revoke' } });
  assert.equal(adminRevoked.status, 200, JSON.stringify(adminRevoked.data));
  assert.equal((await srv.get(`/api/shared-hands/${second.data.state.shareId}`)).status, 404);
  assert.equal((await srv.get('/api/shared-hands/does-not-exist')).status, 404);
});

test('legacy rows without trustworthy seats, starting stacks or actions cannot be shared', async () => {
  const response = await srv.post('/api/hands/legacy-share/share', { token: players[0].token, body: { expectedRevision: 0, operationId: 'legacy-share-command' } });
  assert.equal(response.status, 404);
});
