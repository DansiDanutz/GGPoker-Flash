import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, seatHumans } from './test-helpers.js';

let srv;
let adminToken;
const players = [];
const tableId = 'bet-muck-http';

before(async () => {
  srv = await startServer();
  adminToken = await srv.login('admin', 'admin123');
  const created = await srv.post('/api/admin/tables', { token: adminToken, body: { id: tableId, name: 'Bet Muck HTTP', game: 'holdem', seats: 2, sb: 100, bb: 200, min_buyin: 4000, max_buyin: 20000, bet_and_muck: 1, bet_muck_condition_rank: 1 } });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  for (const name of ['bet_muck_a', 'bet_muck_b']) {
    const response = await srv.post('/api/auth/register', { body: { login: name, nick: name, password: 'secret12' } });
    players.push({ token: response.data.token, id: response.data.user.id, socket: srv.socket(response.data.token) });
  }
  for (const player of players) await player.socket.opened;
});

after(async () => {
  for (const player of players) await player.socket.close();
  await srv.stop();
});

test('dedicated Bet-and-Muck HTTP settles on call and replays without another effect', { timeout: 30000 }, async () => {
  await seatHumans(players.map((player) => player.socket), tableId, 4000);
  const occupiedEdit = await srv.post('/api/admin/tables', { token: adminToken, body: { id: tableId, name: 'Bet Muck HTTP', game: 'holdem', seats: 2, sb: 100, bb: 200, min_buyin: 4000, max_buyin: 20000, bet_and_muck: 1, bet_muck_condition_rank: 2 } });
  assert.equal(occupiedEdit.status, 409);
  for (const player of players) {
    player.autoHandler = (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type !== 'state') return;
      if (msg.state.street === 'river') {
        player.socket.ws.off('message', player.autoHandler);
        return;
      }
      const me = msg.state.players.find((seat) => seat?.isMe);
      const actionKey = `${msg.state.handId}:${msg.state.street}:${me?.id}`;
      if (me && msg.state.actor === me.id && player.autoActionKey !== actionKey) {
        player.autoActionKey = actionKey;
        player.socket.send({ type: 'action', tableId, action: msg.state.currentBet > me.bet ? 'call' : 'check', amount: 0, handNo: msg.state.handNo, turnNo: msg.state.turnNo });
      }
    };
    player.socket.ws.on('message', player.autoHandler);
  }
  const river = await Promise.any(players.map((player) => player.socket.next((msg) => msg.type === 'state' && msg.state.street === 'river' && msg.state.betAndMuckEligible, 15000)));
  for (const player of players) player.socket.ws.off('message', player.autoHandler);
  const actualBettor = players.find((player) => player.id === river.state.players.find((seat) => seat?.isMe)?.id);
  const opponent = players.find((player) => player !== actualBettor);
  const body = { action: 'bet', amount: 200, handId: river.state.handId, expectedRevision: 0, operationId: 'bet-muck-http-flag', betAndMuck: true };
  const flagged = await srv.post(`/api/rooms/${tableId}/bet-and-muck`, { token: actualBettor.token, body });
  assert.equal(flagged.status, 200, JSON.stringify(flagged.data));
  assert.equal(flagged.data.state.betAndMuck.status, 'awaiting-response');
  const replay = await srv.post(`/api/rooms/${tableId}/bet-and-muck`, { token: actualBettor.token, body });
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.data, flagged.data);
  const conflict = await srv.post(`/api/rooms/${tableId}/bet-and-muck`, { token: actualBettor.token, body: { ...body, amount: 300 } });
  assert.equal(conflict.status, 409);
  const nextState = await opponent.socket.next((msg) => msg.type === 'state' && msg.state.actor === opponent.id && msg.state.betAndMuck?.status === 'awaiting-response');
  assert.equal(nextState.state.handId, river.state.handId);
  opponent.socket.send({ type: 'action', tableId, action: 'call', amount: 0, handNo: river.state.handNo, turnNo: river.state.turnNo });
  const settled = await opponent.socket.next((msg) => msg.type === 'state' && msg.state.result?.reason === 'fold');
  const bettorView = settled.state.players.find((seat) => seat.id === actualBettor.id);
  assert.equal(bettorView.folded, true);
  assert.deepEqual(bettorView.cards, []);
});
