import test from 'node:test';
import assert from 'node:assert/strict';
import { countOnline } from './online-count.js';

const OPEN = 1;
const CLOSED = 3;

test('counts each signed-in account once across tabs', () => {
  const clients = [{ readyState: OPEN, userId: 7 }, { readyState: OPEN, userId: 7 }, { readyState: OPEN, userId: 9 }];
  assert.equal(countOnline(clients), 2);
});

test('counts open guest sockets and skips closed ones', () => {
  const clients = [{ readyState: OPEN }, { readyState: OPEN }, { readyState: CLOSED, userId: 3 }, { readyState: CLOSED }];
  assert.equal(countOnline(clients), 2);
});

test('returns 0 when nobody is connected', () => {
  assert.equal(countOnline([]), 0);
});
