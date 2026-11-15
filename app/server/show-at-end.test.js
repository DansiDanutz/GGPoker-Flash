// Tap a hole card during the hand to show it when the hand ends (DanGG: eye icon on the card).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PokerTable } from './table.js';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function headsUp() {
  const events = [];
  const t = new PokerTable({
    id: 'show', name: 'Show', game: 'holdem', sb: 50, bb: 100, seats: 2, min_buyin: 100, max_buyin: 1_000_000,
  }, { onEvent: (_t, e) => events.push(e) });
  t.nextHandAt = Date.now() + 1e9;
  t.sit({ id: 1, nick: 'A' }, 0, 10_000);
  t.sit({ id: 2, nick: 'B' }, 1, 10_000);
  t.nextHandAt = 0;
  t.startHand();
  const actor = t.seatOf(t.actor).player;
  const other = t.seats.find((s) => s.player && s.player.id !== actor.id).player;
  return { t, events, actor, other };
}

test('a card marked during the hand is shown to the table when the hand ends', () => {
  const { t, events, actor, other } = headsUp();
  assert.deepEqual(t.markShowAtEnd(other.id, [1]), { ok: true, showAtEnd: [1] });
  t.act(actor.id, 'fold', 0);
  assert.equal(t.street, 'ended');
  assert.deepEqual(other.shown, [1]);
  const shown = events.find((e) => e.type === 'cards_shown');
  assert.equal(shown.playerId, other.id);
  assert.deepEqual(shown.indices, [1]);
  assert.deepEqual(other.showAtEnd, [], 'the mark is used up');
});

test('the folding player can mark a card too; marks are cleaned and can be taken back', () => {
  const { t, actor } = headsUp();
  assert.deepEqual(t.markShowAtEnd(actor.id, [0, 0, 5, -1, 'x']).showAtEnd, [0]);
  assert.deepEqual(t.markShowAtEnd(actor.id, []).showAtEnd, [], 'tapping again takes it back');
  t.markShowAtEnd(actor.id, [0, 1]);
  t.act(actor.id, 'fold', 0);
  assert.deepEqual(actor.shown, [0, 1]);
});

test('marks only work in a live hand, and only the owner sees their own marks', () => {
  const { t, actor, other } = headsUp();
  t.markShowAtEnd(other.id, [0]);
  const seatOf = (viewer, id) => t.snapshotFor(viewer).players.find((p) => p.id === id);
  assert.deepEqual(seatOf(other.id, other.id).showAtEnd, [0]);
  assert.equal(seatOf(actor.id, other.id).showAtEnd, undefined, 'opponents never see a mark');
  t.act(actor.id, 'fold', 0);
  assert.equal(t.markShowAtEnd(other.id, [1]).ok, false, 'after the hand, show cards directly');
});

test('the server takes show_at_end messages from the table client', () => {
  assert.match(read('server/index.js'), /msg\.type === 'show_at_end'[\s\S]{0,200}markShowAtEnd\(ws\.userId, msg\.cards\)[\s\S]{0,160}broadcastState\(entry\.table\)/);
});

test('during a live hand your own known cards can be marked; tapping again takes the mark back', async () => {
  const { canMarkShowAtEnd, toggleShowMark } = await import('../src/game/showOptions.ts');
  const me = { inHand: true, cards: ['As', 'Kd'] };
  assert.equal(canMarkShowAtEnd(me, 'flop', false), true);
  assert.equal(canMarkShowAtEnd(me, 'ended', false), false, 'after the hand the normal show applies');
  assert.equal(canMarkShowAtEnd(me, 'idle', false), false);
  assert.equal(canMarkShowAtEnd(me, 'flop', true), false, 'observers cannot');
  assert.equal(canMarkShowAtEnd({ inHand: false, cards: [] }, 'flop', false), false);
  assert.deepEqual(toggleShowMark([], 1), [1]);
  assert.deepEqual(toggleShowMark([1], 0), [0, 1]);
  assert.deepEqual(toggleShowMark([0, 1], 1), [0]);
});

test('the table draws the eye on a marked card and fades shown cards up', () => {
  const page = read('src/pages/TablePage.tsx');
  assert.match(page, /send\(\{ type: 'show_at_end', tableId, cards: toggleShowMark\(marks, i\) \}\)/);
  assert.match(page, /<img className="show-mark" src="\/assets\/table\/ui\/ic-show-card\.webp" alt="" \/>/);
  assert.match(page, /'Show this card when the hand ends'/);
  assert.match(page, /\(fadeUp \? ' fade-up' : ''\)/);
  assert.ok(fs.existsSync(path.join(root, 'public/assets/table/ui/ic-show-card.webp')), 'the eye art ships');
  const css = read('src/table-show-card.css');
  assert.match(css, /\.table-screen \.card-slot \.show-mark \{/);
  assert.match(css, /@keyframes showCardFadeUp/);
  assert.match(read('src/main.tsx'), /import '\.\/table-show-card\.css';/);
});
