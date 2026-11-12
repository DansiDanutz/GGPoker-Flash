import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLookOverrides, resolveLook, withLookOverride } from '../src/lib/tableLook.ts';

const global = { theme: 'Green', roomBg: 'featured' };

test('a table override wins over the global look; other tables inherit', () => {
  const o = withLookOverride({}, 'nlh-1', { theme: 'Purple' });
  assert.deepEqual(resolveLook(global, o, 'nlh-1'), { theme: 'Purple', roomBg: 'featured' });
  assert.deepEqual(resolveLook(global, o, 'nlh-2'), global);
});

test('changing the global look keeps an override', () => {
  const o = withLookOverride({}, 'nlh-1', { theme: 'Purple' });
  assert.deepEqual(resolveLook({ theme: 'Cobalt', roomBg: 'dark' }, o, 'nlh-1'), { theme: 'Purple', roomBg: 'dark' });
});

test('patches merge; null resets to Game Settings; inputs are not mutated', () => {
  const a = withLookOverride({}, 't', { theme: 'Red' });
  const b = withLookOverride(a, 't', { roomBg: 'floor' });
  assert.deepEqual(b.t, { theme: 'Red', roomBg: 'floor' });
  assert.deepEqual(a.t, { theme: 'Red' }, 'previous object unchanged');
  assert.deepEqual(withLookOverride(b, 't', null), {});
});

test('invalid choices and malformed storage are ignored', () => {
  assert.deepEqual(withLookOverride({}, 't', { theme: 'Neon' }), {});
  assert.deepEqual(parseLookOverrides('{bad'), {});
  assert.deepEqual(parseLookOverrides('[1,2]'), {});
  assert.deepEqual(parseLookOverrides(JSON.stringify({ t: { theme: 'Red', roomBg: 'nope' }, u: { theme: 1 }, v: 'x' })), { t: { theme: 'Red' } });
});
