import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vpipOf } from '../src/game/seatVpip.ts';

test('vpipOf: numeric own value, 0 for missing or inherited keys', () => {
  assert.equal(vpipOf({ a: 42 }, 'a'), 42);
  assert.equal(vpipOf({}, 'b'), 0);
  assert.equal(vpipOf({}, '__proto__'), 0);
  assert.equal(vpipOf({}, 'constructor'), 0);
  assert.equal(vpipOf(JSON.parse('{"__proto__": 7}'), '__proto__'), 7);
});
