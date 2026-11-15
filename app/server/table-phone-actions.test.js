// Phone action panel (mobile mockup): presets on top, Fold/Call/Raise in one row,
// a vertical bet slider on the right edge, big tilted hero cards and a draining turn ring.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const css = () => read('src/table-phone.css');
const PHONE = /@media \(max-width: 760px\) and \(orientation: portrait\)/;

test('the phone stylesheet loads after the table art', () => {
  const main = read('src/main.tsx');
  assert.ok(main.indexOf("./table-phone.css") > main.indexOf("./table-art.css"));
});

test('the main action row is marked so phones can lay it out as a grid', () => {
  const page = read('src/pages/TablePage.tsx');
  assert.match(page, /className="action-row main-actions"/);
  const s = css();
  assert.match(s, PHONE);
  assert.match(s, /grid-template-areas:\s*"presets presets presets"\s*"fold call raise"/);
});

test('on phones the bet slider stands upright on the right edge', () => {
  const s = css();
  assert.match(s, /\.bet-slider[^{]*\{[^}]*writing-mode: vertical-lr/);
  assert.match(s, /\.bet-slider[^{]*\{[^}]*direction: rtl/);
  assert.match(s, /\.bet-stepper[^{]*\{[^}]*position: absolute/);
});

test('the turn ring drains with the clock', () => {
  const page = read('src/pages/TablePage.tsx');
  assert.match(page, /className="timer" style=\{\{ '--turn': timerPct \} as React\.CSSProperties\}/);
  assert.match(read('src/table-art.css'), /conic-gradient\(#000 calc\(var\(--turn, 1\) \* 360deg\)/);
});

test('hero cards are big and fanned on phones', () => {
  const s = css();
  assert.match(s, /\.seat\.me \.cards \.card-slot:first-child[^{]*\{[^}]*rotate\(-/);
  assert.match(s, /\.seat\.me \.cards \.card-slot:last-child[^{]*\{[^}]*rotate\(/);
});

test('the phone top bar has a round menu button on the left and keeps Leave table in the menu', () => {
  const page = read('src/pages/TablePage.tsx');
  assert.match(page, /className="table-menu-btn" aria-label="Table menu"/);
  assert.match(page, /className="table-leave-btn"/);
  assert.match(page, /<button onClick=\{\(\) => setConfirmLeave\(true\)\}>Leave table<\/button>/, 'the menu still offers Leave table');
  const s = css();
  assert.match(s, /\.table-topbar \.table-menu-btn \{[^}]*order: -1/);
  assert.match(s, /\.table-topbar \.table-leave-btn \{ display: none; \}/);
});

test('the four pre-actions fit one row on phones', () => {
  assert.match(css(), /\.reserved-actions button \{[^}]*width: calc\(25% - 4px\)/);
});

test('phone: time bank is a small round button clear of the bet rows, the leaderboard reads as the title subtitle', () => {
  const css = fs.readFileSync(path.join(root, 'src/table-phone.css'), 'utf8');
  const tb = css.match(/\.main-actions \.tb-btn \{([^}]*)\}/)[1];
  assert.match(tb, /border-radius:\s*50%/);
  assert.match(tb, /bottom:\s*calc\(100% \+ 10px\)/, 'sits in the empty pre-action slot, not on the presets');
  assert.match(css, /\.main-actions \.tb-btn \.tb-label \{[^}]*display:\s*none/);
  assert.match(css, /\.daily-lb:not\(\.open\) \.daily-lb-ribbon \{[^}]*background:\s*none/);
  assert.match(css, /\.table-topbar \.name \{[^}]*align-self:\s*flex-start/);
  const page = fs.readFileSync(path.join(root, 'src/pages/TablePage.tsx'), 'utf8');
  assert.match(page, /<span className="tb-label">⏱ \{tbUsed && !tbCards \? 'No cards' : tbUsed \? 'Used' : 'Time bank'\}<\/span>/);
});
