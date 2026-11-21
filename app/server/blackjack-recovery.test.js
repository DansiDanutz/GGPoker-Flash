// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';

test('restart refunds an interrupted Blackjack hand once and leaves settled hands alone', async () => {
  let srv = await startServer();
  try {
    const { token } = (await srv.post('/api/auth/guest', { body: {} })).data;
    const play = (action) => srv.post('/api/games/blackjack', { token, body: { action, bet: 100 } });
    await play('deal');
    const settled = (await play('stand')).data.balance;
    assert.equal((await play('deal')).data.balance, settled - 100);
    const { dataDir } = srv;
    for (let i = 0; i < 2; i++) {
      await srv.stop();
      srv = await startServer({ dataDir });
      assert.equal(await srv.balance(token), settled);
      assert.equal((await play('state')).data.active, false);
    }
  } finally { await srv.stop(); }
});
