// Phone table laid out like GGPoker mobile (Samsung capture, 15 Nov): a full-height oval, the hero in
// the bottom-left corner, one row of dark buttons along the bottom and the raise presets stacked on
// the right. Original DanGG art only: this copies the layout, not GG's look.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const css = () => read('src/table-phone-layout.css');

test('the GG phone layout loads after every other phone rule', () => {
  const main = read('src/main.tsx');
  const at = (f) => main.indexOf(`import './${f}';`);
  assert.ok(at('table-phone-layout.css') > 0, 'imported');
  for (const f of ['table-phone.css', 'table-phone-look.css', 'table-phone-seat.css', 'table-stage.css', 'table-topbar-history.css']) {
    assert.ok(at('table-phone-layout.css') > at(f), `after ${f}`);
  }
});

test('one slim row of buttons along the bottom', () => {
  assert.match(css(), /--phone-bar-h: 64px/);
  assert.match(css(), /grid-template-areas: "fold call raise"/);
});

test('raise presets stack in a column on the right, above the raise button', () => {
  assert.match(css(), /\.main-actions \.quick-bets \{[^}]*position: absolute[^}]*flex-direction: column-reverse/);
});

test('pre-actions are one row of dark buttons in the same place as the action buttons', () => {
  assert.match(css(), /\.action-bar \.reserved-actions \{[^}]*height: 52px/);
});

test('hero: smaller cards over the portrait, and the hand strength as a pill under the board', () => {
  assert.match(css(), /\.seat\.me \.cards \.pcard\.mini \{ width: 66px; height: 92px; \}/);
  assert.match(css(), /\.hand-strength \{[^}]*border-radius: 999px/);
});

test('the board sits in the middle of the oval with the pot pill above it', () => {
  assert.match(css(), /\.stage-portrait \.table-center \{[^}]*top: 4[0-9]%/);
});

test('your bet goes past the cards held over your portrait', () => {
  const src = read('src/pages/TablePage.tsx');
  assert.match(src, /\? \{ bet: 74, heroBet: 128,/);
  assert.match(src, /inward\(seatPos\(p\.seat!\), stage, p\.seat === me\?\.seat \? reach\.heroBet : reach\.bet\)/);
});

test('your countdown badge sits to the right of your portrait, away from the screen edge', () => {
  assert.match(css(), /\.seat\.me \.turn-badge \{ right: auto; left: calc\(50% \+ 32px\)/);
});

test('the check-fold pre-action can wrap onto two lines in its narrow button', () => {
  assert.match(read('src/pages/TablePage.tsx'), /'Check \/ Fold'/);
});

test('the phone table is drawn in 3D perspective: narrow top, wide rounded bottom, thick dark rail', () => {
  const svgPath = path.join(root, 'public/assets/tables/skins/portrait/phone-table-3d.svg');
  assert.ok(fs.existsSync(svgPath), 'table drawing exists');
  const svg = fs.readFileSync(svgPath, 'utf8');
  assert.match(svg, /preserveAspectRatio="none"/, 'stretches to the stage');
  assert.match(svg, /id="rail"/, 'has a rail');
  assert.match(svg, /id="apron"/, 'has the rail side that gives it depth');
  assert.match(svg, /id="felt"/, 'has a felt');
  // Rounded shoulder remains narrower than the near rail.
  assert.match(svg, /L407 520/);
  assert.match(svg, /370 200/);
  assert.match(css(), /\.table-screen\[class\] \.table-stage\.stage-portrait::before \{[^}]*transform: none;[^}]*url\('\/assets\/tables\/skins\/portrait\/phone-table-3d\.svg'\) center \/ 100% 100% no-repeat/);
});

test('the felt tint is cut to the same 3D felt shape', () => {
  const mask = fs.readFileSync(path.join(root, 'public/assets/tables/skins/portrait/phone-table-3d-felt.svg'), 'utf8');
  assert.match(mask, /preserveAspectRatio="none"/);
  const skin = read('public/assets/tables/skins/portrait/phone-table-3d.svg');
  assert.equal(mask.match(/<path d="([^"]+)"/)[1], skin.match(/<path id="inner" d="([^"]+)"/)[1], 'theme tint follows the exact felt boundary');
  assert.match(css(), /\.table-stage\.stage-portrait \.felt \{[^}]*mask-image: url\('\/assets\/tables\/skins\/portrait\/phone-table-3d-felt\.svg'\)/);
});

test('action and pre-action buttons pop up when needed and stay still with reduced motion', () => {
  assert.match(css(), /@keyframes gg-pop/);
  assert.match(css(), /:is\(\.main-actions, \.reserved-actions, \.aof-row\) \{[^}]*animation: gg-pop/);
  assert.match(css(), /prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
});

test('nothing sits on the table between decisions: no seat dock, no bar shade, chat only as a small corner icon', () => {
  assert.match(css(), /\.table-screen \.seat-dock \{ display: none; \}/);
  assert.match(css(), /\.action-bar:not\(:has\(\.main-actions, \.reserved-actions, \.aof-row, \.straddle-ask\)\) \{[^}]*background: none/);
});

test('phone buttons are drawn like GGPoker mobile: flat charcoal, no gold edge, light grey text', () => {
  const rule = css().match(/([^{}]+)\{[^}]*background: linear-gradient\(#343434, #262626\);[^}]*border: 0;[^}]*border-image: none;/);
  assert.ok(rule, 'one shared flat charcoal rule');
  for (const sel of ['.main-actions .act-btn', '.quick-bets button', '.reserved-actions button']) assert.ok(rule[1].includes(sel), sel);
  assert.doesNotMatch(css(), /btn-dark\.webp/, 'no gold-edged button art');
});

test('presets show a small tag (Pot, 3BB) at the top-left and the amount large in yellow', () => {
  const page = read('src/pages/TablePage.tsx');
  assert.match(page, /<span className="qb-tag">\{betLabel\(value, opening\)\}<\/span> <b className="qb-amt">\{amt\(target\)\}<\/b>/);
  assert.match(css(), /\.quick-bets button \.qb-tag \{[^}]*position: absolute; left: 0; top: 0;/);
  assert.match(css(), /\.qb-amt \{[^}]*color: #fde056/);
});

test('the raise button reads like a GG preset: the word small on top, the amount large in yellow', () => {
  const page = read('src/pages/TablePage.tsx');
  assert.match(page, /<span className="act-word">\{raiseTo >= allInTo \? 'All in' : \(state && state\.currentBet > 0 \? 'Raise' : 'Bet'\)\}<\/span> <b className="act-amt">\{amt\(raiseTo\)\}<\/b>/);
  assert.match(css(), /\.act-btn \.act-amt \{[^}]*color: #fde056/);
});

test('Call reads like GG too: the word on top, the amount in yellow under it', () => {
  assert.match(read('src/pages/TablePage.tsx'), /<span className="act-word">Call<\/span> <b className="act-amt">\{amt\(toCall\)\}<\/b>/);
  assert.match(css(), /:is\(\.act-raise, \.act-allin, \.act-call\)/);
});

test('an open chat spans the screen width and the reaction picker opens leftwards, inside the screen', () => {
  assert.match(css(), /\.table-screen \.tchat-dock\.open \{ left: 8px; \}/);
  assert.match(css(), /\.table-screen \.reaction-picker \{ left: auto; right: 0; \}/);
});

test('on your turn the HUD steps aside while the chat menu remains accessible', () => {
  assert.match(css(), /\.table-screen:has\(\.action-bar :is\(\.main-actions, \.aof-row\)\) \.tt-hud \{ visibility: hidden; \}/);
});

test('chat and reactions share a slim horizontal row', () => {
  assert.match(css(), /\.table-screen \.tchat-buttons \{ flex-direction: row;/);
});

test('the chat corner always clears the bottom bar, even the taller sitting-out panel', () => {
  assert.match(css(), /\.tchat-dock \{[^}]*bottom: calc\(max\(var\(--phone-bar-h\), var\(--action-bar-h, 0px\)\) \+ 8px\)/);
});

test('the chat and reaction toggles match the charcoal buttons instead of gold chips', () => {
  assert.match(css(), /\.table-screen \.tchat-buttons \.tchat-toggle \{[^}]*background: linear-gradient\(#343434, #262626\)/);
  assert.match(css(), /\.tchat-toggle \.tchat-icon \[fill="#fbefcc"\] \{ fill: #262626; \}/);
  assert.match(css(), /\.tchat-toggle\[aria-expanded="true"\] \{[^}]*#fde056/);
});
