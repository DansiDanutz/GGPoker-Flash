// Rush quick fold (Fast Fold before your turn): the fold is valid out of turn on Rush tables,
// the folder is skipped when the action comes round, and their chips stay in the pot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';

const CFG = Object.freeze({ id: 'r1', name: 'Rush 1', seats: 4, sb: 5, bb: 10, min_buyin: 100, max_buyin: 5000, rakePercent: 0 });

/** Four humans; button on A (seat 0), so B posts the small blind, C the big blind and D acts first. */
function fourHanded(game = 'rush', saved = []) {
  const t = new PokerTable({ ...CFG, game });
  t.nextHandAt = Date.now() + 1e9;
  t.hooks.onHandSave = (h) => saved.push(h);
  for (const [i, id] of ['A', 'B', 'C', 'D'].entries()) t.sit({ id, nick: id }, i, 1000);
  t.button = 3; t.nextHandAt = 0; t.startHand();
  return t;
}

const player = (t, id) => t.seatOf(id).player;
const chipsOnTable = (t) => t.seats.reduce((a, s) => a + (s.player ? s.player.stack : 0), 0)
  + t.pot + t.totalBets();

test('the deal sets up D to act first with C in the big blind', () => {
  const t = fourHanded();
  assert.equal(t.actor, 'D');
  assert.equal(t.bbSeat, 2);
});

test('a Rush player facing a bet may quick fold before their turn', () => {
  const t = fourHanded();
  const res = t.quickFold('A'); // A faces the 10 big blind; D is to act
  assert.equal(res.ok, true);
  const a = player(t, 'A');
  assert.equal(a.folded, true);
  assert.equal(a.rushQueued, true);
  assert.equal(t.actor, 'D', 'the player to act keeps the turn');
  assert.deepEqual(t.log.at(-1), { nick: 'A', action: 'fold', street: 'preflop' });
});

test('a quick-folded player is skipped when the action reaches them', () => {
  const t = fourHanded();
  t.quickFold('A');
  t.act('D', 'call');
  assert.equal(t.actor, 'B', 'action passes over the folded button straight to the small blind');
});

test('a quick fold on your own turn is an ordinary fold', () => {
  const t = fourHanded();
  assert.equal(t.quickFold('D').ok, true);
  assert.equal(player(t, 'D').folded, true);
  assert.equal(t.actor, 'A');
});

test('the small blind\'s chips stay in the pot after a quick fold', () => {
  const t = fourHanded();
  const before = chipsOnTable(t);
  t.quickFold('B');
  const b = player(t, 'B');
  assert.equal(b.bet, 5, 'the posted small blind is not returned');
  assert.equal(b.stack, 995);
  assert.equal(chipsOnTable(t), before, 'no chip is created or lost');
  t.act('D', 'call'); t.act('A', 'call'); t.act('C', 'check');
  assert.equal(t.street, 'flop');
  assert.equal(t.pot, 35, 'three calls of 10 plus the dead small blind');
});

test('the unopened big blind may quick fold and is told it could check', () => {
  const t = fourHanded();
  assert.deepEqual(t.quickFoldState('C'), { allowed: true, canCheck: true });
  t.act('D', 'call'); t.act('A', 'call'); t.act('B', 'call');
  assert.equal(t.actor, 'C');
  assert.deepEqual(t.quickFoldState('C'), { allowed: true, canCheck: true });
  assert.deepEqual(t.quickFoldState('D'), { allowed: false, canCheck: false }, 'D already matched and has nothing to call');
});

test('a free check after the flop is not a quick fold (use Check/Fold)', () => {
  const t = fourHanded();
  t.act('D', 'call'); t.act('A', 'call'); t.act('B', 'call'); t.act('C', 'check');
  assert.equal(t.street, 'flop');
  assert.deepEqual(t.quickFoldState('D'), { allowed: false, canCheck: false });
  const res = t.quickFold('D');
  assert.equal(res.ok, false);
  assert.equal(player(t, 'D').folded, false);
});

test('a quick fold that leaves one player ends the hand by fold and pays the whole pot', () => {
  const t = fourHanded();
  t.act('D', 'fold'); t.act('A', 'fold');
  t.quickFold('C'); // B is to act; C leaves B alone
  assert.equal(t.street, 'ended');
  assert.equal(player(t, 'B').stack, 1010, 'B wins the dead big blind and keeps the small blind');
  assert.equal(player(t, 'C').stack, 990);
});

test('quick fold is rejected for a folded, all-in or unseated player and between hands', () => {
  const t = fourHanded();
  t.quickFold('A');
  assert.equal(t.quickFold('A').ok, false, 'already folded');
  assert.equal(t.quickFold('Z').ok, false, 'not seated');
  t.act('D', 'allin');
  assert.equal(t.quickFold('D').ok, false, 'all in');
  const idle = new PokerTable({ ...CFG, game: 'rush' });
  idle.sit({ id: 'A', nick: 'A' }, 0, 1000);
  assert.equal(idle.quickFold('A').ok, false);
});

test('regression: a non-Rush table rejects quick fold and every out-of-turn action', () => {
  const t = fourHanded('holdem');
  assert.deepEqual(t.quickFoldState('A'), { allowed: false, canCheck: false });
  assert.equal(t.quickFold('A').ok, false);
  assert.deepEqual(t.act('A', 'fold'), { ok: false, error: 'not your turn' });
  assert.equal(player(t, 'A').folded, false);
});

test('regression: a Rush table still rejects other out-of-turn actions', () => {
  const t = fourHanded();
  assert.deepEqual(t.act('A', 'fold'), { ok: false, error: 'not your turn' });
  assert.deepEqual(t.act('A', 'call'), { ok: false, error: 'not your turn' });
});

test('a quick folder who leaves mid-hand forfeits their blind and stays in the hand history', () => {
  const saved2 = [];
  const u = fourHanded('rush', saved2);
  const cards = player(u, 'C').cards.length;
  u.quickFold('C'); // big blind folds before D acts
  const { stack } = u.stand('C', { forfeit: true });
  assert.equal(stack, 990, 'the big blind stays in the pot');
  assert.equal(u.currentBet, 10, 'the others still owe the big blind');
  assert.equal(u.totalBets(), 15, 'blinds of the departed big blind are still in play');
  u.act('D', 'fold'); u.act('A', 'fold'); u.act('B', 'fold');
  assert.equal(u.street, 'ended');
  const row = saved2.at(-1).players.find((p) => p.id === 'C');
  assert.ok(row, 'the departed quick folder is recorded in the saved hand');
  assert.equal(row.folded, true);
  assert.equal(row.inHand, true);
  assert.equal(row.totalBet, 10);
  assert.equal(row.cards.length, cards);
  assert.equal(row.seat, 2);
});

test('an ordinary leaver still takes back an unmatched bet (no forfeit)', () => {
  const t = fourHanded();
  t.act('D', 'fold'); t.act('A', 'fold');
  // B to act; C's 10 is matched by no one yet; a plain stand returns the unmatched 5.
  const { stack } = t.stand('C');
  assert.equal(stack, 995);
});
