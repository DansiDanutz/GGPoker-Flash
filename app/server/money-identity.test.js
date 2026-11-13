// Money and identity fixes over HTTP/WS: one welcome bonus, capped play-money deposits,
// real lobby occupancy, notes/HUD keyed by account id, persisted Time Bank Cards, and an
// idempotent Add Chips.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './test-helpers.js';

const register = async (srv, login, nick = login) => (await srv.post('/api/auth/register', { body: { login, nick, password: 'secret12' } })).data.token;
const withDb = (srv, fn) => {
  const db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
  try { return fn(db); } finally { db.close(); }
};
const userId = async (srv, token) => (await srv.get('/api/me', { token })).data.user.id;
const hostTable = async (srv, token, name) => (await srv.post('/api/tables/host', {
  token, body: { name, sb: 100, bb: 200, min_buyin: 4000, max_buyin: 20000, seats: 6 },
})).data.id;
const stateWith = (ws, match, timeoutMs) => ws.next((m) => m.type === 'state' && match(m.state), timeoutMs);

test('registration records the welcome claim, so the Cashier never pays it twice', async () => {
  const srv = await startServer();
  try {
    const token = await register(srv, 'welcome_once');
    const cashier = await srv.get('/api/cashier', { token });
    assert.equal(cashier.data.bonuses.find((b) => b.id === 'welcome').claimed, true);
    const before = await srv.balance(token);
    const claim = await srv.post('/api/cashier/bonus', { token, body: { id: 'welcome' } });
    assert.equal(claim.status, 409);
    assert.equal(await srv.balance(token), before);
  } finally { await srv.stop(); }
});

test('deposits are capped per request and per UTC day, keeping idempotent replays', async () => {
  const srv = await startServer({ env: {} });
  try {
    const token = await register(srv, 'capped_depositor');
    const tooBig = await srv.post('/api/cashier/deposit', { token, body: { amount: 100001 } });
    assert.equal(tooBig.status, 400);
    for (let i = 0; i < 5; i++) {
      const ok = await srv.post('/api/cashier/deposit', { token, body: { amount: 100000 }, headers: { 'idempotency-key': `dep-${i}` } });
      assert.equal(ok.status, 200, `deposit ${i}`);
    }
    const replay = await srv.post('/api/cashier/deposit', { token, body: { amount: 100000 }, headers: { 'idempotency-key': 'dep-4' } });
    assert.equal(replay.status, 200, 'a replay of an applied deposit is not a new deposit');
    assert.equal(replay.data.replayed, true);
    const over = await srv.post('/api/cashier/deposit', { token, body: { amount: 1 }, headers: { 'idempotency-key': 'dep-5' } });
    assert.equal(over.status, 429);
    assert.match(over.data.error, /Daily play-money deposit limit/);
    const cashier = await srv.get('/api/cashier', { token });
    assert.deepEqual(cashier.data.depositLimits, { max: 100000, dailyMax: 500000, today: 500000 });
  } finally { await srv.stop(); }
});

test('lobby occupancy uses demo counts until real seats exist, with bots reported separately', async () => {
  const srv = await startServer();
  try {
    const token = await register(srv, 'lobby_seat');
    const tableId = await hostTable(srv, token, 'Occupancy Room');
    const idle = (await srv.get('/api/lobby', { token })).data.tables.find((t) => t.id === tableId);
    assert.ok(idle.players >= 1 && idle.players <= idle.seats, 'an unopened table keeps the original demo count');
    assert.equal(idle.bots, 0);
    const ws = srv.socket(token);
    await ws.opened;
    ws.send({ type: 'join_table', tableId, buyin: 4000 });
    await ws.nextType('joined');
    const live = (await srv.get('/api/lobby', { token })).data.tables.find((t) => t.id === tableId);
    assert.ok(live.bots >= 1, 'bots fill some chairs');
    assert.equal(live.players, live.bots + 1, 'one human plus the bots');
    assert.equal(live.seated.length, live.players);
    assert.ok(live.seated.some((s) => s.nick === 'lobby_seat' && !s.bot && s.stack === 4000));
    await ws.close();
  } finally { await srv.stop(); }
});

test('notes follow the account through a rename and are not inherited by a new owner of the nick', async () => {
  const srv = await startServer();
  try {
    const owner = await register(srv, 'note_owner');
    const villain = await register(srv, 'villain_acct', 'OldNick');
    const villainId = await userId(srv, villain);
    assert.equal((await srv.post('/api/notes', { token: owner, body: { target: 'OldNick', note: 'calls too much', color: 'c6' } })).status, 200);
    assert.equal((await srv.post('/api/me/nick', { token: villain, body: { nick: 'NewNick' } })).status, 200);
    await register(srv, 'imposter_acct', 'OldNick');
    const { notes } = (await srv.get('/api/notes', { token: owner })).data;
    assert.equal(notes.length, 1);
    assert.equal(notes[0].target, 'NewNick', 'the note shows the current nick');
    assert.equal(notes[0].targetId, villainId);
    assert.equal(notes[0].key, `u:${villainId}`);
    // A blank note sent by key deletes it.
    await srv.post('/api/notes', { token: owner, body: { key: notes[0].key, note: '' } });
    assert.equal((await srv.get('/api/notes', { token: owner })).data.notes.length, 0);
  } finally { await srv.stop(); }
});

test('HUD stats follow the account id, not the nick', async () => {
  const srv = await startServer();
  try {
    const token = await register(srv, 'hud_viewer');
    const renamed = await register(srv, 'hud_renamed', 'Before');
    const renamedId = await userId(srv, renamed);
    const tableId = withDb(srv, (db) => {
      const id = db.prepare('SELECT id FROM tables WHERE enabled = 1 ORDER BY sort LIMIT 1').get().id;
      db.prepare(`INSERT INTO hands (hand_no,table_id,table_name,game,players,board,pot,result,actions) VALUES (1,?,'T','holdem',?,'',80,'{}',?)`)
        .run(id, JSON.stringify([{ id: renamedId, nick: 'Before', cards: ['Ah', 'Kh'], win: 0 }]),
          JSON.stringify([{ nick: 'Before', action: 'raise', amount: 40, street: 'preflop' }]));
      return id;
    });
    await srv.post('/api/me/nick', { token: renamed, body: { nick: 'After' } });
    await register(srv, 'hud_new_before', 'Before');
    const byId = (await srv.get(`/api/tables/${tableId}/hud?id=${renamedId}`, { token })).data.hud;
    assert.equal(byId.hands, 1);
    assert.equal(byId.pfr, 100);
    const afterNick = (await srv.get(`/api/tables/${tableId}/hud?nick=After`, { token })).data.hud;
    assert.equal(afterNick.hands, 1, 'the renamed player keeps their stats');
    const reused = (await srv.get(`/api/tables/${tableId}/hud?nick=Before`, { token })).data.hud;
    assert.equal(reused.hands, 0, 'the new owner of the old nick starts clean');
  } finally { await srv.stop(); }
});

test('a spent Time Bank Card stays spent after leaving and rejoining', async () => {
  const srv = await startServer();
  try {
    const token = await register(srv, 'tb_player');
    const id = await userId(srv, token);
    const tableId = await hostTable(srv, token, 'Time Bank Room');
    const ws = srv.socket(token);
    await ws.opened;
    ws.send({ type: 'join_table', tableId, buyin: 4000 });
    await ws.nextType('joined');
    await stateWith(ws, (s) => s.actor === id, 30000);
    ws.send({ type: 'timebank', tableId });
    await stateWith(ws, (s) => s.players.some((p) => p.id === id && p.timeBankCards === 2));
    ws.send({ type: 'leave_table', tableId });
    await stateWith(ws, (s) => !s.players.some((p) => p.id === id)).catch(() => {});
    const saved = withDb(srv, (db) => db.prepare('SELECT time_bank_cards c FROM users WHERE id = ?').get(id).c);
    assert.equal(saved, 2);
    await ws.close();
    // A fresh socket, so no state from the first sitting is still queued.
    const again = srv.socket(token);
    await again.opened;
    again.send({ type: 'join_table', tableId, buyin: 4000 });
    await again.nextType('joined');
    const rejoined = await stateWith(again, (s) => s.players.some((p) => p.id === id));
    assert.equal(rejoined.state.players.find((p) => p.id === id).timeBankCards, 2, 'no refill on rejoin');
    await again.close();
  } finally { await srv.stop(); }
});

test('an Add Chips retry with the same key debits once', async () => {
  const srv = await startServer();
  try {
    const token = await register(srv, 'rebuy_retry');
    const id = await userId(srv, token);
    const tableId = await hostTable(srv, token, 'Rebuy Room');
    const ws = srv.socket(token);
    await ws.opened;
    ws.send({ type: 'join_table', tableId, buyin: 4000 });
    await ws.nextType('joined');
    const before = await srv.balance(token);
    const debits = () => withDb(srv, (db) => db.prepare("SELECT COUNT(*) n FROM transactions WHERE user_id = ? AND kind = 'rebuy'").get(id).n);
    // Chips are only added outside a live hand; resend the same submission until it lands,
    // which is itself the retry being tested.
    for (let attempt = 0; attempt < 20 && debits() === 0; attempt++) {
      await stateWith(ws, (s) => {
        const me = s.players.find((p) => p.id === id);
        return me && (!me.inHand || me.folded || s.street === 'ended' || s.street === 'idle');
      }, 30000);
      ws.send({ type: 'rebuy', tableId, amount: 1000, idempotencyKey: 'dialog-1' });
      await new Promise((r) => setTimeout(r, 300));
    }
    assert.equal(debits(), 1, 'the first submission lands');
    for (let i = 0; i < 3; i++) ws.send({ type: 'rebuy', tableId, amount: 1000, idempotencyKey: 'dialog-1' });
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(debits(), 1, 'replays of the same submission never debit again');
    assert.equal(before - (await srv.balance(token)), 1000);
    await ws.close();
  } finally { await srv.stop(); }
});
