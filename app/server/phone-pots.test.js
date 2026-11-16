// Phone table: main and side pots sit in a row above the total pot, never on the hero's cards.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('portrait pots are a centred row above the pot, not below the board', () => {
  const css = read('src/table-phone-pots.css');
  assert.match(css, /\.stage-portrait \.live-pots \{[^}]*top: auto;[^}]*bottom: calc\(100% \+ 30px\)/);
  assert.match(css, /\.stage-portrait \.live-pots \{[^}]*display: flex;[^}]*flex-wrap: wrap/);
  assert.match(css, /\.stage-portrait \.live-pot \{[^}]*transform: none !important/);
  assert.match(css, /\.stage-portrait \.live-pot \.pot-chips\.live \{ display: none; \}/);
});

test('the pots stylesheet loads after the base table styles', () => {
  const main = read('src/main.tsx');
  const pots = main.indexOf("import './table-phone-pots.css';");
  assert.ok(pots > main.indexOf("import './design-v2.css';") && pots > main.indexOf("import './responsive.css';"));
});
