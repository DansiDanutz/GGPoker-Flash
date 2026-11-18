import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_NAME, CREATOR_NEWS, creatorCredit } from '../src/lib/creator.ts';

const root = path.resolve(import.meta.dirname, '..');

test('credit names the creator and identifies the free Play Money experience', () => {
  assert.equal(creatorCredit('Dan'), 'Play Money is free · Built by Dan');
  assert.equal(creatorCredit('  '), 'Play Money is free · Built by DansiDanutz');
  assert.equal(PROJECT_NAME, 'DanGG');
  assert.match(CREATOR_NEWS.paragraphs.join(' '), /OpenPoker/);
  assert.match(CREATOR_NEWS.paragraphs.join(' '), /paid/);
});

test('the installed app carries the project name and a short label that fits under the icon', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, PROJECT_NAME);
  assert.ok(manifest.short_name.length <= 12, 'iPhone shows about 12 characters under the icon');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, new RegExp(`name="apple-mobile-web-app-title" content="${manifest.short_name}"`));
  for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(root, 'public', icon.src)), icon.src);
});
