// The run-it choice reads at a glance on a phone: a big count and one short word, never wrapping.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runsShort } from '../src/game/runChoice.ts';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('each choice has a short word that fits one line', () => {
  assert.deepEqual([1, 2, 3].map(runsShort), ['Once', 'Twice', '3 times']);
  assert.equal(runsShort(4), '4 times');
});

test('the buttons show the count and the word, and keep the full name for screen readers', () => {
  const src = read('src/pages/TablePage.tsx');
  assert.match(src, /className="run-n">\{runs\}×<\/b>/);
  assert.match(src, /className="run-word">\{runsShort\(runs\)\}<\/span>/);
  assert.match(src, /aria-label=\{runsLabel\(runs\)\}/);
  assert.match(src, /className=\{'btn run-choice' \+ \(runs === 1 \? ' run-once' : ''\)\}/);
});

test('the choice styles stop the label wrapping', () => {
  const css = read('src/table-allin.css');
  assert.match(css, /\.run-ask \.action-row \.run-choice \{[^}]*flex-direction: column/);
  assert.match(css, /\.run-ask \.run-choice \.run-word \{[^}]*white-space: nowrap/);
  assert.match(css, /\.run-ask \.run-choice \.run-n \{[^}]*font-size: 2[0-9]px/);
});
