// SPDX-License-Identifier: AGPL-3.0-only
// Run with Node from a checkout with app dependencies installed. No target URL or existing database is accepted.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { startServer } from '../../server/test-helpers.js';

const dir = mkdtempSync(join(tmpdir(), 'lobby-benchmark-'));
const dataDir = join(dir, 'data');
mkdirSync(dataDir);
// The fixture server must not inherit credentials or operator configuration.
for (const key of Object.keys(process.env)) if (!['PATH', 'TMPDIR', 'SystemRoot'].includes(key)) delete process.env[key];
const now = () => Number(process.hrtime.bigint()) / 1e6;
function stats(rows) {
  const ms = rows.map(([a,b]) => b-a).sort((a,b) => a-b);
  const quantile = q => ms.length ? Number(ms[Math.ceil(q*ms.length)-1].toFixed(2)) : null;
  return { count: ms.length, medianMs: quantile(.5), p95Ms: quantile(.95), maxMs: quantile(1) };
}
let server;
try {
  server = await startServer({ dataDir, env: { LOBBY_BENCH_DIR: dir, NODE_OPTIONS: '--import=' + new URL('./settlements.mjs', import.meta.url).href } });
  async function read() {
    const res = await fetch(server.base + '/api/lobby', {signal: AbortSignal.timeout(10000)});
    await res.arrayBuffer();
    assert.equal(res.status, 200);
  }
  for (let i=0; i<10; i++) await read();
  const base = now()+20;
  writeFileSync(join(dir,'go'), '');
  const rows = await Promise.all(Array.from({ length: 700 }, async (_,i) => {
    const due = base + 6*i;
    await wait(Math.max(0, due-now()));
    const start = now();
    await read();
    return [start, now(), start-due];
  }));
  const evidence = join(dir, 'transactions.json');
  const deadline = now() + 10000;
  while (!existsSync(evidence) && now() < deadline) await wait(50);
  assert.ok(existsSync(evidence), '200 reconciled settlements did not complete');
  const tx = JSON.parse(readFileSync(evidence));
  assert.equal(tx.length, 200);
  const active = rows.filter(([a,b]) => a >= tx[0][0] && b <= tx.at(-1)[1]);
  const overlaps = ([a,b]) => tx.some(([x,y]) => x <= b && y >= a);
  console.log(JSON.stringify({ requests: rows.length, transactions: tx.length, lateStarts: rows.filter(r=>r[2]>=6).length,
    overlap: stats(active.filter(overlaps)), otherActive: stats(active.filter(r=>!overlaps(r))) }, null, 2));
} finally {
  if (server) await server.stop();
  rmSync(dir, { recursive: true, force: true });
}
