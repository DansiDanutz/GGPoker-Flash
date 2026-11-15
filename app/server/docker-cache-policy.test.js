import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../deploy/prune-docker.sh', import.meta.url));

function run(t, failure = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-cache-policy-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const calls = path.join(dir, 'calls');
  fs.writeFileSync(path.join(dir, 'docker'), `#!/bin/sh
printf '%s\\n' "$*" >> "$CALLS"
if [ "$1 $2" != 'buildx prune' ]; then echo 'Forbidden non-cache operation' >&2; exit 91; fi
if [ "$FAIL_PRUNE" = 1 ]; then echo 'cache backend unavailable' >&2; exit 42; fi
echo 'cache cleanup complete'
`, { mode: 0o755 });
  const result = spawnSync('bash', [script], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, CALLS: calls, FAIL_PRUNE: failure ? '1' : '0' },
  });
  return { ...result, calls: fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n') : [] };
}

test('retention only touches cache with age, size and free-space bounds', t => {
  const result = run(t);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 1, 'must never prune images, containers or volumes');
  const args = result.calls[0].split(' ');
  assert.deepEqual(args.slice(0, 2), ['buildx', 'prune']);
  for (const [flag, value] of [['--builder', 'default'], ['--filter', 'until=1h'],
    ['--max-used-space', '4GB'], ['--min-free-space', '20GB'], ['--reserved-space', '1GB']]) {
    assert.ok(args.includes(flag), flag);
    assert.equal(args[args.indexOf(flag) + 1], value);
  }
});

test('cleanup failures stay visible and return a failing exit status', t => {
  const result = run(t, true);
  assert.equal(result.status, 42);
  assert.match(result.stderr, /cache backend unavailable/);
});
