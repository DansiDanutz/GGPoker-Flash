// Phone table look (David's 15 Nov mockup): big round portraits with cards peeking behind,
// two-line name plates (flag + name, then stack), chip stacks with amount pills on the felt,
// and the bet slider in a framed upright column with + on top and - at the bottom.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const look = () => read('src/table-phone-look.css');
const PHONE = /@media \(max-width: 760px\) and \(orientation: portrait\)/;
const rule = (s, selector) => {
  const at = s.indexOf(selector + ' {');
  assert.ok(at >= 0, `missing rule ${selector}`);
  return s.slice(at, s.indexOf('}', at));
};

test('the look loads after the phone layout, so it wins over it', () => {
  const main = read('src/main.tsx');
  assert.ok(main.indexOf("./table-phone-look.css") > main.indexOf("./table-phone.css"));
  assert.match(look(), PHONE);
});

test('the table screen never scrolls sideways (a focused slider used to shift it 30px)', () => {
  const s = read('src/styles.css');
  assert.match(rule(s, '.table-screen'), /overflow: clip;/);
});

test('seats are big round portraits with the cards peeking out behind them', () => {
  const s = look();
  assert.match(rule(s, '.table-screen .table-stage.stage-portrait .seat .avatar-wrap'), /width: 64px; height: 64px;/);
  assert.match(rule(s, '.table-screen .table-stage.stage-portrait .seat:not(.me) .cards'), /z-index: 1;/);
  assert.match(rule(s, '.table-screen .table-stage.stage-portrait .seat .avatar-wrap .face'), /inset: 0;/);
});

test('the name plate reads flag and name, then the stack', () => {
  const s = look();
  assert.match(rule(s, '.table-screen .table-stage.stage-portrait .seat .plate .seat-flag'), /order: -1;/);
  assert.match(rule(s, '.table-screen .table-stage.stage-portrait .seat .plate'), /border: 1px solid/);
  // The BOT tag rides the plate's top edge, so it never squeezes the name to a few letters.
  assert.match(rule(s, '.table-screen .table-stage.stage-portrait .seat .plate .bot-badge'), /position: absolute; top: -7px;/);
});

test('bets show as a chip stack with its amount on the felt, not on the plate', () => {
  const s = look();
  assert.match(rule(s, '.table-screen .table-stage.stage-portrait .wager-amount'), /display: inline-block;/);
  assert.match(rule(s, '.table-screen .table-stage.stage-portrait .seat-bet-inline'), /display: none;/);
});

test('the bet slider sits in a framed upright column: + on top, then the track, the amount and -', () => {
  const s = look();
  assert.match(s, /\.main-actions:has\(\.bet-slider:not\(:disabled\)\)::after \{/);
  assert.match(rule(s, '.table-screen .action-bar .main-actions .bet-stepper'), /display: contents;/);
  const plus = rule(s, '.table-screen .action-bar .main-actions .bet-stepper .bet-step:last-child');
  const minus = rule(s, '.table-screen .action-bar .main-actions .bet-stepper .bet-step:first-child');
  const bottom = (r) => Number(r.match(/bottom: calc\(100% \+ (\d+)px\)/)[1]);
  assert.ok(bottom(plus) > bottom(minus), '+ is above -');
});

test('short phones lay the slider flat in the panel instead, so it never covers a lower seat', () => {
  const s = look();
  const short = s.slice(s.indexOf('(max-height: 739px)'));
  assert.ok(short.length > 20, 'a short-phone block exists');
  assert.match(short, /::after \{ display: none; \}/);
  assert.match(short, /writing-mode: horizontal-tb;/);
});

test('the turn timer is a thin ring hugging the portrait that drains with the clock, red when short', () => {
  const s = look();
  assert.match(rule(s, '.table-screen .table-stage.stage-portrait .seat .timer'), /display: none;/);
  const ring = rule(s, '.table-screen .table-stage.stage-portrait .seat.active:not(.folded) .avatar-wrap::after');
  assert.match(ring, /conic-gradient\(var\(--ring, #ffd36a\) calc\(var\(--turn, 1\) \* 360deg\)/);
  assert.match(s, /\.seat\.active\.hot \.avatar-wrap::after \{ --ring: #ff4d4d; \}/);
  // The seat carries the countdown so the ring can read it.
  assert.match(read('src/pages/TablePage.tsx'), /\.\.\.\(isActor \? \{ '--turn': timerPct \} : \{\}\)/);
});

test('hole cards are held like a real hand: the second card overlaps the first, no gap between them', () => {
  const s = look();
  assert.match(rule(s, '.table-screen .table-stage.stage-portrait .seat .cards'), /display: flex; justify-content: center; gap: 0;/);
  // One shared pivot below the hand, so the fan never opens a wedge between the cards.
  assert.match(rule(s, '.table-screen .table-stage.stage-portrait .seat .cards .card-slot'), /transform-origin: 50% 150%;/);
  const overlap = (sel) => Number(rule(s, sel).match(/margin-left: -(\d+)px/)[1]);
  assert.ok(overlap('.table-screen .table-stage.stage-portrait .seat.me .cards .card-slot:last-child') >= 50, 'your second card covers over half of the first');
  assert.ok(overlap('.table-screen .table-stage.stage-portrait .seat:not(.me) .cards .card-slot:last-child') >= 18, "opponents' backs overlap too");
  assert.doesNotMatch(s, /\.seat\.me \.cards \.card-slot:(first|last)-child \{ transform: rotate\([^)]*\) translate/);
});

test("your own ring counts down along the part your cards and plate leave visible", () => {
  const s = look();
  const mine = rule(s, '.table-screen .table-stage.stage-portrait .seat.me.active:not(.folded) .avatar-wrap::after');
  // A 170deg arc from just past the bottom round to the upper left, drained part on a dark track.
  assert.match(mine, /conic-gradient\(from 170deg, var\(--ring, #ffd36a\) 0 calc\(var\(--turn, 1\) \* 170deg\), rgba\(0, 0, 0, \.55\) 0 170deg, transparent 0\)/);
  // It comes after the shared ring rule, so it wins for your seat while red still applies when time is short.
  assert.ok(s.indexOf('.seat.me.active:not(.folded) .avatar-wrap::after') > s.indexOf('.seat.active:not(.folded) .avatar-wrap::after {'));
  assert.ok(s.indexOf('.seat.active.hot .avatar-wrap::after { --ring') > s.indexOf('.seat.me.active:not(.folded) .avatar-wrap::after'));
});
