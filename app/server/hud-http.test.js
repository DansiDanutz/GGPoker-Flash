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

test('private club statistics honor current membership, including removal', async () => {
  const srv = await startServer();
  try {
    const create = async login => (await srv.post('/api/auth/register', {body:{login,nick:login,password:'secret123'}})).data;
    const owner = await create('clubowner'), member = await create('clubreader');
    const db = new DatabaseSync(path.join(srv.dataDir,'ggpoker.db'));
    try {
      const {id} = db.prepare('SELECT id FROM tables WHERE enabled=1 ORDER BY sort LIMIT 1').get();
      db.prepare('UPDATE tables SET private=1, play_money=0, owner_id=? WHERE id=?').run(owner.user.id,id);
      db.prepare("INSERT INTO organizer_club_profiles(owner_id,name,created_at,updated_at) VALUES (?,'Private',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run(owner.user.id);
      db.prepare("INSERT INTO organizer_billing_memberships(user_id,role,active,expires_at) VALUES (?,'organizer',1,datetime('now','+1 day'))").run(owner.user.id);
      const stats = route => srv.get('/api/tables/'+id+'/'+route,{token:member.token});
      for (const route of ['hud?nick=test','vpip','leaderboard']) assert.equal((await stats(route)).status,403);
      db.prepare("INSERT INTO organizer_club_members(organizer_id,user_id,status,created_at,updated_at) VALUES (?,?,'approved',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").run(owner.user.id,member.user.id);
      assert.equal((await stats('hud?nick=test')).status,200);
      db.prepare("UPDATE organizer_club_members SET status='removed' WHERE organizer_id=? AND user_id=?").run(owner.user.id,member.user.id);
      assert.equal((await stats('hud?nick=test')).status,403);
    } finally { db.close(); }
  } finally { await srv.stop(); }
});
