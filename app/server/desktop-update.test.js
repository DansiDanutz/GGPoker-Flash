// Desktop app update: the built-in copy compares itself with dangg.live and, on the player's
// click, switches to live for good.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { LIVE_URL, isOutdated, readLocalVersion, readMode, writeMode } = require('../electron/update.cjs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-update-'));

test('the live server is dangg.live over https', () => {
  assert.equal(LIVE_URL, 'https://dangg.live');
});

test('a copy is outdated only when live answers with a different version or build', () => {
  const local = { version: '1.1.0', build: '20261114060504' };
  assert.equal(isOutdated(local, { version: '1.1.0', build: '20261114183714' }), true);
  assert.equal(isOutdated(local, { version: '1.2.0', build: '20261114060504' }), true);
  assert.equal(isOutdated(local, { ...local }), false);
  assert.equal(isOutdated(local, null), false, 'offline: no button');
  assert.equal(isOutdated(null, { version: '1.1.0', build: '1' }), false, 'unknown local copy: no button');
  assert.equal(isOutdated({ version: 'dev', build: 'dev' }, { version: '1.1.0', build: '1' }), false, 'dev builds never nag');
});

test('reads the local build identity, or null when it is missing or broken', () => {
  const dir = tmp();
  const file = path.join(dir, 'version.json');
  assert.equal(readLocalVersion(file), null);
  fs.writeFileSync(file, '{ not json');
  assert.equal(readLocalVersion(file), null);
  fs.writeFileSync(file, JSON.stringify({ version: '1.1.0', build: '20261114060504', time: 'x' }));
  assert.deepEqual(readLocalVersion(file), { version: '1.1.0', build: '20261114060504' });
});

test('the switch to live is remembered; anything else means the built-in copy', () => {
  const file = path.join(tmp(), 'desktop.json');
  assert.equal(readMode(file), 'local');
  writeMode(file, 'live');
  assert.equal(readMode(file), 'live');
  fs.writeFileSync(file, JSON.stringify({ mode: 'elsewhere' }));
  assert.equal(readMode(file), 'local');
  assert.throws(() => writeMode(file, 'elsewhere'));
});

test('the titlebar button shows only for a real, outdated status', async () => {
  const { readDesktopUpdate, updateTitle } = await import('../src/lib/desktopUpdate.ts');
  assert.deepEqual(await readDesktopUpdate(null), { outdated: false }, 'browser: no desktop shell');
  assert.deepEqual(await readDesktopUpdate({ updateStatus: async () => { throw new Error('ipc'); } }), { outdated: false });
  assert.deepEqual(await readDesktopUpdate({ updateStatus: async () => ({ outdated: 'yes' }) }), { outdated: false });
  const status = { outdated: true, local: { version: '1.1.0', build: 'a' }, live: { version: '1.1.0', build: 'b' } };
  assert.deepEqual(await readDesktopUpdate({ updateStatus: async () => status }), status);
  assert.match(updateTitle(status), /This app: v1\.1\.0 \(a\)\. Live: v1\.1\.0 \(b\)/);
});

test('main process wires the update channels and the live switch', () => {
  const main = fs.readFileSync(path.resolve(import.meta.dirname, '../electron/main.cjs'), 'utf8');
  const preload = fs.readFileSync(path.resolve(import.meta.dirname, '../electron/preload.cjs'), 'utf8');
  assert.match(main, /ipcMain\.handle\('update:status'/);
  assert.match(main, /ipcMain\.handle\('update:apply'/);
  assert.match(main, /readMode\(MODE_FILE\) === 'live'/);
  assert.match(preload, /updateStatus: \(\) => ipcRenderer\.invoke\('update:status'\)/);
  assert.match(preload, /applyUpdate: \(\) => ipcRenderer\.invoke\('update:apply'\)/);
});
