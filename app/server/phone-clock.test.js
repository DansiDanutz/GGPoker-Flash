// Phone table: an opponent's countdown is centred on top of their seat, not out on the felt.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('portrait clock is centred above the seat', () => {
  const css = read('src/table-phone-clock.css');
  assert.match(css, /\.stage-portrait \.seat \.native-clock \{[^}]*left: 50%;[^}]*bottom: calc\(100% - 4px\);[^}]*transform: translateX\(-50%\)/);
});

test('it loads after responsive.css, which also places the clock', () => {
  const main = read('src/main.tsx');
  assert.ok(main.indexOf("import './table-phone-clock.css';") > main.indexOf("import './responsive.css';"));
});

test('the hero keeps the round turn badge, not this clock', () => {
  assert.match(read('src/table-hero-peel.css'), /\.seat\.me \.native-clock \{ display: none; \}/);
});
