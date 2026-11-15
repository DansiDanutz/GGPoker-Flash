// Phone table polish against GGPoker mobile: nothing sits on your cards, one blind marker per
// seat, readable action labels, your full name, and a sound control that matches the top bar.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const page = read('src/pages/TablePage.tsx');
const css = read('src/table-phone-seat.css');

test('in portrait the dealer disc and blind marker step around your cards', () => {
  assert.match(page, /heroDealerSide: -72/);
  assert.match(page, /heroBlindSide: 72/);
  assert.match(page, /inward\(seatPos\(state\.button\), stage, reach\.dealer, markerSide\(state\.button, reach\.dealerSide, reach\.heroDealerSide\)\)/);
  assert.match(page, /inward\(seatPos\(seat\), stage, reach\.blind, markerSide\(seat, reach\.blindSide, reach\.heroBlindSide\)\)/);
});

test('a blind post shows no extra action label: the SB/BB marker and bet already say it', () => {
  assert.match(page, /const BLIND_POSTS = new Set\(\['SB', 'BB'\]\);/);
  assert.match(page, /p\.lastAction && !p\.folded && !BLIND_POSTS\.has\(p\.lastAction\.action\)/);
});

test('your own seat carries no VPIP badge over your cards', () => {
  assert.match(page, /p\.nick && !p\.isMe && <span className="vpip-badge"/);
});

test('the sound button shows its state and wears the gold ring', () => {
  assert.match(page, /aria-pressed=\{sound\.enabled\}/);
  assert.match(page, /\{sound\.enabled \? '🔊' : '🔇'\}/);
  assert.match(read('src/table-topbar-history.css'), /\.table-topbar \.table-sound-btn,\s*\n?\.table-topbar \.table-history-btn \{/);
});

test('portrait action labels are readable and your name plate fits your name', () => {
  assert.match(css, /\.stage-portrait \.seat \.action-badge \{[^}]*font-size: 11px;[^}]*padding: 4px 10px 3px;/, 'room for the label art');
  assert.match(css, /\.stage-portrait \.seat\.me \.plate \{[^}]*width: max-content;[^}]*max-width: 150px;/);
  const main = read('src/main.tsx');
  assert.ok(main.indexOf("import './table-phone-seat.css';") > main.indexOf("import './table-phone-look.css';"));
});
