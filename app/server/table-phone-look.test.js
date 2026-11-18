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

test('seats have round portraits with cards fanned over them', () => {
  const s = look();
  assert.match(rule(s, '.table-screen .table-stage.stage-portrait .seat .avatar-wrap'), /width: 64px; height: 64px;/);
  assert.match(rule(s, '.table-screen .table-stage.stage-portrait .seat:not(.me) .cards'), /position: absolute; top: 12px; z-index: 3;/);
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

test('the portrait countdown drains below the plate and turns red when urgent', () => {
  const s = look();
  const timer = rule(s, '.table-screen .table-stage.stage-portrait .seat .timer');
  assert.match(timer, /display: block;/);
  assert.match(timer, /var\(--turn, 1\) \* 100%/);
  assert.match(timer, /animation: none;/);
  assert.match(s, /\.seat\.active\.hot \.timer/);
  assert.match(s, /#ff5656/);
  assert.match(read('src/pages/TablePage.tsx'), /isActor && !p.folded \? <div className="timer"/);
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

test('portrait tournament status lives on the felt and remains visible on phones', () => {
  const page = read('src/pages/TablePage.tsx');
  const layout = read('src/table-phone-layout.css');
  assert.match(page, /stage.mode === 'portrait' && state\?\.tournament && <TournamentHud/);
  assert.match(rule(layout, '.table-screen .table-stage.stage-portrait .tt-hud'), /display: block;/);
  assert.match(rule(layout, '.table-screen .table-stage.stage-portrait .tt-hud'), /pointer-events: none;/);
});
