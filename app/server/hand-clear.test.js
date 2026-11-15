// The next hand is never dealt while the last one is still on the table: the server's gap after a
// hand covers the client's whole end-of-hand show (card reveal, pot slide, WIN banner).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FOLD_WIN_BOT_MS, FOLD_WIN_MS, SHOWDOWN_CLEAR_MS, CLEAR_MARGIN_MS } from './handPacing.js';
import { showdownComplete, WIN_BANNER_MS } from '../src/game/showdown.ts';
import { PAYOUT_TRANSFER_MS, PAYOUT_HOLD_MS, PAYOUT_FADE_MS } from '../src/game/payoutMotion.ts';
import fs from 'node:fs';
import { PokerTable } from './table.js';

const PAYOUT_MS = PAYOUT_TRANSFER_MS + PAYOUT_HOLD_MS + PAYOUT_FADE_MS;

test('a showdown is cleared (reveal, pot slide, WIN banner) before the next deal', () => {
  const reveal = showdownComplete([0, 1, 2, 3, 4, 5]);
  assert.ok(SHOWDOWN_CLEAR_MS >= reveal + Math.max(WIN_BANNER_MS, PAYOUT_MS) + CLEAR_MARGIN_MS);
});

test('a fold win is cleared before the next deal, with the WIN banner when a player wins', () => {
  assert.ok(FOLD_WIN_BOT_MS >= PAYOUT_MS + CLEAR_MARGIN_MS);
  assert.ok(FOLD_WIN_MS >= Math.max(WIN_BANNER_MS, PAYOUT_MS) + CLEAR_MARGIN_MS);
});

test('a table waits the full showdown clear, even after an all-in runout', () => {
  const t = new PokerTable({ id: 't', name: 'T', sb: 1, bb: 2, seats: 6, minBuyin: 40, maxBuyin: 200 });
  assert.equal(t.showdownDelay, SHOWDOWN_CLEAR_MS);
  const src = fs.readFileSync(new URL('./table.js', import.meta.url), 'utf8');
  assert.equal((src.match(/this\.showdownDelay = /g) || []).length, 1, 'no shorter delay after a runout');
  assert.match(src, /winner && winner\.isBot \? FOLD_WIN_BOT_MS : FOLD_WIN_MS/);
});

test('a reload pulls the next deal in, but not before the last hand has cleared', () => {
  const t = new PokerTable({ id: 't', name: 'T', sb: 1, bb: 2, seats: 6, minBuyin: 40, maxBuyin: 200 });
  t.street = 'ended';
  t.nextHandAt = t.handClearAt = Date.now() + SHOWDOWN_CLEAR_MS;
  t.clearRebuyHold(1);
  assert.ok(t.nextHandAt >= t.handClearAt, 'the showdown still plays out');
});
