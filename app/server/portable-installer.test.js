// A disposable Git checkout and fake Docker verify the host-environment boundary.
// No Docker daemon, container or production data is touched by this fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const sourceRoot = path.resolve(import.meta.dirname, '../..');
const composeSource = fs.readFileSync(path.join(sourceRoot, 'deploy/portable/compose.yml'), 'utf8');
const interpolatedKeys = [...new Set([...composeSource.matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)].map((match) => match[1]))];
const inheritedKeys = [...new Set([...interpolatedKeys, 'OPENPOKER_PROFILE', 'COMPOSE_PROJECT_NAME',
  'COMPOSE_FILE', 'COMPOSE_ENV_FILES', 'COMPOSE_PROFILES', 'COMPOSE_REMOVE_ORPHANS'])];

test('portable installer ignores inherited deployment overrides and builds its checkout HEAD', (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'openpoker-installer-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const checkout = path.join(temporary, 'checkout');
  const bin = path.join(temporary, 'bin');
  const envFile = path.join(temporary, 'private.env');
  const backupDir = path.join(temporary, 'backups');
  const recordFile = path.join(temporary, 'docker-calls.jsonl');
  fs.mkdirSync(path.join(checkout, 'tools'), { recursive: true });
  fs.mkdirSync(path.join(checkout, 'deploy/portable'), { recursive: true });
  fs.mkdirSync(bin);
  const installer = path.join(checkout, 'tools/openpoker-install.sh');
  fs.copyFileSync(path.join(sourceRoot, 'tools/openpoker-install.sh'), installer);
  fs.chmodSync(installer, 0o755);
  fs.writeFileSync(path.join(checkout, 'deploy/portable/compose.yml'), composeSource);
  const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet', '--template=');
  git('add', 'tools/openpoker-install.sh', 'deploy/portable/compose.yml');
  git('-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
    '-c', 'user.name=OpenPoker installer fixture', '-c', 'user.email=fixture@localhost',
    'commit', '--quiet', '-m', 'Disposable installer fixture');
  const head = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(bin, 'docker'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.includes('--env-file')) {
  const keys = JSON.parse(process.env.INSTALLER_TEST_KEYS);
  const env = Object.fromEntries(keys.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
  fs.appendFileSync(process.env.INSTALLER_TEST_RECORD, JSON.stringify({ args, env,
    envFile: process.env.OPENPOKER_ENV_FILE, backupDir: process.env.OPENPOKER_BACKUP_DIR }) + '\\n');
}
// version/info/build/up/status all succeed; ps intentionally reports no running room.
`, { mode: 0o755 });

  const env = { ...process.env,
    PATH: `${bin}${path.delimiter}${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ''}`,
    OPENPOKER_ENV_FILE: envFile, OPENPOKER_BACKUP_DIR: backupDir,
    INSTALLER_TEST_RECORD: recordFile, INSTALLER_TEST_KEYS: JSON.stringify(inheritedKeys),
  };
  for (const key of inheritedKeys) env[key] = 'inherited-override';
  env.OPENPOKER_PROJECT = 'production-never-touch';
  env.COMPOSE_PROJECT_NAME = 'dangro';
  env.GGPOKER_ADMIN_PASSWORD = 'weak';
  env.GIT_SHA = 'f'.repeat(40);
  const run = (...args) => {
    const result = spawnSync(installer, args, { cwd: checkout, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result;
  };
  const initialized = run('init', '--project', 'fixture-room', '--port', '55198', '--name', 'Fixture Poker');
  const initialConfig = fs.readFileSync(envFile, 'utf8');
  const password = initialConfig.match(/^GGPOKER_ADMIN_PASSWORD=(.+)$/m)[1];
  assert.match(password, /^[a-f0-9]{64}$/);
  assert.ok(!initialized.stdout.includes(password), 'Initialization must not print its credential');
  // A saved older revision must not override the source that up actually builds.
  fs.writeFileSync(envFile, initialConfig.replace(/^GIT_SHA=.+$/m, `GIT_SHA=${'0'.repeat(40)}`));
  run('status');
  const started = run('up');
  assert.ok(!started.stdout.includes(password), 'Startup must not print its credential');
  const calls = fs.readFileSync(recordFile, 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(calls.some(({ args }) => args.includes('build')));
  assert.ok(calls.some(({ args }) => args.includes('up')));
  for (const call of calls) {
    assert.equal(call.args[call.args.indexOf('--project-name') + 1], 'fixture-room');
    assert.equal(call.args[call.args.indexOf('--env-file') + 1], envFile);
    assert.equal(call.envFile, envFile, 'The private env path control remains available');
    assert.equal(call.backupDir, backupDir, 'The private backup path control remains available');
    for (const key of inheritedKeys.filter((key) => key !== 'GIT_SHA')) {
      assert.equal(call.env[key], undefined, `Inherited ${key} must not reach Compose`);
    }
    assert.equal(call.env.GIT_SHA, call.args.includes('build') || call.args.includes('up') ? head : undefined);
  }
  assert.equal(fs.readFileSync(envFile, 'utf8'), initialConfig, 'Only the successful source revision may change');
  assert.equal(fs.statSync(envFile).mode & 0o777, 0o600);
});
