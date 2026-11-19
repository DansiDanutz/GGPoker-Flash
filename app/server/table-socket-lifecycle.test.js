import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';

const source = readFileSync(new URL('../src/pages/TablePage.tsx', import.meta.url), 'utf8');
const body = source.match(/ws\.onclose = \(\) => \{([\s\S]*?)\n    \};/)[1];
const close = compileFunction(body, ['ws', 'wsRef', 'setConnected', 'everJoined', 'retry', 'window', 'connect']);

test('a retired table socket cannot mark its replacement disconnected or schedule a retry', () => {
  const old = {}, replacement = {}, states = [], timers = [];
  close(old, { current: replacement }, value => states.push(value), { current: true }, {}, {
    setTimeout: fn => timers.push(fn),
  }, () => assert.fail('retired socket reconnected'));
  assert.deepEqual(states, []);
  assert.deepEqual(timers, []);
});

test('the current table socket reports disconnect and retries only while still current', () => {
  const ws = {}, ref = { current: ws }, states = [], timers = [];
  let connections = 0;
  close(ws, ref, value => states.push(value), { current: true }, {}, {
    setTimeout: fn => timers.push(fn),
  }, () => connections++);
  assert.deepEqual(states, [false]);
  assert.equal(timers.length, 1);
  timers[0]();
  assert.equal(connections, 1);
  ref.current = {};
  timers[0]();
  assert.equal(connections, 1);
});
