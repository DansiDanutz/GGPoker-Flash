// Owner-set action length per cash table (Codex clone game-clock actionSeconds 5–300).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTableConfig, ACTION_SECONDS } from './validate.js';
import { PokerTable } from './table.js';

test('action_seconds is optional and bounded 5-300', () => {
  assert.deepEqual(ACTION_SECONDS, { min: 5, max: 300, default: 15 });
  assert.equal(parseTableConfig({}).value.action_seconds, null);
  assert.equal(parseTableConfig({ action_seconds: '' }).value.action_seconds, null);
  assert.equal(parseTableConfig({ action_seconds: 30 }).value.action_seconds, 30);
  assert.equal(parseTableConfig({ action_seconds: 4 }).ok, false);
  assert.equal(parseTableConfig({ action_seconds: 301 }).ok, false);
  assert.equal(parseTableConfig({ action_seconds: 'x' }).ok, false);
});

test('a table uses its configured action length, else the 15 s default', () => {
  const base = { id: 't', name: 'T', game: 'holdem', sb: 50, bb: 100, seats: 6, min_buyin: 100, max_buyin: 1e6 };
  assert.equal(new PokerTable(base, { onEvent: () => {} }).actionTimeMs, 15000);
  assert.equal(new PokerTable({ ...base, action_seconds: 30 }, { onEvent: () => {} }).actionTimeMs, 30000);
  assert.equal(new PokerTable({ ...base, action_seconds: 9999 }, { onEvent: () => {} }).actionTimeMs, 15000, 'out-of-range stored values fall back');
});

import { startServer } from './test-helpers.js';

test('admin saves a table action time; invalid values are rejected', async () => {
  const srv = await startServer();
  try {
    const token = await srv.login('admin', 'admin123');
    const body = { id: 'act-time-1', name: 'Slow table', game: 'holdem', sb: 50, bb: 100, min_buyin: 2000, max_buyin: 20000, seats: 6 };
    assert.equal((await srv.post('/api/admin/tables', { token, body: { ...body, action_seconds: 2 } })).status, 400);
    assert.equal((await srv.post('/api/admin/tables', { token, body: { ...body, action_seconds: 45 } })).status, 200);
    const { data } = await srv.get('/api/admin/tables', { token });
    const rows = data.tables || data;
    assert.equal(rows.find((t) => t.id === 'act-time-1').action_seconds, 45);
  } finally { await srv.stop(); }
});
