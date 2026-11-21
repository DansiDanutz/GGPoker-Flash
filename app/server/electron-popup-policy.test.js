import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFunction } from 'node:vm';

test('new lobby and table contents route external HTTPS to the OS only', () => {
  const entry = fileURLToPath(new URL('../electron/main.cjs', import.meta.url));
  const require = createRequire(entry);
  const app = Object.assign(new EventEmitter(), {
    setName() {}, getPath: () => '/unused', setPath() {},
    requestSingleInstanceLock: () => true, whenReady: () => new Promise(() => {}),
  });
  const handedOff = [];
  const electron = { app, ipcMain: { handle() {} }, shell: { openExternal: url => handedOff.push(url) } };
  const origin = 'https://lobby.example';
  const load = id => id === 'electron' ? electron : id === 'node:fs' ? { mkdirSync() {} } : require(id);
  compileFunction(readFileSync(entry, 'utf8'), ['require', '__dirname', 'process'])(
    load, dirname(entry), { env: { GGPOKER_SERVER_URL: origin } },
  );
  for (const name of ['lobby', 'table']) {
    let open;
    const contents = Object.assign(new EventEmitter(), {
      setWindowOpenHandler: handler => { open = handler; },
      session: { setPermissionRequestHandler() {} },
    });
    app.emit('web-contents-created', {}, contents);
    assert.equal(open({ url: origin + '/table' }).action, 'allow');
    const external = 'https://outside.example/' + name;
    assert.equal(open({ url: external }).action, 'deny');
    assert.equal(open({ url: 'about:blank' }).action, 'deny');
    assert.deepEqual(handedOff.splice(0), [external]);
  }
});
