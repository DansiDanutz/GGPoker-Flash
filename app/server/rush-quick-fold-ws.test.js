// End to end over the socket: a Rush quick fold before your turn moves you to a new table of
// the pool at once, and the folded hand is still in your history. Non-Rush tables refuse it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';

const RUSH_TABLE = 'rush-platinum-1';
const OPPORTUNITY_TIMEOUT_MS = 40_000;

async function registerAndJoin(srv, login, tableId, buyin) {
  const res = await srv.post('/api/auth/register', { body: { login, nick: login, password: 'secret12' } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const sock = srv.socket(res.data.token);
  await sock.opened;
  sock.send({ type: 'join_table', tableId, buyin });
  return { sock, token: res.data.token, id: res.data.user.id };
}

/** The next state where the hero may quick fold while someone else is to act. */
const quickFoldWindow = (id) => (m) => m.type === 'state' && m.state.quickFold?.allowed
  && m.state.actor !== id && m.state.players.some((p) => p.id === id && p.inHand && !p.folded);

test('quick fold over the socket: instant move, and the folded hand stays in history', { timeout: 90_000 }, async () => {
  const srv = await startServer();
  try {
    const { sock, token, id } = await registerAndJoin(srv, 'qf_hero', RUSH_TABLE, 20_000);
    const window = await sock.next(quickFoldWindow(id), OPPORTUNITY_TIMEOUT_MS);
    const { handNo } = window.state;
    // A quick fold aimed at an earlier hand is refused by the action-version check.
    sock.send({ type: 'action', tableId: RUSH_TABLE, action: 'quickfold', handNo: handNo - 1 });
    const stale = await sock.next((m) => m.type === 'error' && m.stale, 5000);
    assert.equal(stale.handNo, handNo);
    sock.send({ type: 'action', tableId: RUSH_TABLE, action: 'quickfold', handNo });
    const moved = await sock.next((m) => m.type === 'rush_move' || m.type === 'rush_queued', 5000);
    if (moved.type === 'rush_move') {
      assert.notEqual(moved.tableId, RUSH_TABLE);
      assert.ok(moved.stack > 0 && moved.stack <= 20_000, 'the stack moves, minus what was bet');
    }
    // The old hand finishes without the hero; then it is in their history.
    let mine = null;
    for (let i = 0; i < 40 && !mine; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const { data } = await srv.get('/api/hands', { token });
      mine = (data.hands || []).find((h) => h.tableId === RUSH_TABLE && h.handNo === handNo) || null;
    }
    assert.ok(mine, 'the quick-folded hand is in the hero\'s history');
    const row = mine.players.find((p) => p.id === id);
    assert.equal(row.folded, true);
    assert.equal(row.cards.length, 2, 'the hero still sees their own folded cards');
    await sock.close();
  } finally {
    await srv.stop();
  }
});

test('regression: a non-Rush table refuses quickfold', { timeout: 30_000 }, async () => {
  const srv = await startServer();
  try {
    const { sock } = await registerAndJoin(srv, 'qf_cash', 'nlh-diamond-01', 50_000);
    await sock.nextType('joined', 5000);
    sock.send({ type: 'action', tableId: 'nlh-diamond-01', action: 'quickfold' });
    const err = await sock.nextType('error', 5000);
    assert.equal(err.error, 'cannot quick fold');
    await sock.close();
  } finally {
    await srv.stop();
  }
});
