// Phone lobby helpers: the game-type list counts and the tournament row clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventClock, gameSummaries, MOBILE_GAMES } from '../src/lib/mobileLobby.ts';

const MIN = 60_000;
const NOW = Date.parse('2026-11-13T12:00:00Z');
const at = (offsetMin) => new Date(NOW + offsetMin * MIN).toISOString();
const event = (over) => ({ id: 't', name: 'T', status: 'registering', start_at: at(30), buyin: 100, fee: 10, late_reg: 60, ...over });

test('a registering event counts down to its start in mm:ss', () => {
  assert.deepEqual(eventClock(event({ start_at: at(45.5) }), NOW), { tone: 'reg', label: 'Registering', caption: 'Starts in', value: '45:30' });
});

test('a late-reg event counts down to the close of late registration', () => {
  const clock = eventClock(event({ status: 'running', start_at: at(-10), late_reg: 60 }), NOW);
  assert.deepEqual(clock, { tone: 'late', label: 'Late reg', caption: 'Ends in', value: '50:00' });
});

test('countdowns of 100 minutes or more read as whole minutes', () => {
  assert.equal(eventClock(event({ status: 'running', start_at: at(-5), late_reg: 150 }), NOW).value, '145 min(s)');
});

test('a running event past late registration shows no countdown', () => {
  assert.deepEqual(eventClock(event({ status: 'running', start_at: at(-90), late_reg: 60 }), NOW), { tone: 'run', label: 'Running', caption: '', value: '' });
});

test('a finished event says so', () => {
  assert.equal(eventClock(event({ status: 'completed' }), NOW).label, 'Finished');
});

test('game summaries total seated players per game type (capture-gated formats have no row)', () => {
  const tables = [
    { id: 'a', game: 'holdem', players: 4 }, { id: 'b', game: 'holdem', players: 2 },
    { id: 'c', game: 'omaha5', players: 3 }, { id: 'd', game: 'rushplo', players: 5 },
    { id: 'e', game: 'battleroyale', players: 9 },
  ];
  const byKey = Object.fromEntries(gameSummaries(tables).map((g) => [g.key, g.players]));
  assert.equal(byKey.holdem, 6);
  assert.equal(byKey.plo, 3);
  assert.equal(byKey.rush, 5);
  assert.equal(byKey.aof, 0);
  assert.equal(byKey.battle, undefined);
});

test('every phone game row opens a real lobby tab', () => {
  assert.ok(MOBILE_GAMES.length >= 5);
  for (const g of MOBILE_GAMES) assert.match(g.key, /^(aof|holdem|plo|short|rush|spin)$/);
});

import { casinoTabFromRoute, CASINO_GAMES } from '../src/components/mobile/casinoGames.ts';

test('a casino deep link opens that game and anything else opens the hub', () => {
  assert.equal(casinoTabFromRoute('/casino?game=roulette'), 'roulette');
  assert.equal(casinoTabFromRoute('/casino?game=nope'), 'lobby');
  assert.equal(casinoTabFromRoute('/casino'), 'lobby');
  assert.equal(casinoTabFromRoute('/casino?game=slots'), 'lobby');
  assert.ok(CASINO_GAMES.every((g) => g.route === '/slots' || g.route === `/casino?game=${g.key}`));
});
