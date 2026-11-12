// Room-scoped opponent HUD endpoint: login required, public data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './test-helpers.js';

test('GET /api/tables/:id/hud returns room stats and hides unshown cards', async () => {
  const srv = await startServer();
  try {
    const reg = await srv.post('/api/auth/register', { body: { login: 'hud_a', nick: 'Hud A', password: 'secret12' } });
    const token = reg.data.token;
    const db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
    let tableId;
    try {
      tableId = db.prepare("SELECT id FROM tables WHERE enabled = 1 ORDER BY sort LIMIT 1").get().id;
      const add = db.prepare(`INSERT INTO hands (hand_no,table_id,table_name,game,players,board,pot,result,actions) VALUES (?,?,?,?,?,?,?,'{}',?)`);
      add.run(1, tableId, 'T', 'holdem', JSON.stringify([{ nick: 'Villain', cards: ['Ah', 'Kh'], win: 0, showed: false }]), 'As Kd 7c 2h 9s', 80,
        JSON.stringify([{ nick: 'Villain', action: 'raise', amount: 40, street: 'preflop' }]));
    } finally { db.close(); }
    assert.equal((await srv.get(`/api/tables/${tableId}/hud?nick=Villain`)).status, 401);
    assert.equal((await srv.get(`/api/tables/${tableId}/hud`, { token })).status, 400);
    assert.equal((await srv.get('/api/tables/nope-404/hud?nick=Villain', { token })).status, 404);
    const { status, data } = await srv.get(`/api/tables/${tableId}/hud?nick=Villain`, { token });
    assert.equal(status, 200);
    assert.equal(data.hud.hands, 1);
    assert.equal(data.hud.pfr, 100);
    assert.equal(data.hud.recent[0].cards, null, 'unshown hole cards never leave the server');
    assert.equal(JSON.stringify(data).includes('Ah'), false);
  } finally { await srv.stop(); }
});
