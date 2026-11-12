import test from 'node:test';
import assert from 'node:assert/strict';
import { NOTE_COLORS as CLIENT } from '../src/lib/noteColors.ts';
import { NOTE_COLORS as SERVER } from './player-labels.js';
import { noteColorHex, noteColorTitle, normalizeLabels } from '../src/lib/noteColors.ts';

test('client and server palettes match', () => {
  assert.deepEqual([...CLIENT], [...SERVER]);
});

test('noteColorHex maps ids, legacy names and junk', () => {
  assert.equal(noteColorHex('c0'), '#00B050');
  assert.equal(noteColorHex('red'), '#FF0000');
  assert.equal(noteColorHex('nope'), '#FFFF00');
  assert.equal(noteColorHex(undefined), '#FFFF00');
});

test('noteColorTitle prefers the owner title', () => {
  const labels = Array(10).fill('');
  labels[6] = 'Maniac';
  assert.equal(noteColorTitle('c6', labels), 'Maniac');
  assert.equal(noteColorTitle('red', labels), 'Maniac');
  assert.equal(noteColorTitle('c2', labels), 'Label 3');
  assert.equal(noteColorTitle('c10', labels), 'No label');
});

test('normalizeLabels always yields ten bounded single-line strings', () => {
  const out = normalizeLabels(['a\nb', 'x'.repeat(30), 5]);
  assert.equal(out.length, 10);
  assert.equal(out[0], 'a b');
  assert.equal(out[1].length, 20);
  assert.equal(out[2], '');
  assert.deepEqual(normalizeLabels(null), Array(10).fill(''));
});
