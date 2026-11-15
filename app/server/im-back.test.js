// A player who times out is folded and sat out; an "I'm back" button deals them in again.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rule = (s, selector) => {
  const at = s.indexOf(selector + ' {');
  assert.ok(at >= 0, `missing rule ${selector}`);
  return s.slice(at, s.indexOf('}', at));
};

test('the sit-out row offers an "I\'m back" button that sits the player back in', () => {
  const page = read('src/pages/TablePage.tsx');
  const row = page.slice(page.indexOf('<div className="action-row sitout-row">'));
  assert.match(row, /<button className="btn btn-back" onClick=\{\(\) => send\(\{ type: 'sit_out', value: false \}\)\}>I'm back<\/button>/);
  assert.doesNotMatch(page, /Deal Me In<\/button>/);
});

test('a timeout explains how to come back', () => {
  assert.match(read('src/pages/TablePage.tsx'), /You ran out of time, so you are sitting out\. Press "I'm back" to play again\./);
});

test('while sitting out the action bar is marked, so phones swap the dead buttons for I\'m back', () => {
  assert.match(read('src/pages/TablePage.tsx'), /'action-bar' \+ \(squeezing \? ' squeeze-lock' : ''\) \+ \(sittingOut \? ' sitting-out' : ''\)/);
  const phone = read('src/table-phone.css');
  assert.match(rule(phone, '  .table-screen .action-bar.sitting-out .main-actions'), /display: none;/);
  assert.match(rule(phone, '  .table-screen .action-bar.sitting-out .sitout-row .btn-back'), /height: 54px;/);
});

test('I\'m back is a green button with the shared gold edge', () => {
  const s = rule(read('src/table-buttons.css'), '.table-screen .action-bar .sitout-row .btn-back');
  assert.match(s, /background: linear-gradient\(#3ee07a, #139447\);/);
  assert.match(s, /border: 2px solid #e8b84a;/);
});
