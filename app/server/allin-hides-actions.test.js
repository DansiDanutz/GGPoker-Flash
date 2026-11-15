// The betting buttons are on screen only while it is the hero's decision, as on GGPoker mobile.
// While another player acts the hero sees the pre-action checkboxes alone (no greyed Fold /
// Check / Bet underneath), and once all in, folded or out of the hand there are none at all
// (no "All in $0.00" under the run-it panel). The status row always stays.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(root, 'src/pages/TablePage.tsx'), 'utf8');

test('the action rows render only on the hero\'s turn', () => {
  assert.match(src, /\{!myTurn \? null : state\?\.allInOrFold \? \(/);
  assert.doesNotMatch(src, /heroAllIn/, 'the turn check already covers all in: an all-in player never acts');
});

test('pre-actions still show while another player acts', () => {
  assert.match(src, /const canPreAct = !!\(state && me && !myTurn && me\.inHand && !me\.folded && !me\.allIn/);
  assert.match(src, /\{canPreAct && !squeezing && \(/);
});

test('the status row with hand number and stack is not part of the hidden block', () => {
  const hidden = src.indexOf('{!myTurn ? null : state?.allInOrFold ? (');
  const end = src.indexOf('</div>\n        )}\n        <div className="action-row status-row"');
  assert.ok(hidden > 0 && end > hidden, 'status row follows the hidden block');
});
