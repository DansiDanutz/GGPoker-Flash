// Hand history sits in the top bar beside Sound; Chat and Reaction chips are 10% smaller.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { dockItems } from '../src/game/tableArt.ts';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('Hand history is a top-bar button after Settings, not a seat-dock icon', () => {
  const page = read('src/pages/TablePage.tsx');
  const sound = page.indexOf('className="table-sound-btn"');
  const hist = page.indexOf('className="table-history-btn"');
  assert.ok(sound > 0 && hist > sound, 'history follows sound');
  assert.ok(hist > page.indexOf('className="table-gear"'), 'history follows Settings');
  assert.match(page, /className="table-history-btn" aria-label="Hand history" data-tip="Hand history" onClick=\{\(\) => navigate\('\/hand-history'\)\}><img src="\/assets\/table\/ui\/ic-history\.webp" alt="" \/><\/button>/);
  assert.ok(!dockItems({ seated: true, cash: true, straddleAllowed: true }).some((i) => i.key === 'history'));
  const css = read('src/table-topbar-history.css');
  assert.match(css, /\.table-topbar \.table-history-btn \{[^}]*width: 34px; height: 34px;[^}]*border-radius: 50%;/);
  assert.match(css, /\.table-screen \.table-topbar \.table-history-btn \{ order: 9; width: 36px; height: 36px; \}/);
  assert.match(css, /\.table-topbar \[data-tip\]::after|top: calc\(100% \+ 8px\)/);
});

test('Chat and Reaction chips are 10% smaller (46px to 41px)', () => {
  const css = read('src/table-buttons.css');
  assert.match(css, /\.table-screen \.tchat-toggle \{\s*width: 41px; height: 41px;/);
  assert.match(css, /\.table-screen \.tchat-toggle \.tchat-icon \{ width: 20px; height: 20px;/);
});
