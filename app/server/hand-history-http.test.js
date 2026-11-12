import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './test-helpers.js';

const FOREIGN_HANDS = 900; // more than the old 400-row scan window
let srv;
let token;
let me;
let myHandIds;

const seat = (id, nick, seatNo) => ({ id, nick, seat: seatNo, stack: 1000, cards: ['As', 'Kd'], inHand: true, folded: false, showed: false, win: 0 });

before(async () => {
  srv = await startServer();
  token = await srv.login('DansiDanutz', 'ggpoker');
  me = (await srv.get('/api/me', { token })).data.user;
  const db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
  try {
    const add = db.prepare(`INSERT INTO hands (hand_no,table_id,table_name,game,players,board,pot,result,actions)
      VALUES (?,?,?,?,?,'',100,'{}','[]')`);
    const mine = JSON.stringify([seat(me.id, me.nick, 0), seat('bot-1', 'Bot One', 1)]);
    myHandIds = [1, 2].map((n) => Number(add.run(n, 't-mine', 'Mine', 'holdem', mine).lastInsertRowid));
    add.run(3, 't-bad', 'Broken', 'holdem', 'not json');
    add.run(4, 't-odd', 'Odd', 'holdem', JSON.stringify(['text', 7, { nick: 'x' }]));
    const others = JSON.stringify([seat('bot-2', 'Bot Two', 0), seat('bot-3', 'Bot Three', 1)]);
    db.exec('BEGIN');
    for (let i = 0; i < FOREIGN_HANDS; i++) add.run(10 + i, 't-busy', 'Busy', 'holdem', others);
    db.exec('COMMIT');
  } finally {
    db.close();
  }
});
after(async () => { await srv.stop(); });

test('an infrequent player still sees their hands behind many newer hands at other tables', async () => {
  const { data } = await srv.get('/api/hands', { token });
  assert.deepEqual(data.hands.map((h) => h.id).sort((a, b) => a - b), myHandIds);
  assert.ok(data.hands.every((h) => h.hidden === false));
});

test('a player can hide and unhide a hand they played', async () => {
  const [first] = myHandIds;
  const hide = await srv.post(`/api/hands/${first}/hidden`, { token, body: { hidden: true } });
  assert.equal(hide.status, 200);
  let hands = (await srv.get('/api/hands', { token })).data.hands;
  assert.equal(hands.find((h) => h.id === first).hidden, true);
  assert.equal(hands.find((h) => h.id === myHandIds[1]).hidden, false);
  await srv.post(`/api/hands/${first}/hidden`, { token, body: { hidden: false } });
  hands = (await srv.get('/api/hands', { token })).data.hands;
  assert.equal(hands.find((h) => h.id === first).hidden, false);
});

test('hiding is refused for hands the player was not in, and needs a boolean', async () => {
  const foreign = myHandIds[1] + 3;
  assert.equal((await srv.post(`/api/hands/${foreign}/hidden`, { token, body: { hidden: true } })).status, 404);
  assert.equal((await srv.post('/api/hands/999999/hidden', { token, body: { hidden: true } })).status, 404);
  assert.equal((await srv.post(`/api/hands/${myHandIds[0]}/hidden`, { token, body: { hidden: 'yes' } })).status, 400);
  assert.equal((await srv.post(`/api/hands/${myHandIds[0]}/hidden`, { body: { hidden: true } })).status, 401);
});
