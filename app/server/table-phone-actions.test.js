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
