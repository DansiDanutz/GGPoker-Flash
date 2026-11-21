// Check the published source offer against the build inputs, not a moving branch.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const sha = (process.env.GIT_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })).trim().toLowerCase();
const repository = (process.env.SOURCE_REPOSITORY || 'https://github.com/OpenPoker4all/OpenPoker').replace(/\/$/, '');
const dist = process.argv[2] ?? 'dist';
const version = JSON.parse(fs.readFileSync(`${dist}/version.json`, 'utf8'));
assert.equal(version.commit, sha);
assert.equal(version.source, `${repository}/tree/${sha}`);
const client = fs.readdirSync(`${dist}/assets`).filter(file => file.endsWith('.js'))
  .map(file => fs.readFileSync(`${dist}/assets/${file}`, 'utf8')).join('\n');
assert.ok(client.includes(version.source), 'client must offer this build’s source');
for (const [source, output] of [
  ['../LICENSE', 'LICENSE'],
  ['../LICENSES/MIT-legacy.txt', 'MIT-legacy.txt'],
  ['../THIRD-PARTY-NOTICES.txt', 'THIRD-PARTY-NOTICES.txt'],
]) {
  assert.deepEqual(fs.readFileSync(`${dist}/legal/${output}`), fs.readFileSync(source));
}
console.log(`Source offer verified for ${sha}; distributed notices match their originals.`);
