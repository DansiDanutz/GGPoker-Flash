import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { startServer } from './test-helpers.js';

for (const id of ['wsop-express-2', 'flip-go']) test(`server restart restores legacy tournament seats: ${id}`, async () => {
  const initial = await startServer();
  const { dataDir } = initial;
  await initial.stop();
  const db = new DatabaseSync(path.join(dataDir, 'ggpoker.db'));
  let tableId, players;
  try {
    const human = db.prepare("SELECT id FROM users WHERE login='DansiDanutz'").get();
    tableId = 'tourney-' + id;
    players = [
      { id: human.id, nick: 'bot-tourney-1-456', seat: 0, stack: 900 },
      { id: 'bot-tourney-1-123', nick: 'Opponent', seat: 1, stack: 700 },
    ];
    db.prepare("UPDATE tournaments SET status='running', enabled=1, entrants=2 WHERE id=?").run(id);
    db.prepare("INSERT OR REPLACE INTO tourney_state(tournament_id,state,updated_at) VALUES(?,?,datetime('now'))")
      .run(id, JSON.stringify({ version: 1, entrants: 2, level: 1, finished: [], flights: [{ id: tableId, index: 1, players }] }));
  } finally { db.close(); }

  const server = await startServer({ dataDir });
  let observer;
  try {
    observer = server.socket(await server.login('admin', 'admin123'));
    await observer.opened;
    observer.send({ type: 'join_table', tableId, observe: true });
    const { state } = await observer.nextType('state');
    const occupied = state.players.filter(p => !p.empty);
    assert.equal(state.handNo, 1);
    // Quick Flip can settle before observation. Undo that hand's awards and bets to compare opening stacks.
    const award = id => (state.result?.winners || []).filter(w => w.id === id).reduce((sum, w) => sum + w.amount, 0);
    assert.deepEqual(occupied.map(p => [p.id, p.isBot, p.seat, p.stack + p.totalBet - award(p.id)]),
      players.map((p, i) => [p.id, i === 1, p.seat, p.stack]));
  } finally {
    try { if (observer) await observer.close(); } finally { await server.stop(); }
  }
});
