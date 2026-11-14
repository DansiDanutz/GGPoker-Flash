// Jackpot SNG lobby information (Info / Blind Structure / Payout), from the verified table.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spinInfo, SPIN_TICKET_TOTAL } from './spin.js';
import { startServer } from './test-helpers.js';

test('spinInfo lists every verified multiplier with odds, pool and places', () => {
  const info = spinInfo(5000);
  assert.equal(info.buyIn, 5000);
  assert.equal(info.seats, 3);
  assert.equal(info.payouts.length, 8);
  const top = info.payouts[0];
  assert.deepEqual({ m: top.multiplier, pool: top.prizePool, prizes: top.prizes }, { m: 20000, pool: 100_000_000, prizes: [50_000_000, 30_000_000, 20_000_000] });
  assert.equal(top.oneIn, SPIN_TICKET_TOTAL / 5);
  const x2 = info.payouts.find((p) => p.multiplier === 2);
  assert.equal(x2.blindUp, 'every 1 minute');
  assert.equal(info.payouts.find((p) => p.multiplier === 10).blindUp, 'every 10 hands');
  assert.equal(info.blinds[0].level, 1);
  assert.deepEqual([info.blinds[0].smallBlind, info.blinds[0].bigBlind], [10, 20]);
  assert.equal(info.startingChips, null, 'unobserved values are reported as unknown');
});

test('spinInfo rejects unobserved stakes', () => {
  assert.throws(() => spinInfo(1234), RangeError);
});

test('GET /api/spin/info serves the panel data and 400s on a bad stake', async () => {
  const srv = await startServer();
  try {
    const ok = await srv.get('/api/spin/info?buyin=10000');
    assert.equal(ok.status, 200);
    assert.equal(ok.data.info.payouts[0].prizePool, 200_000_000);
    assert.equal((await srv.get('/api/spin/info?buyin=7')).status, 400);
  } finally { await srv.stop(); }
});
