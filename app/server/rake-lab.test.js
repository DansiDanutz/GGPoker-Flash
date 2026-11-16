// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { startServer } from './test-helpers.js';
import { previewRake } from './rake-lab.js';

test('preview math handles cap boundaries and rejects ambiguous parameters', () => {
  const query = value => new URLSearchParams(value);
  for (const [pot, rake] of [[0, 0], [19, 0], [20, 1], [5999, 299], [6000, 300], [20000, 300]]) {
    const result = previewRake(query(`pot=${pot}&percent=5&cap=300&flop=1`));
    assert.equal(result.rake, rake);
    assert.equal(result.remaining + result.rake, pot);
  }
  assert.equal(previewRake(query('pot=20000&percent=5&cap=300&flop=0')).rake, 0);
  for (const value of ['', 'pot=10&percent=5&cap=300&flop=1&extra=1', 'pot=9000000001&percent=5&cap=300&flop=1', 'pot=10&percent=5&cap=300&flop=2', 'pot=10&percent=6&cap=300&flop=1']) {
    assert.throws(() => previewRake(query(value)), { status: 400 });
  }
});

test('Rake Lab is free under paid enforcement and never changes financial balances', async (t) => {
  const srv = await startServer({ env: { GGPOKER_BIND: '127.0.0.1', GGPOKER_SEED_DEMO: '0', GGPOKER_USAGE_BILLING: 'enforce', GGPOKER_ORGANIZER_CHIPS: 'enforce' } });
  const db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'), { readOnly: true });
  t.after(async () => { db.close(); await srv.stop(); await rm(srv.dataDir, { recursive: true, force: true }); });
  const snapshot = () => JSON.stringify(['organizer_billing_accounts', 'organizer_billing_ledger', 'organizer_chip_accounts', 'organizer_chip_journals'].map(table => db.prepare(`SELECT * FROM ${table}`).all()));
  const before = snapshot();
  for (const [pot, percent, cap, flop, rake, capReached] of [
    [1000, 2, 300, 1, 20, false], [1000, 3, 300, 1, 30, false], [1000, 4, 300, 1, 40, false],
    [1000, 5, 300, 1, 50, false], [6000, 5, 300, 1, 300, true], [20000, 5, 300, 1, 300, true],
    [20000, 5, 300, 0, 0, false], [19, 5, 300, 1, 0, false], [0, 5, 300, 1, 0, false],
    [9_000_000_000, 5, 9_000_000_000, 1, 450_000_000, false],
  ]) {
    const response = await srv.get(`/api/plugins/rake-lab?pot=${pot}&percent=${percent}&cap=${cap}&flop=${flop}`);
    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.deepEqual(response.data, { pot, rakePercent: percent, rakeCap: cap, flopSeen: !!flop, rake, remaining: pot - rake, capReached });
    assert.equal(response.data.remaining + response.data.rake, pot);
  }
  assert.equal(snapshot(), before);
});

test('Rake Lab rejects invalid, missing, duplicate and unexpected inputs', async (t) => {
  const srv = await startServer({ env: { GGPOKER_BIND: '127.0.0.1', GGPOKER_SEED_DEMO: '0' } });
  t.after(async () => { await srv.stop(); await rm(srv.dataDir, { recursive: true, force: true }); });
  const valid = 'pot=6000&percent=5&cap=300&flop=1';
  for (const query of ['', valid + '&pot=1000', valid + '&organizerId=2', valid.replace('6000', '-1'), valid.replace('6000', '1.5'), valid.replace('6000', '1e3'), valid.replace('6000', '9000000001'), valid.replace('percent=5', 'percent=6'), valid.replace('cap=300', 'cap=0'), valid.replace('flop=1', 'flop=true')]) {
    const response = await srv.get('/api/plugins/rake-lab?' + query);
    assert.equal(response.status, 400, query);
    assert.equal(typeof response.data.error, 'string');
  }
  assert.equal((await srv.post('/api/plugins/rake-lab?' + valid, { body: {} })).status, 405);
});
