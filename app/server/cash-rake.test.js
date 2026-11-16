// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { cashRakeConfig } from './cash-rake.js';

test('legacy tables retain global rake and public or event tables ignore organizer cash overrides', () => {
  const global = (key) => key === 'rake_percent' ? 4 : 120;
  const legacy = { private: 1, chip_economy: 1, owner_id: 2, game: 'holdem' };
  const custom = { ...legacy, rake_percent: 2, rake_cap: 7 };
  assert.deepEqual(cashRakeConfig(legacy, global), { rakePercent: 4, rakeCap: 120 });
  assert.deepEqual(cashRakeConfig(custom, global), { rakePercent: 2, rakeCap: 7 });
  for (const row of [{ ...custom, private: 0 }, { ...custom, chip_economy: 0 }, { ...custom, game: 'spingold' }, { ...custom, tournamentId: 'event' }]) {
    assert.deepEqual(cashRakeConfig(row, global), { rakePercent: 4, rakeCap: 120 });
  }
  assert.equal(cashRakeConfig(legacy, (key) => key === 'rake_cap' ? 0 : 5).rakeCap, 300, 'match the engine fallback for a legacy zero cap');
});
