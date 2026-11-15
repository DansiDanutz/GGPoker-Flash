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

test('bet presets are cream chips with dark text, and the side icons sit on ringed discs', () => {
  const s = css();
  assert.match(rule(s, '.table-screen .action-bar .quick-bets button'), /background: linear-gradient\(#fbefcc, #e2c47a\); color: #1d1405;/);
  assert.match(rule(s, '.table-screen .dock-btn'), /box-shadow: 0 0 0 2px #e8b84a/);
});

test('Chat and React are round chip icon buttons like the time bank (speech bubble, smiley) that keep their names for screen readers', () => {
  const chat = read('src/components/table/TableChat.tsx');
  const toggles = chat.slice(chat.indexOf('<div className="tchat-buttons">'));
  assert.match(toggles, /aria-label=\{unread \? `Chat, \$\{unread\} unread` : 'Chat'\}/);
  assert.match(toggles, /aria-label="React"/);
  assert.equal((toggles.match(/<svg className="tchat-icon"/g) || []).length, 2, 'both buttons draw an icon');
  assert.doesNotMatch(toggles, />\s*Chat\s*\{|>React<\/button>/, 'no text label is drawn');
  // Drawn like the time-bank chip: same 46px, gold and black striped edge, dark centre, gold icon.
  const chip = rule(css(), '.table-screen .tchat-toggle');
  assert.match(chip, /width: 46px; height: 46px; padding: 0; border: 0; border-radius: 50%;/);
  assert.match(chip, /repeating-conic-gradient\(#e8b84a 0 20deg, #231c12 20deg 30deg\)/);
  assert.match(chip, /color: #f3c75a;/);
});
