// Table buttons in strong, distinct colours that stand off the green felt and the dark panel.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const css = () => read('src/table-buttons.css');
const rule = (s, selector) => {
  const at = s.indexOf(selector + ' {');
  assert.ok(at >= 0, `missing rule ${selector}`);
  return s.slice(at, s.indexOf('}', at));
};

test('the button colours load after the dark table artwork, so they win', () => {
  const main = read('src/main.tsx');
  assert.ok(main.indexOf("./table-buttons.css") > main.indexOf("./table-art.css"));
  assert.ok(main.indexOf("./table-buttons.css") > main.indexOf("./table-phone-look.css"));
});

test('Fold, Call and Raise are solid red, green and gold with a light edge, not dark art', () => {
  const s = css();
  assert.match(rule(s, '.table-screen .action-bar .act-btn'), /border-image: none; border: 2px solid;/);
  assert.match(rule(s, '.table-screen .action-bar .act-btn.act-fold'), /background: linear-gradient\(#ef5a5f, #b81f2a\);/);
  assert.match(rule(s, '.table-screen .action-bar .act-btn.act-call'), /background: linear-gradient\(#3ee07a, #139447\);/);
  assert.match(rule(s, '.table-screen .action-bar .act-btn.act-allin'), /background: linear-gradient\(#ffe07a, #f2a812\);[^}]*color: #231400;/);
});

test('when it is not your turn the buttons keep their colours but are clearly greyed', () => {
  assert.match(rule(css(), '.table-screen .action-bar .act-btn:disabled'), /filter: saturate\(\.25\) brightness\(\.62\);/);
});

test('bet presets are cream chips with dark text, and Chat/React are light pills', () => {
  const s = css();
  assert.match(rule(s, '.table-screen .action-bar .quick-bets button'), /background: linear-gradient\(#fbefcc, #e2c47a\); color: #1d1405;/);
  assert.match(rule(s, '.table-screen .tchat-toggle'), /background: #f4ead2;[^}]*color: #1a1408;/);
  assert.match(rule(s, '.table-screen .dock-btn'), /box-shadow: 0 0 0 2px #e8b84a/);
});
