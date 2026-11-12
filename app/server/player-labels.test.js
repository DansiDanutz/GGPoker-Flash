import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  NOTE_COLORS, LABEL_COUNT, LABEL_MAX, normalizeNoteColor, cleanLabels, createPlayerLabels,
} from './player-labels.js';

test('native palette has eleven colours and ten titled labels', () => {
  assert.equal(NOTE_COLORS.length, 11);
  assert.equal(LABEL_COUNT, 10);
  assert.equal(LABEL_MAX, 20);
});

test('note colours accept native ids and map legacy names', () => {
  assert.equal(normalizeNoteColor('c0'), 'c0');
  assert.equal(normalizeNoteColor('c10'), 'c10');
  assert.equal(normalizeNoteColor('yellow'), 'c9');
  assert.equal(normalizeNoteColor('green'), 'c0');
  assert.equal(normalizeNoteColor('red'), 'c6');
  assert.equal(normalizeNoteColor('blue'), 'c1');
  assert.equal(normalizeNoteColor('c11'), null);
  assert.equal(normalizeNoteColor('<script>'), null);
  assert.equal(normalizeNoteColor(undefined), 'c9', 'missing colour keeps the old yellow default');
});

test('cleanLabels requires ten single-line titles of at most 20 characters', () => {
  const ok = Array(10).fill('');
  ok[6] = 'Calls <wide>';
  ok[1] = 'ș'.repeat(20);
  assert.deepEqual(cleanLabels(ok), ok);
  for (const bad of [[], Array(10), Array(11).fill(''), ok.map((x, i) => (i === 0 ? 'x'.repeat(21) : x)),
    ok.map((x, i) => (i === 0 ? 'a\nb' : x)), ok.map((x, i) => (i === 0 ? null : x)), 'nope']) {
    assert.equal(cleanLabels(bad), null);
  }
});

test('labels are private per account, persist and return copies', () => {
  const db = new DatabaseSync(':memory:');
  const labels = createPlayerLabels(db);
  assert.deepEqual(labels.get(1), Array(10).fill(''));
  const titles = Array(10).fill('');
  titles[3] = 'Nit';
  labels.set(1, titles);
  assert.deepEqual(labels.get(1), titles);
  assert.deepEqual(labels.get(2), Array(10).fill(''), 'other players do not see them');
  const copy = labels.get(1);
  copy[3] = 'changed';
  assert.equal(labels.get(1)[3], 'Nit');
  labels.set(1, Array(10).fill(''));
  assert.deepEqual(labels.get(1), Array(10).fill(''));
});
