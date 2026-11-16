import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';

let srv;
let playerToken;
let spectatorToken;

before(async () => {
  srv = await startServer();
  playerToken = (await srv.post('/api/auth/register', { body: { login: 'rabbit_player', nick: 'rabbit_player', password: 'secret12' } })).data.token;
  spectatorToken = (await srv.post('/api/auth/register', { body: { login: 'rabbit_watcher', nick: 'rabbit_watcher', password: 'secret12' } })).data.token;
});

after(async () => { await srv.stop(); });

test('Rabbit Hunt reaches only the requesting participant and never the spectator', { timeout: 60000 }, async () => {
  const hosted = await srv.post('/api/tables/host', { token: playerToken, body: { name: 'Rabbit Privacy', game: 'holdem', seats: 2, sb: 100, bb: 200, min_buyin: 4000, max_buyin: 20000 } });
  assert.equal(hosted.status, 200, JSON.stringify(hosted.data));
  const tableId = hosted.data.id;
  const player = srv.socket(playerToken);
  await player.opened;
  player.send({ type: 'join_table', tableId, buyin: 4000 });
  await player.nextType('joined');
  const spectator = srv.socket(spectatorToken);
  await spectator.opened;
  spectator.send({ type: 'join_table', tableId, observe: true });
  await spectator.nextType('joined');

  player.ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type !== 'state') return;
    const me = msg.state.players.find((seat) => seat?.isMe);
    if (me && msg.state.actor === me.id) player.send({ type: 'action', tableId, action: 'fold', amount: 0, handNo: msg.state.handNo, turnNo: msg.state.turnNo });
  });
  const ended = await player.next((msg) => msg.type === 'state' && msg.state.street === 'ended', 30000);
  assert.ok(ended.state.board.length < 5);
  player.send({ type: 'rabbit', tableId });
  const reveal = await player.next((msg) => msg.type === 'event' && msg.event.type === 'rabbit');
  assert.equal(reveal.event.cards.length, 5 - ended.state.board.length);

  spectator.send({ type: 'rabbit', tableId });
  const denied = await spectator.next((msg) => msg.type === 'error');
  assert.match(denied.error, /unavailable/i);
  await assert.rejects(
    spectator.next((msg) => msg.type === 'event' && msg.event.type === 'rabbit', 200),
    /timed out/,
  );
  await player.close();
  await spectator.close();
});
