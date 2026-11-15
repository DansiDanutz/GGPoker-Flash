// Table step 1 (client): the run-it choice panel, extra boards, private rabbit hunt, sit-out clock placement.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runChoice, runsLabel } from '../src/game/runChoice.ts';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('runChoice offers 1..maxRuns with a whole-second countdown', () => {
  assert.equal(runChoice(null, 0), null);
  const m = runChoice({ endsAt: 10_000, maxRuns: 3, chosen: null }, 2_500);
  assert.deepEqual(m, { secondsLeft: 8, options: [1, 2, 3], chosen: null });
  assert.equal(runChoice({ endsAt: 1_000, maxRuns: 2, chosen: 2 }, 5_000).secondsLeft, 0);
  assert.deepEqual(runChoice({ endsAt: 1_000, maxRuns: 2, chosen: 2 }, 0).options, [1, 2]);
});

test('runsLabel names each choice', () => {
  assert.deepEqual([1, 2, 3].map(runsLabel), ['Run it once', 'Run it twice', 'Run it three times']);
});

test('the table sends the run choice and draws every extra board', () => {
  const src = read('src/pages/TablePage.tsx');
  assert.match(src, /type: 'run_decide', tableId, runs/);
  assert.match(src, /\(state\?\.boards \?\? \[\]\)\.slice\(1\)\.map/);
  assert.match(src, /className="extra-boards"/, 'extra runs stack under the main board');
  assert.doesNotMatch(src, /runItTwice: !state\?\.runItTwice/, 'no table-wide switch any player can flip');
  assert.match(src, /runItAsk: !\(me\?\.runItAsk \?\? true\)/, 'the menu toggles the player\'s own preference');
});

test('rabbit hunt is offered only to players dealt into the hand', () => {
  assert.match(read('src/pages/TablePage.tsx'), /const canRabbit = !!me\?\.inHand && /);
});

test('the sit-out clock sits in the sit-out bar, not on the board', () => {
  const src = read('src/pages/TablePage.tsx');
  assert.doesNotMatch(src, /<div className="sit-out-clock"/);
  assert.match(src, /className="sit-out-clock-inline"/);
});
