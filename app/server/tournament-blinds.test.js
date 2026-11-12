import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TOURNAMENT_LEVEL, clampTournamentLevel, tournamentLevelBlinds } from './tournament-blinds.js';
import { PokerTable } from './table.js';

const descriptor = (extra = {}) => ({ baseSb: 100, baseBb: 200, level: 1, levelStartedAt: Date.now(), blindEvery: 10, ...extra });

function tournamentTable(tournament, ante = 25) {
  return new PokerTable({
    id: 'trn-blinds', name: 'Blinds', game: 'holdem', sb: 100, bb: 200, ante, seats: 6,
    min_buyin: 10_000, max_buyin: 10_000, tournament,
  });
}

test('antes keep the base ante-to-big-blind ratio at every level', () => {
  const base = { baseSb: 100, baseBb: 200, baseAnte: 25 };
  assert.deepEqual(tournamentLevelBlinds(base, 1), { sb: 100, bb: 200, ante: 25 });
  for (const level of [2, 3, 5, 8, 12]) {
    const { bb, ante } = tournamentLevelBlinds(base, level);
    assert.equal(ante, Math.round(bb / 8), `level ${level}: ante stays 1/8 of the big blind`);
  }
  assert.deepEqual(tournamentLevelBlinds(base, 3), { sb: 225, bb: 450, ante: 56 });
});

test('an event without a base ante never posts one', () => {
  assert.equal(tournamentLevelBlinds({ baseSb: 100, baseBb: 200 }, 9).ante, 0);
  assert.equal(tournamentLevelBlinds({ baseSb: 100, baseBb: 200, baseAnte: 0 }, 9).ante, 0);
});

test('blinds stop rising at the level cap and stay safe integers', () => {
  const base = { baseSb: 100, baseBb: 200, baseAnte: 25 };
  const capped = tournamentLevelBlinds(base, MAX_TOURNAMENT_LEVEL);
  assert.deepEqual(tournamentLevelBlinds(base, MAX_TOURNAMENT_LEVEL + 50), capped);
  assert.deepEqual(tournamentLevelBlinds(base, 1e9), capped);
  for (const v of Object.values(capped)) assert.ok(Number.isSafeInteger(v));
  assert.equal(clampTournamentLevel(MAX_TOURNAMENT_LEVEL + 3), MAX_TOURNAMENT_LEVEL);
  assert.equal(clampTournamentLevel(0), 1);
  assert.equal(clampTournamentLevel('junk'), 1);
});

test('a tournament table scales its ante when the level rises', () => {
  const tournament = descriptor();
  const table = tournamentTable(tournament);
  assert.equal(table.ante, 25);
  assert.equal(tournament.baseAnte, 25, 'the first flight records the base ante on the shared descriptor');
  tournament.level = 3;
  table.applyTournamentLevel();
  assert.deepEqual({ sb: table.sb, bb: table.bb, ante: table.ante }, { sb: 225, bb: 450, ante: 56 });
});

test('a flight opened at a later level starts with the scaled ante', () => {
  const table = tournamentTable(descriptor({ level: 5, baseAnte: 25 }));
  assert.deepEqual(
    { sb: table.sb, bb: table.bb, ante: table.ante },
    tournamentLevelBlinds({ baseSb: 100, baseBb: 200, baseAnte: 25 }, 5),
  );
});

test('the blind clock never pushes the level past the cap', () => {
  const tournament = descriptor({ level: MAX_TOURNAMENT_LEVEL - 1, levelStartedAt: 1 });
  const table = tournamentTable(tournament);
  table.tick(1 + 10 * 60_000 * 40);
  assert.equal(tournament.level, MAX_TOURNAMENT_LEVEL);
  assert.deepEqual(
    { sb: table.sb, bb: table.bb, ante: table.ante },
    tournamentLevelBlinds(tournament, MAX_TOURNAMENT_LEVEL),
  );
});
