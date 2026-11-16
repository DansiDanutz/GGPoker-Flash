import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionStats } from './session-stats.js';

const me = (extra = {}) => ({ id: 1, nick: 'Hero', seat: 0, inHand: true, folded: false, cards: ['Ah', 'Ad'], sessionId: 'table:session', sessionStartedAt: 1000, win: 0, uncalledReturn: 0, ...extra });
const opponent = { id: 2, nick: 'Other', seat: 1, inHand: true, folded: false, cards: ['Kh', 'Kd'], win: 0 };
const row = (id, player, result) => ({ id, hand_id: `hand-${id}`, game: 'holdem', players: [player, opponent], result });

test('session metrics count dealt hands, showdown wins and non-showdown wins once', () => {
  const rows = [
    row(3, me({ win: 50 }), { reason: 'fold', winners: [{ id: 1, amount: 50 }] }),
    row(2, me({ win: 75, uncalledReturn: 25 }), { reason: 'showdown', winners: [{ id: 1, amount: 50 }] }),
    row(1, me({ sessionId: 'older', sessionStartedAt: 500, win: 500 }), { reason: 'showdown', winners: [{ id: 1, amount: 500 }] }),
  ];
  assert.deepEqual(sessionStats(rows, 0), {
    known: true, sessionId: 'table:session', sessionStartedAt: 1000,
    hands: 2, showdowns: 1, showdownWins: 1, nonShowdownWins: 1,
  });
});

test('split awards count as showdown wins and repeated identities do not double-count', () => {
  const player = me({ win: 50 });
  const duplicate = row(2, player, { reason: 'showdown', winners: [{ id: 1, amount: 50 }, { id: 2, amount: 50 }] });
  const stats = sessionStats([duplicate, duplicate], 0);
  assert.equal(stats.hands, 1);
  assert.equal(stats.showdownWins, 1);
});

test('folded players and uncalled-only returns are not showdown wins', () => {
  const folded = row(2, me({ folded: true }), { reason: 'showdown', winners: [{ id: 2, amount: 100 }] });
  assert.equal(sessionStats([folded], 0).showdowns, 0);
  const uncalled = row(3, me({ win: 100, uncalledReturn: 100 }), { reason: 'showdown', winners: [{ id: 1, amount: 100 }] });
  assert.equal(sessionStats([uncalled], 0).showdownWins, 0);
});

test('missing sessions and legacy records remain explicitly unavailable', () => {
  assert.equal(sessionStats([], 0).known, false);
  assert.equal(sessionStats([], 0).hands, null);
  const legacy = row(1, me({ sessionId: null, sessionStartedAt: null }), { reason: 'showdown', winners: [] });
  assert.equal(sessionStats([legacy], 0).known, false);
  assert.equal(sessionStats([legacy], 0).hands, null);
});
