// Phone table: the winner's amount is a readable plaque over the avatar, not text on the cards.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('portrait win amount is a solid centred plaque over the avatar', () => {
  const css = read('src/table-phone-win.css');
  const rule = css.match(/\.stage-portrait \.seat \.win-amount \{([^}]*)\}/)?.[1] || '';
  assert.match(rule, /top: 34%;/);
  assert.match(rule, /margin: 0 auto;/, 'centred without a transform, so the pop animation still runs');
  assert.match(rule, /border: 2px solid #e8b84a;/);
  assert.match(rule, /background-clip: border-box;/, 'undoes the clipped gradient text');
  assert.match(rule, /color: #ffe6a6;/);
});

test('it loads after table-premium.css, which styles the win amount', () => {
  const main = read('src/main.tsx');
  assert.ok(main.indexOf("import './table-phone-win.css';") > main.indexOf("import './table-premium.css';"));
});
