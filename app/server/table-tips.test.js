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

test('tooltips appear quickly on hover, and no native title doubles them', () => {
  const css = read('src/table-tips.css');
  assert.match(css, /\[data-tip\]::after/);
  assert.match(css, /transition-delay:\s*\.3s/);
  assert.match(css, /\[data-tip\]\.tip-hold::after/, 'press-and-hold shows it on phones');
  assert.match(read('src/main.tsx'), /table-tips\.css/);
  assert.doesNotMatch(read('src/components/table/SeatDock.tsx'), /title=\{item\.label\}/);
});

test('Chat and React say what they are on hover, beside the chip so the screen edge never cuts it', () => {
  const chat = read('src/components/table/TableChat.tsx');
  assert.match(chat, /data-tip="Chat"/);
  assert.match(chat, /data-tip=\{readOnly \? 'Spectators cannot react' : 'Reaction'\}/);
  assert.doesNotMatch(chat, /title=\{readOnly/, 'no native title doubles the label');
  const css = read('src/table-tips.css');
  assert.match(css, /\.table-screen \.tchat-toggle\[data-tip\]::after \{[^}]*left: calc\(100% \+ 8px\);/);
  assert.match(css, /\.table-screen \.dock-btn\[data-tip\]::after \{[^}]*right: 0;/);
});

test('labels are short plain names, and the timers say Timer', () => {
  const page = read('src/pages/TablePage.tsx');
  assert.match(page, /<div className=\{'turn-badge' \+ \(clockSeconds <= 5 \? ' hot' : ''\)\} role="timer" data-tip="Timer"/);
  assert.match(page, /className=\{`native-clock[^`]*`\} data-tip="Timer"/);
  assert.equal((page.match(/data-tip=\{`Time bank \+\$\{TB_CARD_SECONDS\}s`\}/g) || []).length, 2);
  assert.match(page, /data-tip="Sound"/);
  const css = read('src/table-tips.css');
  assert.match(css, /\.table-screen \.native-clock\[data-tip\]::after/);
});

