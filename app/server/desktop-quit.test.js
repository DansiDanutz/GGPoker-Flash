import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

for (const outcome of ['clean', 'error', 'signal', 'timeout']) test('desktop quit waits and reports ' + outcome + ' shutdown', () => {
  let timeout;
  const app = new EventEmitter(), child = new EventEmitter(), signals = [], exits = [];
  app.exit = code => exits.push(code);
  child.exitCode = null;
  child.kill = signal => signals.push(signal);
  const source = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  runInNewContext(source.slice(source.indexOf('let quittingWithServer =')), {
    app, serverProc:child, setTimeout: fn => { timeout = fn; }, clearTimeout: () => {},
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    let prevented = false;
    app.emit('before-quit', { preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  }
  assert.deepEqual(signals, ['SIGTERM']);
  assert.deepEqual(exits, []);
  if (outcome === 'timeout') {
    timeout();
    assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  }
  child.emit('exit', outcome === 'error' ? 2 : outcome === 'signal' ? null : 0);
  assert.deepEqual(exits, [outcome === 'clean' ? 0 : 1]);
});
