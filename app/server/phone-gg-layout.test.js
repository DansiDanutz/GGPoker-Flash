// Phone table laid out like GGPoker mobile (Samsung capture, 15 Nov): a full-height oval, the hero in
// the bottom-left corner, one row of dark buttons along the bottom and the raise presets stacked on
// the right. Original DanGG art only: this copies the layout, not GG's look.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const css = () => read('src/table-phone-gg.css');

test('the GG phone layout loads after every other phone rule', () => {
  const main = read('src/main.tsx');
  const at = (f) => main.indexOf(`import './${f}';`);
  assert.ok(at('table-phone-gg.css') > 0, 'imported');
  for (const f of ['table-phone.css', 'table-phone-look.css', 'table-phone-seat.css', 'table-stage.css', 'table-topbar-history.css']) {
    assert.ok(at('table-phone-gg.css') > at(f), `after ${f}`);
  }
});

test('the stage tells CSS its size so the oval art and felt tint fit any phone', () => {
  const src = read('src/pages/TablePage.tsx');
  assert.match(src, /'--stage-w': `\$\{stage\.width\}px`/);
  assert.match(src, /'--stage-h': `\$\{stage\.height\}px`/);
  assert.match(css(), /var\(--stage-w\)/);
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
  assert.match(css(), /\.seat\.me \.cards \.pcard\.mini \{ width: 58px; height: 81px; \}/);
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

test("David's phone oval art is the upright table on every phone room, stretched to the stage", () => {
  assert.ok(fs.existsSync(path.join(root, 'public/assets/tables/skins/portrait/phone-oval.webp')));
  assert.match(css(), /\.table-screen\[class\] \.table-stage\.stage-portrait::before \{[^}]*transform: none;[^}]*url\('\/assets\/tables\/skins\/portrait\/phone-oval\.webp'\) center \/ 100% 100% no-repeat/);
});

test('the felt tint follows the oval: a stadium inside the gold line', () => {
  assert.match(css(), /\.table-stage\.stage-portrait \.felt \{[^}]*border-radius: calc\(var\(--stage-w\) \* \.465\)/);
});

test("the action, preset and pre-action buttons wear David's dark button art", () => {
  assert.ok(fs.existsSync(path.join(root, 'public/assets/table/ui/btn-dark.webp')));
  const rule = css().match(/([^{}]+)\{[^}]*border-image: url\('\/assets\/table\/ui\/btn-dark\.webp'\) 34 fill \/ 10px stretch/);
  assert.ok(rule, 'one shared rule');
  for (const sel of ['.main-actions .act-btn', '.quick-bets button', '.reserved-actions button']) assert.ok(rule[1].includes(sel), sel);
});
