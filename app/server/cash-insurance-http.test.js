import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer, seatHumans } from './test-helpers.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-cash-insurance-http-'));
const tableId = 'cash-insurance-http';
const players = [];
let srv;

after(async () => {
  if (srv?.child?.exitCode == null && srv.child.signalCode == null) await srv.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function join(player, predicate = () => true) {
  const socket = srv.socket(player.token);
  await socket.opened;
  socket.send({ type: 'join_table', tableId });
  await socket.next((message) => message.type === 'joined' && message.tableId === tableId);
  const message = await socket.next((msg) => msg.type === 'state' && msg.state.id === tableId && predicate(msg.state));
  return { socket, state: message.state };
}

test('quote survives hard restart and accepted settlement is exactly once', { timeout: 45000 }, async () => {
  srv = await startServer({ dataDir });
  let adminToken = await srv.login('admin', 'admin123');
  const created = await srv.post('/api/admin/tables', { token: adminToken, body: { id: tableId, name: 'Cash Insurance', game: 'holdem', seats: 2, sb: 100, bb: 200, min_buyin: 4000, max_buyin: 20000, rimt_mode: 'off' } });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const rules = await srv.post('/api/admin/cash-insurance-rules', { token: adminToken, body: { insuranceFeeBasisPoints: 1000, expectedRevision: 1, operationId: 'cash-rules-http' } });
  assert.equal(rules.status, 200, JSON.stringify(rules.data));
  const funded = await srv.post('/api/admin/house/cash-insurance/fund', { token: adminToken, body: { amount: 100000000, reason: 'Cash insurance HTTP', operationId: 'cash-house-http' } });
  assert.equal(funded.status, 200, JSON.stringify(funded.data));
  for (const name of ['cash_ins_a', 'cash_ins_b']) {
    const response = await srv.post('/api/auth/register', { body: { login: name, nick: name, password: 'secret12' } });
    players.push({ token: response.data.token, id: response.data.user.id, socket: srv.socket(response.data.token) });
  }
  for (const player of players) await player.socket.opened;
  await seatHumans(players.map((player) => player.socket), tableId, 4000);
  for (const player of players) {
    player.socket.ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type !== 'state' || msg.state.cashInsurance) return;
      const me = msg.state.players.find((seat) => seat?.isMe);
      if (me && msg.state.actor === me.id) player.socket.send({ type: 'action', tableId, action: 'allin', amount: 0, handNo: msg.state.handNo, turnNo: msg.state.turnNo });
    });
  }
  const available = await Promise.any(players.map((player) => player.socket.next((msg) => msg.type === 'state' && msg.state.cashInsurance?.status === 'awaiting-quote', 15000)));
  const underdog = players.find((player) => player.id === available.state.cashInsurance.underdogId);
  const handId = available.state.handId;
  const quoted = await srv.post(`/api/rooms/${tableId}/insurance/quote`, { token: underdog.token, body: { handId, expectedRevision: 0, ruleRevision: 2, operationId: 'cash-quote-http', coverage: 100 } });
  assert.equal(quoted.status, 200, JSON.stringify(quoted.data));
  const quote = quoted.data.state.quote;
  assert.equal(quote.premium, Math.ceil(100 * quote.winProbabilityNumerator / quote.winProbabilityDenominator) + Math.ceil(Math.ceil(100 * quote.winProbabilityNumerator / quote.winProbabilityDenominator) * 0.1));
  const before = await srv.balance(underdog.token);
  for (const player of players) await player.socket.close();
  await srv.stop();

  srv = await startServer({ dataDir });
  const restored = await join(underdog, (state) => state.cashInsurance?.quoteId === quote.quoteId);
  assert.equal(restored.state.cashInsurance.status, 'open');
  assert.equal(restored.state.cashInsurance.expiresAt, quote.expiresAt);
  assert.equal(await srv.balance(underdog.token), before);
  await restored.socket.close();
  const accepted = await srv.post(`/api/rooms/${tableId}/insurance/decision`, { token: underdog.token, body: { handId, quoteId: quote.quoteId, expectedRevision: 1, operationId: 'cash-accept-http', decision: 'accept' } });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  const insuredWon = accepted.data.state.quote.insuredWon;
  const expected = before - quote.premium + (insuredWon ? 0 : 100);
  assert.equal(await srv.balance(underdog.token), expected);
  const replay = await srv.post(`/api/rooms/${tableId}/insurance/decision`, { token: underdog.token, body: { handId, quoteId: quote.quoteId, expectedRevision: 1, operationId: 'cash-accept-http', decision: 'accept' } });
  assert.equal(replay.status, 200, JSON.stringify(replay.data));
  assert.deepEqual(replay.data, accepted.data);
  assert.equal(await srv.balance(underdog.token), expected);
  const reader = new DatabaseSync(path.join(dataDir, 'ggpoker.db'));
  assert.equal(reader.prepare("SELECT COUNT(*) AS count FROM house_reservations WHERE reservation_id = ? AND status = 'active'").get(`cash-insurance:${quote.quoteId}`).count, 0);
  assert.equal(reader.prepare("SELECT COUNT(*) AS count FROM game_checkpoints WHERE room_id = ? AND kind = 'cash-insurance' AND status = 'active'").get(tableId).count, 1);
  reader.close();
  await srv.stop();
});
