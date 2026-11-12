// P0 slice R2: the Rush stake ladder migration inserts only missing rows, so a second boot adds nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const serverDir = import.meta.dirname;
const EXPECTED_POOLS = [
  'rush:50/100', 'rush:100/200', 'rush:250/500', 'rush:500/1000', 'rush:1000/2000',
  'rushplo:100/200', 'rushplo:500/1000',
];

// Boots db.js in a fresh process on `dataDir` (like a server start) and reports the Rush tables
// plus what an explicit ensureRushLadder() call inserts after that boot.
function boot(dataDir) {
  const script = `
    const { db, ensureRushLadder } = await import('./db.js');
    const rows = db.prepare("SELECT id, game, sb, bb, min_buyin, max_buyin FROM tables WHERE game IN ('rush','rushplo') ORDER BY id").all();
    process.stdout.write(JSON.stringify({ rows, again: ensureRushLadder() }));`;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: serverDir, env: { ...process.env, GGPOKER_DATA: dataDir }, encoding: 'utf8',
  });
  return JSON.parse(out);
}

test('Rush ladder seeds every pool and a second boot inserts nothing', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-rush-ladder-'));
  try {
    const first = boot(dataDir);
    const pools = [...new Set(first.rows.map((r) => `${r.game}:${r.sb}/${r.bb}`))].sort();
    assert.deepEqual(pools, [...EXPECTED_POOLS].sort());
    assert.equal(first.again, 0, 'a call right after the boot finds nothing missing');
    for (const r of first.rows) {
      assert.equal(r.min_buyin, r.bb * 20);
      assert.equal(r.max_buyin, r.bb * 100);
    }
    assert.equal(first.rows.filter((r) => r.id.startsWith('rush-platinum-')).length, 8, 'original pool kept');

    const second = boot(dataDir);
    assert.deepEqual(second.rows, first.rows, 'the second boot leaves the table set unchanged');
    assert.equal(second.again, 0);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('Rush ladder backfills only the missing rows on an existing database', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-rush-ladder-'));
  try {
    const first = boot(dataDir);
    const script = `
      const { db, ensureRushLadder } = await import('./db.js');
      db.prepare("DELETE FROM tables WHERE id IN ('rushplo-100-200-2', 'rush-50-100-1')").run();
      const added = ensureRushLadder();
      process.stdout.write(JSON.stringify({ added, again: ensureRushLadder() }));`;
    const out = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: serverDir, env: { ...process.env, GGPOKER_DATA: dataDir }, encoding: 'utf8',
    }));
    assert.deepEqual(out, { added: 2, again: 0 });
    assert.deepEqual(boot(dataDir).rows, first.rows);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
