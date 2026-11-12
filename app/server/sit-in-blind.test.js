// Native SitInCommand uses PostBlinds: a cash player who sat out while hands were dealt
// posts a big blind to be dealt back in, so sitting out cannot dodge the blinds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerTable } from './table.js';

function table(n = 4) {
  const t = new PokerTable({ id: 't', name: 't', game: 'holdem', seats: n, sb: 1, bb: 2, min_buyin: 40, max_buyin: 400, rakePercent: 0 });
  t.saveHand = () => {}; t.botAct = () => {};
  t.nextHandAt = Date.now() + 1e9;
  for (let i = 0; i < n; i++) t.sit({ id: 'p' + i, nick: 'p' + i }, i, 100);
  return t;
}
const deal = (t) => { t.street = 'ended'; t.nextHandAt = 0; t.startHand(); };

test('returning after missed hands posts a live big blind', () => {
  const t = table();
  t.requestSitOut('p3', true);
  t.button = 3; deal(t); // p3 sits this hand out
  assert.equal(t.seats[3].player.inHand, false);
  t.requestSitOut('p3', false);
  t.button = 3; deal(t); // button 0, SB 1, BB 2; p3 is not a blind
  const p3 = t.seats[3].player;
  assert.equal(p3.inHand, true);
  assert.equal(p3.bet, 2, 'posts the big blind to come back in');
  assert.equal(p3.stack, 98);
  assert.equal(p3.missedBlinds, false, 'owed only once');
});

test('no extra post when the returning player is the big blind anyway', () => {
  const t = table();
  t.requestSitOut('p2', true);
  t.button = 3; deal(t);
  t.requestSitOut('p2', false);
  t.button = 3; deal(t); // BB is seat 2
  assert.equal(t.seats[2].player.bet, 2);
  assert.equal(t.seats[2].player.stack, 98);
});

test('sitting back in before any hand was dealt owes nothing', () => {
  const t = table();
  t.requestSitOut('p3', true);
  t.requestSitOut('p3', false);
  t.button = 3; deal(t);
  assert.equal(t.seats[3].player.bet, 0);
});
