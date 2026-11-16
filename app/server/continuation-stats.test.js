import test from 'node:test';
import assert from 'node:assert/strict';
import { continuationStats, continuationHud } from './continuation-stats.js';

const players = [
  { id: 1, nick: 'Aggressor', seat: 0, inHand: true, cards: ['Ah', 'Ad'] },
  { id: 2, nick: 'Caller', seat: 1, inHand: true, cards: ['Kh', 'Kd'] },
  { id: 3, nick: 'Third', seat: 2, inHand: true, cards: ['Qh', 'Qd'] },
];
const action = (seat, street, value, canRaise = true) => ({ seat, street, action: value, canRaise, nick: players[seat].nick });
const open = () => [action(0, 'preflop', 'raise'), action(1, 'preflop', 'call')];
const hand = (actions, extra = {}) => ({ game: 'holdem', players, actions, result: { reason: 'showdown' }, ...extra });

test('consecutive barrels and call responses are counted once per street', () => {
  const row = hand([...open(), action(1, 'flop', 'check'), action(0, 'flop', 'raise'), action(1, 'flop', 'call'), action(1, 'turn', 'check'), action(0, 'turn', 'raise'), action(1, 'turn', 'call')]);
  for (const street of ['flop', 'turn']) {
    assert.equal(continuationStats(row, 0)[`${street}CbOpportunities`], 1);
    assert.equal(continuationStats(row, 0)[`${street}CbBets`], 1);
    assert.equal(continuationStats(row, 1)[`${street}CbResponses`], 1);
    assert.equal(continuationStats(row, 1)[`${street}CbCalls`], 1);
  }
  const before = JSON.stringify(row);
  continuationStats(row, 0);
  assert.equal(JSON.stringify(row), before);
});

test('fold and raise responses use the unchanged continuation price only', () => {
  const folded = hand([...open(), action(1, 'flop', 'check'), action(0, 'flop', 'raise'), action(1, 'flop', 'fold')]);
  assert.equal(continuationStats(folded, 1).flopCbFolds, 1);
  const raised = hand([...open(), action(1, 'flop', 'check'), action(0, 'flop', 'raise'), action(1, 'flop', 'raise'), action(0, 'flop', 'call'), action(0, 'turn', 'check'), action(1, 'turn', 'raise'), action(0, 'turn', 'call')]);
  assert.equal(continuationStats(raised, 1).flopCbRaises, 1);
  assert.equal(continuationStats(raised, 1).turnCbOpportunities, 1);
});

test('checks, delayed bets and opponent leads do not manufacture continuation bets', () => {
  const checked = hand([...open(), action(0, 'flop', 'check'), action(1, 'flop', 'check'), action(0, 'turn', 'raise')]);
  assert.equal(continuationStats(checked, 0).flopCbOpportunities, 1);
  assert.equal(continuationStats(checked, 0).flopCbBets, 0);
  assert.equal(continuationStats(checked, 0).turnCbOpportunities, 0);
  const donk = hand([...open(), action(1, 'flop', 'raise'), action(0, 'flop', 'call')]);
  assert.equal(continuationStats(donk, 0).flopCbOpportunities, 0);
  const runout = hand(open());
  assert.equal(continuationStats(runout, 0).flopCbOpportunities, 0);
});

test('a re-raise excludes later responders and short all-in calls count as calls', () => {
  const multi = hand([action(0, 'preflop', 'raise'), action(1, 'preflop', 'call'), action(2, 'preflop', 'call'), action(1, 'flop', 'check'), action(2, 'flop', 'check'), action(0, 'flop', 'raise'), action(1, 'flop', 'raise'), action(2, 'flop', 'call')]);
  assert.equal(continuationStats(multi, 1).flopCbRaises, 1);
  assert.equal(continuationStats(multi, 2).flopCbResponses, 0);
  const short = hand([...open(), action(1, 'flop', 'check'), action(0, 'flop', 'raise'), action(1, 'flop', 'call')]);
  assert.equal(continuationStats(short, 1).flopCbCalls, 1);
});

test('incomplete traces and AoF are excluded while valid reads aggregate without mutation', () => {
  const valid = hand([...open(), action(0, 'flop', 'raise'), action(1, 'flop', 'call')]);
  assert.equal(continuationStats({ ...valid, game: 'aof' }, 0), null);
  assert.equal(continuationStats({ ...valid, result: null }, 0), null);
  const incomplete = valid.actions.map(({ canRaise, ...action }) => action);
  assert.equal(continuationStats({ ...valid, actions: incomplete }, 0), null);
  const total = continuationHud([valid, valid], 0);
  assert.equal(total.flopCbOpportunities, 2);
  assert.equal(total.flopCbBets, 2);
});
