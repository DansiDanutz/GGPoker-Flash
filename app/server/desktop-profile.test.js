import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { profilePath } = createRequire(import.meta.url)('../electron/profile.cjs');

test('desktop branding preserves legacy profile data and explicit isolation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpoker-profile-'));
  try {
    assert.equal(profilePath(root), path.join(root, 'DanGG'));
    const legacy = path.join(root, 'GGPoker Clone');
    fs.mkdirSync(legacy);
    fs.writeFileSync(path.join(legacy, 'desktop.json'), '{"mode":"live"}');
    assert.equal(profilePath(root), legacy);
    fs.mkdirSync(path.join(root, 'DanGG'));
    assert.equal(profilePath(root), legacy, 'an existing legacy profile is never silently abandoned');
    assert.equal(profilePath(root, '/explicit/test-profile'), '/explicit/test-profile');
    assert.equal(fs.readFileSync(path.join(legacy, 'desktop.json'), 'utf8'), '{"mode":"live"}');
  } finally { fs.rmSync(root, { recursive:true, force:true }); }
});
