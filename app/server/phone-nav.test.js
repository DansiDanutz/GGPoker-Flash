// Phone tab bar: five destinations, Home in the centre, and the tab each route lights up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { activeNavKey, landingRoute, PHONE_NAV } from '../src/lib/phoneNav.ts';

test('the tab bar exposes organizers without changing the Home brand or account destinations', () => {
  assert.deepEqual(PHONE_NAV.map((i) => i.key), ['poker', 'events', 'home', 'casino', 'organizers', 'me']);
  assert.equal(PHONE_NAV[2].kind, 'brand');
  assert.equal(PHONE_NAV[5].kind, 'avatar');
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
  assert.equal(activeNavKey('/organizers'), 'organizers');
  assert.equal(activeNavKey('/my-page?tab=wallet'), 'me');
  assert.equal(activeNavKey('/cashier'), 'me');
});

test('home and unknown routes fall back to Home', () => {
  assert.equal(activeNavKey('/'), 'home');
  assert.equal(activeNavKey(''), 'home');
  assert.equal(activeNavKey('/leaderboard'), 'home');
  assert.equal(activeNavKey('/?play=10'), 'home');
});

test('after login a phone lands on the Poker game menu and a desktop on Home', () => {
  assert.equal(landingRoute(true), '/?play=1');
  assert.equal(activeNavKey(landingRoute(true)), 'poker');
  assert.equal(landingRoute(false), '/');
});
