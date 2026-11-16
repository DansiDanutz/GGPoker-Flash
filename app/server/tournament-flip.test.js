import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';

let srv;
let admin;
const players = [];

before(async () => {
  srv = await startServer();
  admin = await srv.login('admin', 'admin123');
  for (const name of ['flip_a', 'flip_b']) {
    const response = await srv.post('/api/auth/register', { body: { login: name, nick: name, password: 'secret12' } });
    players.push({ token: response.data.token, id: response.data.user.id });
  }
});

after(async () => { await srv.stop(); });

test('Flip & Go settles all participants all-in without player decisions and conserves entry-funded prizes', async () => {
  const created = await srv.post('/api/admin/tournaments', { token: admin, body: { id: 'flip-event', name: 'Flip test', game: 'holdem', mode: 'FLIP', buyin: 100, fee: 0, gtd: 0, starting_stack: 1000, start_at: new Date().toISOString(), late_reg: 60, blind_speed: 5 } });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const baseline = (await Promise.all(players.map((player) => srv.balance(player.token)))).reduce((sum, balance) => sum + balance, 0);
  for (const player of players) assert.equal((await srv.post('/api/tournaments/flip-event/register', { token: player.token, body: {} })).status, 200);
  for (const player of players) {
    const response = await srv.post('/api/tournaments/flip-event/play', { token: player.token, body: {} });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.ok(response.data.tableId);
  }
  let completed;
  for (let attempt = 0; attempt < 200; attempt++) {
    const response = await srv.get('/api/tournaments/flip-event');
    if (response.data.tournament.status === 'completed') { completed = response.data; break; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(completed, 'Flip did not complete automatically');
  const { DatabaseSync } = await import('node:sqlite');
  const { join } = await import('node:path');
  const db = new DatabaseSync(join(srv.dataDir, 'ggpoker.db'), { readOnly: true });
  const hand = db.prepare('SELECT result FROM hands WHERE table_id = ? ORDER BY id DESC LIMIT 1').get('tourney-flip-event');
  assert.equal(JSON.parse(hand.result).pot, 2000);
  db.close();
  assert.equal(completed.prizePool, 200);
  assert.equal(completed.payouts.reduce((sum, payout) => sum + payout.amount, 0), 200);
  assert.equal((await Promise.all(players.map((player) => srv.balance(player.token)))).reduce((sum, balance) => sum + balance, 0), baseline);
});
