import test from 'node:test';
import assert from 'node:assert/strict';
import { grantReasonError, normalizeGrantReason } from '../src/lib/grantReason.ts';
import { cleanGrantReason } from './validate.js';

test('the grant dialog accepts exactly what the server accepts', () => {
  const samples = ['', 'ab', '  ab  ', 'abc', ' a  b ', 'x'.repeat(200), 'x'.repeat(201), ` ${'y'.repeat(200)}   `];
  for (const text of samples) {
    const accepted = grantReasonError(text) === null;
    assert.equal(accepted, cleanGrantReason(text) !== null, JSON.stringify(text));
    if (accepted) assert.equal(normalizeGrantReason(text), cleanGrantReason(text));
  }
});

test('grant reason errors explain the bound that was missed', () => {
  assert.match(grantReasonError('hi'), /at least 3/);
  assert.match(grantReasonError('x'.repeat(201)), /under 201/);
});
