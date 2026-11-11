import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.GGPOKER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'dangro-claims-'));
const { db, bumpMission, claimReward, getClaim } = await import('./db.js');
const [u1, u2] = db.prepare('SELECT id FROM users ORDER BY id LIMIT 2').all();

test('mission progress and claims are per user', () => {
  bumpMission(u1.id, 'daily-hands', 20);
  assert.equal(getClaim(u1.id, 'mission', 'daily-hands').progress, 20);
  assert.equal(getClaim(u2.id, 'mission', 'daily-hands'), undefined);

  const first = claimReward(u1.id, 'mission', 'daily-hands', 5000, 'USD', 'hands');
  assert.equal(first.claimed, true);
  const second = claimReward(u1.id, 'mission', 'daily-hands', 5000, 'USD', 'hands');
  assert.equal(second.claimed, false);
  assert.equal(getClaim(u1.id, 'mission', 'daily-hands').claimed, 1);

  bumpMission(u2.id, 'daily-hands', 20);
  assert.equal(claimReward(u2.id, 'mission', 'daily-hands', 5000, 'USD', 'hands').claimed, true);
});

test('daily claim is once per period and survives a retry', () => {
  const a = claimReward(u1.id, 'daily', '2026-11-11', 500, 'USD', 'daily');
  const b = claimReward(u1.id, 'daily', '2026-11-11', 500, 'USD', 'daily');
  assert.equal(a.claimed, true);
  assert.equal(b.claimed, false);
  assert.equal(getClaim(u1.id, 'daily', '2026-11-11').claimed, 1);
});
