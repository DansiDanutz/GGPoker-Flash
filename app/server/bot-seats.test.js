import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';
import * as waitlist from './waitlist.js';
import { botFillCount, ensureBots, evictableBotSeat, holdsLiveCards, releaseBotsForWaiting, waitingFor } from './bot-seats.js';

const cfg = (over = {}) => ({ id: 'bp', name: 'BP', game: 'holdem', sb: 50, bb: 100, seats: 3, min_buyin: 1000, max_buyin: 5000, ...over });

/** A table whose seats are all taken: one human plus bots, no hand dealt yet. */
function fullTable() {
  const t = new PokerTable(cfg());
  t.nextHandAt = Date.now() + 3_600_000; // keep the table idle so the test controls the street
  t.sit({ id: 'h1', nick: 'Human' }, 0, 1000);
  t.fillBots(2);
  return t;
}

test('public state labels bots with isBot and humans without it', () => {
  const t = fullTable();
  const players = t.snapshotFor('h1').players;
  assert.equal(players[0].isBot, false);
  assert.equal(players[1].isBot, true);
  assert.equal(players[2].isBot, true);
});

test('a bot holding live cards is not evictable; a bot is once the hand is over or it folded', () => {
  const t = fullTable();
  const botSeat = t.seats[1];
  assert.equal(holdsLiveCards(t, botSeat), false, 'no hand: nobody holds live cards');
  assert.equal(evictableBotSeat(t)?.index, 1);

  t.street = 'flop';
  for (const s of t.seats) Object.assign(s.player, { inHand: true, folded: false });
  assert.equal(holdsLiveCards(t, botSeat), true);
  assert.equal(evictableBotSeat(t), null, 'mid-hand, every bot still has cards');

  t.seats[2].player.folded = true;
  assert.equal(evictableBotSeat(t)?.index, 2, 'a folded bot holds no live cards');

  t.street = 'ended';
  t.seats[2].player.folded = false;
  assert.equal(evictableBotSeat(t)?.index, 1, 'between hands every bot may go');
});

test('waitingFor counts the table queue and the group queue', () => {
  const t = fullTable();
  let s = waitlist.createWaitlist();
  assert.equal(waitingFor(s, t.cfg), 0);
  s = waitlist.join(s, 7, { tableId: 'bp' }).state;
  s = waitlist.join(s, 8, { groupKey: waitlist.groupKey(t.cfg), tables: [] }).state;
  assert.equal(waitingFor(s, t.cfg), 2);
});

test('bots never take a seat while humans are waiting', () => {
  const t = new PokerTable(cfg({ seats: 6 }));
  assert.equal(botFillCount(t, 0), 3, 'no queue: half the table is seeded with bots');
  assert.equal(botFillCount(t, 1), 0);
  t.tournament = { level: 1 };
  assert.equal(botFillCount(t, 0), 0, 'tournament tables never get bots');
});

test('an empty cash lobby table is warmed once with three idle bots', () => {
  const t = new PokerTable(cfg({ seats: 6 }));
  assert.equal(ensureBots(t, 0, false), 3);
  assert.equal(t.occupiedSeats().length, 3);
  assert.equal(t.street, 'idle', 'unattended bots do not generate hands or database growth');
  assert.equal(ensureBots(t, 0, false), 0, 'lobby polling does not add another bot batch');
});

test('between hands a waiting human makes one bot stand up per queued human', () => {
  const t = fullTable();
  t.street = 'flop';
  for (const s of t.seats) Object.assign(s.player, { inHand: true, folded: false });
  assert.equal(releaseBotsForWaiting(t, 1), 0, 'a bot with live cards finishes its hand first');
  assert.equal(t.seats[1].player.isBot, true);

  t.street = 'ended';
  assert.equal(releaseBotsForWaiting(t, 1), 1);
  assert.equal(t.seats.filter((s) => s.player?.isBot).length, 1, 'only one bot left for one waiting human');
  assert.equal(releaseBotsForWaiting(t, 1), 0, 'the freed seat already covers the waiting human');
  assert.equal(releaseBotsForWaiting(t, 0), 0, 'nobody waiting: bots stay');
});

test('a waitlisted human is offered the freed seat and bots cannot refill it', () => {
  const t = fullTable();
  let s = waitlist.join(waitlist.createWaitlist(), 'h2', { tableId: 'bp' }).state;
  t.street = 'ended';
  assert.equal(releaseBotsForWaiting(t, waitingFor(s, t.cfg)), 1);
  const [freed] = t.offerableSeats();
  const res = waitlist.offer(s, 'bp', freed, Date.now());
  assert.equal(res.status, 'offered');
  assert.equal(res.offer.userId, 'h2');
  s = res.state;
  t.setHolds(s.offers.map((o) => [o.seat, o.userId]));
  t.fillBots(3);
  assert.equal(t.seats[freed].player, null, 'the held seat stays empty for the waiting human');
  assert.equal(t.sit({ id: 'h2', nick: 'Waiting' }, freed, 1000).ok, true);
});

test('spin and tournament tables never release bots for the wait list', () => {
  const t = fullTable();
  t.street = 'ended';
  t.spin = true;
  assert.equal(releaseBotsForWaiting(t, 2), 0);
});
