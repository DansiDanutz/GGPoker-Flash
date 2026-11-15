// Each reaction shows its own sticker once that file exists, and a labelled chip until then.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const picker = fs.readFileSync(path.join(root, 'src/components/table/ReactionPicker.tsx'), 'utf8');

test('art is looked up per reaction as webp', () => {
  assert.match(picker, /\/assets\/reactions\/\$\{id\}\.webp/);
  assert.match(picker, /useReactionArtwork\(id\)/, 'one probe per reaction, so a partial set still works');
});

test('the picker lays twelve stickers out four across', () => {
  const css = fs.readFileSync(path.join(root, 'src/table-chat.css'), 'utf8');
  assert.match(css, /\.reaction-picker \{[^}]*grid-template-columns:\s*repeat\(4,/);
});
