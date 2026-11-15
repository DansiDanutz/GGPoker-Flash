// Every icon-only control at the table names itself after a one-second hover.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('table icon buttons carry a data-tip name', () => {
  const page = read('src/pages/TablePage.tsx');
  for (const cls of ['table-gear', 'table-menu-btn', 'table-sound-btn', 'vpip-badge']) {
    const line = page.split('\n').find((l) => l.includes(`className="${cls}"`));
    assert.ok(line, `${cls} exists`);
    assert.match(line, /data-tip=/, `${cls} has a tooltip`);
  }
  assert.match(page, /data-tip=\{pickable \? 'Show this card'/, 'own cards say they can be shown');
  assert.match(read('src/components/table/SeatDock.tsx'), /data-tip=\{item\.label\}/);
  assert.match(page, /className="dealer-btn"[^>]*data-tip="Dealer button"/);
});

test('tooltips wait one second before appearing, and no native title doubles them', () => {
  const css = read('src/table-tips.css');
  assert.match(css, /\[data-tip\]::after/);
  assert.match(css, /transition-delay:\s*1s/);
  assert.match(css, /\[data-tip\]\.tip-hold::after/, 'press-and-hold shows it on phones');
  assert.match(read('src/main.tsx'), /table-tips\.css/);
  assert.doesNotMatch(read('src/components/table/SeatDock.tsx'), /title=\{item\.label\}/);
});
