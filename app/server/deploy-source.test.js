import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sha = 'a'.repeat(40);
function run(t, { publicCommit = true, conclusion = 'success' } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'openpoker-deploy-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = path.join(dir, 'calls');
  const shim = `#!${process.execPath}
const fs = require('node:fs');
const name = require('node:path').basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALL_LOG, JSON.stringify([name, ...args]) + String.fromCharCode(10));
if (name === 'git') {
  if (args[0] === 'rev-parse') console.log(args.includes('--show-toplevel') ? process.env.REPO_ROOT : '${sha}');
  else if (args[0] === 'merge-base') process.exit(process.env.PUBLIC_COMMIT === '1' ? 0 : 1);
} else if (name === 'gh') console.log(process.env.CONCLUSION);
else if (name === 'rsync' || name === 'ssh') process.exit(88);
`;
  for (const command of ['git', 'gh', 'rsync', 'ssh', 'tar']) writeFileSync(path.join(dir, command), shim, { mode: 0o755 });
  const result = spawnSync('bash', [path.join(root, 'deploy/deploy.sh'), '--dry-run', sha], {
    cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`,
      CALL_LOG: log, REPO_ROOT: root, PUBLIC_COMMIT: publicCommit ? '1' : '0', CONCLUSION: conclusion },
  });
  return { ...result, calls: readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line)) };
}

test('deployment refuses a private-only commit before CI or transfer', t => {
  const result = run(t, { publicCommit: false });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not on .*OpenPoker/);
  assert.equal(result.calls.some(([name]) => ['gh', 'rsync', 'ssh'].includes(name)), false);
  assert.ok(result.calls.some(call => call.includes('https://github.com/OpenPoker4all/OpenPoker.git')));
});

test('deployment checks public main push CI and stops before transfer when red', t => {
  const result = run(t, { conclusion: 'failure' });
  assert.equal(result.status, 1);
  const ci = result.calls.find(([name]) => name === 'gh');
  assert.ok(ci.includes('OpenPoker4all/OpenPoker'));
  assert.ok(ci.includes('--branch') && ci.includes('main'));
  assert.ok(ci.includes('--event') && ci.includes('push'));
  assert.equal(result.calls.some(([name]) => ['rsync', 'ssh'].includes(name)), false);
});

test('the latest successful public CI run permits the dry-run transfer gate', t => {
  const result = run(t);
  assert.equal(result.status, 88, result.stderr);
  const transfer = result.calls.find(([name]) => name === 'rsync');
  assert.ok(transfer.includes('--dry-run'));
  assert.equal(result.calls.some(([name]) => name === 'ssh'), false);
});
