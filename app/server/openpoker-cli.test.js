// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { access, cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandPlan, runChild } from '../../openpoker.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = path.join(root, 'openpoker.mjs');
const invoke = (args, options = {}) => spawnSync(process.execPath, [cli, ...args], { cwd: tmpdir(), encoding: 'utf8', timeout: 20000, ...options });

test('help works from outside the clone without dependencies and rejects invalid commands', () => {
  for (const args of [[], ['help'], ['--help'], ['-h']]) {
    const result = invoke(args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /doctor → setup → sandbox/);
  }
  for (const args of [['deploy'], ['sandbox', '--data=production'], ['setup', '--ignore-scripts'], ['help', 'extra']]) {
    const result = invoke(args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /OpenPoker:/);
  }
});

test('plans reuse app commands, run checks in order and validate selected test filenames', () => {
  assert.deepEqual(commandPlan('setup'), [['pnpm', ['install', '--frozen-lockfile']]]);
  assert.deepEqual(commandPlan('sandbox'), [[process.execPath, ['tools/contributor-sandbox.mjs']]]);
  assert.deepEqual(commandPlan('dev'), [['pnpm', ['run', 'dev']]]);
  assert.deepEqual(commandPlan('build'), [['pnpm', ['run', 'build']], [process.execPath, ['tools/verify-source-build.mjs']]]);
  const checks = commandPlan('check');
  assert.deepEqual(checks[0], [process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.json']]);
  assert.equal(checks[1][1][0], '--test');
  assert.ok(checks[1][1].includes(path.join('server', 'openpoker-cli.test.js')));
  assert.deepEqual(commandPlan('test', ['openpoker-cli.test.js']), [[process.execPath, ['--test', path.join('server', 'openpoker-cli.test.js')]]]);
  for (const name of ['../outside.test.js', '--test-reporter=spec', 'file.test.js;echo', 'missing.test.js', '/tmp/evil.test.js']) {
    assert.throws(() => commandPlan('test', [name]), /Test not found or invalid/);
  }
});

test('child failures, signals and launch errors propagate without leaking signal listeners', async () => {
  const before = ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal));
  assert.equal(await runChild(process.execPath, ['-e', 'process.exit(7)'], { cwd: root }), 7);
  assert.equal(await runChild(process.execPath, ['-e', 'process.kill(process.pid, "SIGTERM")'], { cwd: root }), 143);
  await assert.rejects(runChild('/nonexistent/openpoker-executable', [], { cwd: root }), /ENOENT/);
  assert.deepEqual(['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal)), before);
});

test('fresh clone doctor gives actionable errors; setup uses locked install and skips Electron download', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'openpoker-cli-test-'));
  try {
    await mkdir(path.join(directory, 'app', 'server'), { recursive: true });
    await cp(cli, path.join(directory, 'openpoker.mjs'));
    const bin = path.join(directory, 'bin');
    await mkdir(bin);
    const log = path.join(directory, 'install.json');
    // A fake package manager proves setup behavior without a network install.
    await writeFile(path.join(bin, 'pnpm'), `#!${process.execPath}\nif (process.argv[2] === '--version') console.log('10.32.1'); else { require('node:fs').writeFileSync(${JSON.stringify(log)}, JSON.stringify({args: process.argv.slice(2), cwd: process.cwd(), electron: process.env.ELECTRON_SKIP_BINARY_DOWNLOAD})); process.exit(Number(process.env.FAKE_EXIT || 0)); }\n`, { mode: 0o755 });
    const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
    const run = args => spawnSync(process.execPath, [path.join(directory, 'openpoker.mjs'), ...args], { cwd: tmpdir(), env, encoding: 'utf8', timeout: 20000 });
    const doctor = run(['doctor']);
    assert.equal(doctor.status, 1);
    assert.match(doctor.stdout, /OK pnpm 10.32.1/);
    assert.match(doctor.stdout, /FIX App dependencies — run openpoker setup/);
    assert.match(run(['sandbox']).stderr, /dependencies are missing/);
    const setup = run(['setup']);
    assert.equal(setup.status, 0, setup.stderr);
    assert.deepEqual(JSON.parse(await readFile(log, 'utf8')), { args: ['install', '--frozen-lockfile'], cwd: await realpath(path.join(directory, 'app')), electron: '1' });
    env.FAKE_EXIT = '23';
    assert.equal(run(['setup']).status, 23);
    env.PATH = bin;
    await rm(path.join(bin, 'pnpm'));
    assert.match(run(['setup']).stderr, /Install pnpm 10.32.1/);
    await symlink(path.join(directory, 'openpoker.mjs'), path.join(bin, 'openpoker'));
    const linked = spawnSync(process.execPath, [path.join(bin, 'openpoker'), 'help'], { encoding: 'utf8' });
    assert.equal(linked.status, 0, linked.stderr);
    assert.match(linked.stdout, /OpenPoker CLI/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

for (const signal of ['SIGINT', 'SIGTERM']) test(`CLI sandbox serves Play Money and cleans up on ${signal}`, { timeout: 40000 }, async () => {
  const child = spawn(process.execPath, [cli, 'sandbox'], { cwd: tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = once(child, 'close');
  let output = '';
  child.stderr.on('data', chunk => { output += chunk; });
  let url;
  try {
    url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Sandbox timed out: ${output}`)), 25000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Sandbox exited ${code}: ${output}`)); });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/OpenPoker Play Money sandbox: (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    assert.equal((await fetch(url)).status, 200);
    const billing = await (await fetch(`${url}/api/marketplace/billing`)).json();
    assert.equal(billing.mode, 'off');
    assert.equal(billing.manual_funding.enabled, false);
  } finally {
    child.kill(signal);
    const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
    const [code] = await closed;
    clearTimeout(timer);
    assert.equal(code, 0, output);
  }
  await assert.rejects(fetch(url));
  const api = output.match(/Local API: (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
  const directory = output.match(/Temporary data: ([^\n]+)/)?.[1];
  assert.ok(api);
  assert.ok(directory);
  await assert.rejects(fetch(api));
  await assert.rejects(access(directory));
});
