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

test('already visible hero cards never receive the showdown flip that restarts their deal', () => {
  assert.match(src, /!p\.isMe && showdownReveals\[p\.seat\] != null && p\.reveal/);
  const css = fs.readFileSync(path.join(root, 'src/design-v2.css'), 'utf8');
  assert.match(css, /\.seat:not\(\.me\) \.cards\.showdown-reveal \.pcard/);
  assert.doesNotMatch(css, /\.seat \.cards\.showdown-reveal \.pcard/);
});

test('the public all-in badge requires an active committed hand, not merely an empty balance', () => {
  assert.match(src, /const committedAllIn = !!p\.allIn && !!p\.inHand && !p\.folded && state\?\.street !== 'ended' && state\?\.street !== 'idle'/);
  assert.match(src, /committedAllIn && <span className="all-in-badge"/);
});
