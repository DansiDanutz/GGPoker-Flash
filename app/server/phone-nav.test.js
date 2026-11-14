// Phone tab bar: five destinations, Home in the centre, and the tab each route lights up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { activeNavKey, PHONE_NAV } from '../src/lib/phoneNav.ts';

test('the tab bar has five items with the Home brand button in the centre', () => {
  assert.deepEqual(PHONE_NAV.map((i) => i.key), ['poker', 'events', 'home', 'casino', 'me']);
  assert.equal(PHONE_NAV[2].kind, 'brand');
  assert.equal(PHONE_NAV[4].kind, 'avatar');
});

test('the Poker tab owns every play route, whatever the game', () => {
  assert.equal(activeNavKey('/?play=1'), 'poker');
  assert.equal(activeNavKey('/?play=1&game=plo'), 'poker');
  assert.equal(activeNavKey('/?game=plo&play=1'), 'poker');
});

test('tournaments, casino and account pages light their own tab', () => {
  assert.equal(activeNavKey('/tournaments'), 'events');
  assert.equal(activeNavKey('/propbet?create=last_longer'), 'events');
  assert.equal(activeNavKey('/slots/wild-jungle'), 'casino');
  assert.equal(activeNavKey('/my-page?tab=wallet'), 'me');
  assert.equal(activeNavKey('/cashier'), 'me');
});

test('home and unknown routes fall back to Home', () => {
  assert.equal(activeNavKey('/'), 'home');
  assert.equal(activeNavKey(''), 'home');
  assert.equal(activeNavKey('/leaderboard'), 'home');
  assert.equal(activeNavKey('/?play=10'), 'home');
});
