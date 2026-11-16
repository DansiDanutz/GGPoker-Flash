import test from 'node:test';
import assert from 'node:assert/strict';
import { createRimt, applyRimt, readRimt } from './rimt.js';

const create = () => createRimt({ handId: 'table-1-hand-1', proposer: 0, decider: 1, now: 1000, proposalMs: 15000, decisionMs: 15000 });

test('one run resolves immediately and remains idempotent after its deadline', () => {
  const state = applyRimt(create(), { action: 'suggest', handId: 'table-1-hand-1', seat: 0, runs: 1 }, 1001);
  assert.equal(state.runs, 1);
  assert.equal(state.reason, 'once');
  assert.deepEqual(applyRimt(state, { action: 'suggest', handId: 'table-1-hand-1', seat: 0, runs: 1 }, 99999), state);
});

test('two and three runs require the decider and persist acceptance', () => {
  for (const runs of [2, 3]) {
    const proposed = applyRimt(create(), { action: 'suggest', handId: 'table-1-hand-1', seat: 0, runs }, 1001);
    assert.equal(proposed.runs, null);
    const accepted = applyRimt(proposed, { action: 'decide', handId: 'table-1-hand-1', seat: 1, agreed: true }, 1002);
    assert.equal(accepted.runs, runs);
    assert.equal(accepted.reason, 'agreed');
    assert.deepEqual(readRimt(JSON.parse(JSON.stringify(accepted))), accepted);
  }
});

test('decline resolves to one run and is not reported as timeout', () => {
  const proposed = applyRimt(create(), { action: 'suggest', handId: 'table-1-hand-1', seat: 0, runs: 3 }, 1001);
  const declined = applyRimt(proposed, { action: 'decide', handId: 'table-1-hand-1', seat: 1, agreed: false }, 1002);
  assert.equal(declined.runs, 1);
  assert.equal(declined.reason, 'declined');
});

test('proposal and decision deadlines resolve to one run without calling it refusal', () => {
  const expired = applyRimt(create(), { action: 'expire', handId: 'table-1-hand-1' }, 16000);
  assert.equal(expired.reason, 'timeout');
  const proposed = applyRimt(create(), { action: 'suggest', handId: 'table-1-hand-1', seat: 0, runs: 2 }, 1001);
  const decided = applyRimt(proposed, { action: 'expire', handId: 'table-1-hand-1' }, 16001);
  assert.equal(decided.reason, 'timeout');
  assert.equal(decided.runs, 1);
});

test('wrong actors, stale hands and changed choices conflict without mutation', () => {
  const state = create();
  assert.throws(() => applyRimt(state, { action: 'suggest', handId: 'table-1-hand-1', seat: 1, runs: 2 }, 1001), /seat/);
  assert.throws(() => applyRimt(state, { action: 'suggest', handId: 'other', seat: 0, runs: 2 }, 1001), /hand/);
  const proposed = applyRimt(state, { action: 'suggest', handId: 'table-1-hand-1', seat: 0, runs: 2 }, 1001);
  assert.throws(() => applyRimt(proposed, { action: 'suggest', handId: 'table-1-hand-1', seat: 0, runs: 3 }, 1002), /proposal/);
  assert.deepEqual(applyRimt(proposed, { action: 'suggest', handId: 'table-1-hand-1', seat: 0, runs: 2 }, 99999), proposed);
});
