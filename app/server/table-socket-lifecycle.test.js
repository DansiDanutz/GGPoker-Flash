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

test('a delayed open from a retired socket cannot mark the table connected or join it', () => {
  const body = source.match(/ws\.onopen = \(\) => \{([\s\S]*?)\n    \};/)[1];
  const open = compileFunction(body, ['ws', 'wsRef', 'setConnected', 'tableId', 'buyin', 'observe', 'everJoined', 'wasSeatedHere', 'seatParam', 'joinWaitRef']);
  const messages = [], states = [];
  const ws = {send: raw => messages.push(JSON.parse(raw))};
  const ref = {current: {}};
  const notify = () => open(ws, ref, value => states.push(value), 'fixture', 100, false, {current:false}, () => false, null, {current:false});
  notify();
  assert.deepEqual(states, []);
  assert.deepEqual(messages, []);
  ref.current = ws;
  notify();
  assert.deepEqual(states, [true]);
  assert.deepEqual(messages.map(m => [m.type,m.tableId]), [['join_table','fixture']]);
});
