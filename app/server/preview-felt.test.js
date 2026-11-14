// Art 6d (second take): the cash lobby table preview sits on the 3D felt.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

test('the felt art exists', () => {
  assert.ok(fs.existsSync(path.join(root, 'public/assets/ui/creatives/cash-felt.webp')));
});

test('the last stylesheet to style the preview paints it with the felt', () => {
  const css = fs.readFileSync(path.join(root, 'src/premium.css'), 'utf8');
  assert.match(css, /\.mini-table \{[^}]*cash-felt\.webp/);
});
