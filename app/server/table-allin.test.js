// All-in in the table's gold look: the seat label, the run-it panel and the ALL IN flash.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const css = () => read('src/table-allin.css');
const rule = (s, selector) => {
  const at = s.indexOf(selector + ' {');
  assert.ok(at >= 0, `missing rule ${selector}`);
  return s.slice(at, s.indexOf('}', at));
};

test('the all-in look loads after the table buttons, so it wins', () => {
  const main = read('src/main.tsx');
  assert.ok(main.indexOf('./table-allin.css') > main.indexOf('./table-buttons.css'));
});

test('the seat shows All-In on a gold pill with dark ink, not thin red text', () => {
  const pill = rule(css(), '.table-screen .seat .plate .st.st-allin');
  assert.match(pill, /background: linear-gradient\(#ffe07a, #f2a812\);/);
  assert.match(pill, /color: #231400;/);
  assert.match(pill, /border-radius: 999px;/);
});

test('the run-it panel is a dark panel with a gold edge, a gold title and cream choice chips', () => {
  const s = css();
  assert.match(rule(s, '.table-screen .straddle-ask'), /border: 2px solid #e8b84a;/);
  assert.match(rule(s, '.table-screen .straddle-ask-head b'), /color: #ffd36a;/);
  const chips = rule(s, '.table-screen .straddle-ask .action-row .btn');
  assert.match(chips, /background: linear-gradient\(#fbefcc, #e2c47a\);/);
  assert.match(chips, /border: 2px solid #e8b84a;/);
});

test('the ALL IN flash is gold lettering sized to fit a phone', () => {
  const s = css();
  assert.match(rule(s, '.table-screen .allin-flash span'), /background-clip: text;/);
  assert.match(s, /@media \(max-width: 760px\) \{\s*\.table-screen \.allin-flash span \{ font-size: 54px;/);
});
