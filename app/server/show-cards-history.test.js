import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, seatHumans } from './test-helpers.js';

let srv;
let folderToken;
let opponentToken;

before(async () => {
  srv = await startServer();
  folderToken = (await srv.post('/api/auth/register', { body: { login: 'show_folder', nick: 'show_folder', password: 'secret12' } })).data.token;
  opponentToken = (await srv.post('/api/auth/register', { body: { login: 'show_opponent', nick: 'show_opponent', password: 'secret12' } })).data.token;
});

after(async () => { await srv.stop(); });

test('a folded player’s partial reveal is persisted for the opponent’s history', { timeout: 30000 }, async () => {
  const hosted = await srv.post('/api/tables/host', { token: folderToken, body: { name: 'Show History', game: 'holdem', seats: 2, sb: 100, bb: 200, min_buyin: 4000, max_buyin: 20000 } });
  const tableId = hosted.data.id;
  const folder = srv.socket(folderToken);
  const opponent = srv.socket(opponentToken);
  await Promise.all([folder.opened, opponent.opened]);
  await seatHumans([folder, opponent], tableId, 4000);
  folder.ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type !== 'state') return;
    const me = msg.state.players.find((player) => player?.isMe);
    if (me && msg.state.actor === me.id) folder.send({ type: 'action', tableId, action: 'fold', amount: 0 });
  });
  const ended = await folder.next((msg) => msg.type === 'state' && msg.state.street === 'ended');
  const selected = ended.state.players.find((player) => player?.isMe).cards[0];
  folder.send({ type: 'show_cards', tableId, cards: [0] });
  const shown = await folder.next((msg) => msg.type === 'event' && msg.event.type === 'cards_shown');
  assert.deepEqual(shown.event.cards, [selected]);
  const history = await srv.get('/api/hands', { token: opponentToken });
  assert.ok(history.data.hands.length, JSON.stringify(history.data));
  const players = history.data.hands[0].players;
  const folderHistory = players.find((player) => player.nick === 'show_folder');
  assert.deepEqual(folderHistory.cards, [selected]);
  assert.deepEqual(folderHistory.shownIndices, [0]);
  await folder.close();
  await opponent.close();
});
