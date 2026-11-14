// Phone My Page hub: every entry opens a real pane or page, and the VIP bar stays in range.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_ROWS, PROMO_ROWS, QUICK_TILES, vipProgress } from '../src/lib/accountHub.ts';

// Panes MyPage.tsx renders, and routes App.tsx serves.
const PANES = new Set(['overview', 'wallet', 'transactions', 'missions', 'messages', 'notes', 'friends', 'verify', 'security']);
const ROUTES = new Set(['/settings', '/hand-history', '/propbet', '/support', '/rewards', '/ocean', '/promotions']);

test('every hub entry points at a pane or route that exists', () => {
  for (const entry of [...QUICK_TILES, ...PROMO_ROWS, ...ACCOUNT_ROWS]) {
    if ('tab' in entry.target) assert.ok(PANES.has(entry.target.tab), `${entry.key} → pane ${entry.target.tab}`);
    else assert.ok(ROUTES.has(entry.target.route), `${entry.key} → route ${entry.target.route}`);
  }
});

test('the quick tiles fill one six-wide row with unique keys', () => {
  assert.equal(QUICK_TILES.length, 6);
  assert.equal(new Set(QUICK_TILES.map((t) => t.key)).size, 6);
});

test('VIP progress uses the level² × 1200 curve', () => {
  assert.deepEqual(vipProgress(600, 1), { level: 1, pct: 50 });
  assert.deepEqual(vipProgress(4800 + 2400, 2), { level: 2, pct: 50 });
});

test('VIP progress survives missing or bad values', () => {
  assert.deepEqual(vipProgress(0, 0), { level: 1, pct: 0 });
  assert.deepEqual(vipProgress(-50, Number.NaN), { level: 1, pct: 0 });
  assert.deepEqual(vipProgress(1199, 1), { level: 1, pct: 100 });
});
