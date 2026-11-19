// The bet confirmation bar must be easy to read and never sit under the slider or time-bank chip.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const css = () => read('src/table-confirm.css');

test('the confirm bar is a named row with its own text and buttons, not inline styles', () => {
  const page = read('src/pages/TablePage.tsx');
  assert.match(page, /className=\{.*action-row confirm-row.*confirm-allin.*\} role="alertdialog" aria-label="Confirm bet"/);
  assert.match(page, /<span className="confirm-text">/);
  assert.match(page, /className="btn confirm-cancel"/);
  assert.match(page, /className="btn confirm-skip"/);
  assert.doesNotMatch(page, /rgba\(217,168,60,\.12\)/);
});

test('it is a solid dark panel with a gold edge and large text, above the floating controls', () => {
  const s = css();
  assert.match(s, /\.table-screen \.action-bar \.confirm-row \{[^}]*position: relative; z-index: 6;/);
  assert.match(s, /\.table-screen \.action-bar \.confirm-row \{[^}]*border: 2px solid #e8b84a;/);
  assert.match(s, /\.table-screen \.action-bar \.confirm-row \.confirm-text \{[^}]*font-size: 16px;[^}]*color: #fff/);
  assert.match(s, /\.table-screen \.action-bar \.confirm-row \.confirm-skip \{[^}]*background: linear-gradient\(#fbefcc, #e2c47a\)/);
});

test('while confirming on phone, the slider column steps aside and the time bank lifts above the bar', () => {
  const s = css();
  assert.match(s, /\.action-bar:has\(\.confirm-row\) \.main-actions \.bet-slider/);
  assert.match(s, /\.action-bar:has\(\.confirm-row\) \.main-actions::after/);
  assert.match(s, /\.action-bar:has\(\.confirm-row\) \.main-actions \.bet-stepper > \* \{ display: none; \}/);
  assert.match(s, /\.action-bar:has\(\.confirm-row\) \.main-actions \.tb-btn \{ bottom: calc\(100% \+ 96px\); \}/);
});

test('the confirm styles load after the button colours', () => {
  const main = read('src/main.tsx');
  assert.ok(main.indexOf("./table-confirm.css") > main.indexOf("./table-buttons.css"));
  assert.ok(main.indexOf("./table-confirm.css") < main.indexOf("./table-tips.css"));
});
