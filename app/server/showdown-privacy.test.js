// Mucked losing hands must never reach other players (live win event and table snapshot).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';

function playToShowdown() {
  const events = [];
  const t = new PokerTable({
    id: 'priv', name: 'Priv', game: 'holdem', sb: 50, bb: 100, seats: 2, min_buyin: 100, max_buyin: 1e6, botIterations: 8,
  }, { onEvent: (_t, e) => events.push(e) });
  t.nextHandAt = Date.now() + 1e9;
  t.sit({ id: 1, nick: 'A' }, 0, 10_000);
  t.sit({ id: 2, nick: 'B' }, 1, 10_000);
  t.nextHandAt = 0;
  t.startHand();
  for (let i = 0; i < 20 && t.street !== 'ended'; i++) {
    const actor = t.actor;
    const p = t.seats.find((s) => s.player && s.player.id === actor)?.player;
    const toCall = t.currentBet - p.bet;
    assert.equal(t.act(actor, toCall > 0 ? 'call' : 'check').ok, true);
  }
  return { t, events };
}

test('a mucked loser\'s cards are hidden from the win event and snapshots; winners stay visible', () => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const { t, events } = playToShowdown();
    const win = events.find((e) => e.type === 'win');
    const winnerSeats = new Set(win.winners.map((w) => w.seat));
    const loser = win.hands.find((h) => !winnerSeats.has(h.seat));
    if (!loser) continue; // split pot: everybody won, try another deal
    assert.equal(loser.cards, null, 'event hides the mucked hand');
    const winner = win.hands.find((h) => winnerSeats.has(h.seat));
    assert.equal(winner.cards.length, 2);
    const loserId = t.seats[loser.seat].player.id;
    const otherId = loserId === 1 ? 2 : 1;
    const snap = t.snapshotFor(otherId);
    assert.equal(snap.result.hands.find((h) => h.seat === loser.seat).cards, null, 'snapshot hides it too');
    return;
  }
  assert.fail('no non-split showdown in 20 deals');
});
