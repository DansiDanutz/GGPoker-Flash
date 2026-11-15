// Once the hero is all in there is nothing left to decide, so the betting buttons step aside
// (no greyed Fold / Check / "All in $0.00" under the run-it panel). The status row stays.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(root, 'src/pages/TablePage.tsx'), 'utf8');

test('the hero being all in in this hand is derived once', () => {
  assert.match(src, /const heroAllIn = !!\(me && me\.inHand && me\.allIn && !me\.folded\);/);
});

test('the action rows render only while the hero still has chips to act with', () => {
  assert.match(src, /\{heroAllIn \? null : state\?\.allInOrFold \? \(/);
});

test('the status row with hand number and stack is not part of the hidden block', () => {
  const hidden = src.indexOf('{heroAllIn ? null : state?.allInOrFold ? (');
  const status = src.indexOf('<div className="action-row status-row"');
  const end = src.indexOf('</div>\n        )}\n        <div className="action-row status-row"');
  assert.ok(hidden > 0 && end > hidden && status > end, 'status row follows the hidden block');
});
