// The table UI's pure logic lives in TypeScript; Node strips the types so it can be tested here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { betLimits, potFractionTarget, sizingPresets, potOdds } from '../src/game/betting.ts';
import { betUnitOf, enterBetRequest, normalizeBettingOptions } from '../src/lib/tablePrefs.ts';
import { potChipLayout, shuffleFramePosition, shuffleScrubFrame } from '../src/game/potChips.ts';
import { cardOrdinal, squeezeDragFrame, squeezeWheelFrame } from '../src/game/squeeze.ts';
import { showdownComplete, showdownPlan } from '../src/game/showdown.ts';
import { buildLabel } from '../src/lib/version.ts';
import { bestHand } from '../src/game/eval.ts';
import {
  WAITLIST_TABLE_CAP, waitlistActionFor, waitCount,
  offerSecondsLeft, formatCountdown, isOfferUrgent, offerProgress, chipCount, waitlistChipLabel,
  queuePositionLabel, groupKeyOf, queueName, applyQueueUpdate, groupActionFor,
} from '../src/lib/waitlist.ts';
import {
  TAB_GAMES, pillsFor, columnsFor, COLUMN_LABEL, variantOf, VARIANT_LABEL, tableSizeChip, promotionOf,
  DEFAULT_TAB_FILTERS, filtersForTab, withTabFilters, parseFilterPrefs, filterTables, sortTables,
  activeFilterCount, resetExtraFilters, SEARCH_MAX, groupTables, tableGroupKey, UNAVAILABLE_TABS,
} from '../src/lib/lobbyFilters.ts';
import {
  poolVariant, sortPools, visiblePools, poolTables, poolAsGroup, playersLabel, chipsWonLabel, countryFlag, leaderboardRows,
} from '../src/lib/rushPools.ts';

import {
  ordinal as prizeOrdinal, prizeText, placesPaidLabel, bubbleLabel, finishToast, finishTitle,
} from '../src/lib/tournamentPrizes.ts';

const ctx = (over = {}) => ({
  pot: 300, currentBet: 0, minRaise: 100, bb: 100, myBet: 0, myStack: 5000, maxRaiseTo: 0, street: 'flop', ...over,
});

test('bet limits: minimum raise, all-in ceiling and the price to call', () => {
  const facing = betLimits(ctx({ pot: 700, currentBet: 400, minRaise: 300, myBet: 100 }));
  assert.deepEqual(facing, { toCall: 300, minTo: 700, maxTo: 5100, allInTo: 5100, canRaise: true });
  const short = betLimits(ctx({ currentBet: 400, minRaise: 300, myStack: 250 }));
  assert.equal(short.toCall, 250, 'a call is capped by the stack');
  assert.equal(short.canRaise, false);
});

test('a pot-sized raise calls first and then raises by the pot', () => {
  // 600 in the middle including a 200 bet: call 200, pot becomes 800, raise to 200 + 800.
  assert.equal(potFractionTarget(ctx({ pot: 600, currentBet: 200, minRaise: 200 }), 1), 1000);
  assert.equal(potFractionTarget(ctx({ pot: 300 }), 0.5), 150);
  assert.equal(potFractionTarget(ctx({ pot: 300, myStack: 120 }), 1), 120, 'never above the stack');
  assert.equal(potFractionTarget(ctx({ pot: 30 }), 0.5), 100, 'never below the minimum bet');
});

test('pot-limit ceiling from the server caps every size', () => {
  const plo = ctx({ pot: 150, currentBet: 100, myBet: 50, maxRaiseTo: 300, street: 'preflop' });
  assert.equal(betLimits(plo).maxTo, 300);
  for (const preset of sizingPresets(plo)) assert.ok(preset.target <= 300);
});

test('presets are big-blind multiples for an unopened pot and pot fractions otherwise', () => {
  const open = sizingPresets(ctx({ pot: 150, currentBet: 100, myBet: 0, street: 'preflop' }));
  assert.deepEqual(open.map((p) => p.label), ['2.5x', '3x', '4x']);
  assert.deepEqual(open.map((p) => p.target), [250, 300, 400]);
  const post = sizingPresets(ctx({ pot: 900 }));
  assert.deepEqual(post.map((p) => p.label), ['33%', '50%', '75%', 'Pot']);
  assert.deepEqual(post.map((p) => p.target), [300, 450, 675, 900]);
  assert.deepEqual(sizingPresets(ctx({ pot: 900 }), 100).map((p) => p.target), [300, 500, 700, 900], 'rounded to the chip step');
});

test('pot odds', () => {
  assert.deepEqual(potOdds(900, 300), { ratio: 3, equityNeeded: 0.25 });
  assert.equal(potOdds(900, 0), null);
});

test('client hand label follows short-deck rankings', () => {
  const hole = ['Ah', 'Kh'];
  const board = ['9h', '7h', '6h', 'Kd', 'Kc'];
  assert.equal(bestHand(hole, board, false, true).name, 'Flush');
  assert.equal(bestHand(['As', '6d'], ['7c', '8h', '9s', '2d', '2c'], false, true).name, 'Straight');
  assert.equal(bestHand(['As', '6d'], ['7c', '8h', '9s', 'Qd', 'Jc'], false, false).name, 'High Card');
});

test('Enter bets the amount on screen, optionally asking first', () => {
  assert.deepEqual(enterBetRequest({ myTurn: true, canRaise: true, raiseTo: 450, allInTo: 5000 }),
    { action: 'raise', amount: 450, confirm: false });
  assert.deepEqual(enterBetRequest({ myTurn: true, canRaise: true, raiseTo: 450, allInTo: 5000, confirm: true }),
    { action: 'raise', amount: 450, confirm: true }, 'Always confirm carries the flag through');
  assert.deepEqual(enterBetRequest({ myTurn: true, canRaise: true, raiseTo: 5000, allInTo: 5000 }),
    { action: 'allin', amount: 5000, confirm: false }, 'a bet at the ceiling is an all-in');
  assert.equal(enterBetRequest({ myTurn: false, canRaise: true, raiseTo: 450, allInTo: 5000 }), null);
  assert.equal(enterBetRequest({ myTurn: true, canRaise: false, raiseTo: 450, allInTo: 5000 }), null);
  assert.equal(enterBetRequest({ myTurn: true, canRaise: true, raiseTo: 0, allInTo: 5000 }), null);
});

test('the pot pile uses native denominations with per-column caps', () => {
  assert.deepEqual(potChipLayout(0, 200), [], 'an empty pot shows no chips');
  assert.deepEqual(potChipLayout(2000, 200), [{ denom: 5, count: 2 }], '10 BB is two 5-BB chips');
  assert.deepEqual(potChipLayout(24000, 200), [{ denom: 5, count: 4 }, { denom: 100, count: 1 }], '120 BB groups by denomination');
  assert.deepEqual(potChipLayout(180000, 200), [{ denom: 100, count: 9 }], 'a 900 BB pot caps the column');
  assert.deepEqual(potChipLayout(200000, 200), [{ denom: 25, count: 4 }, { denom: 100, count: 9 }], 'overflow uses the next denomination');
  for (const col of potChipLayout(10000000, 200)) assert.ok(col.count <= 9);
  for (const col of potChipLayout(200000, 200, 4)) assert.ok(col.count <= 4, 'wager piles use a smaller cap');
  assert.deepEqual(shuffleFramePosition(1), { x: 0, y: 0 });
  assert.ok(Math.abs(shuffleFramePosition(15).x - 93.3333) < 0.01);
  assert.deepEqual(shuffleFramePosition(16), { x: 100, y: 0 });
  assert.equal(shuffleFramePosition(17).x, 0);
  assert.ok(Math.abs(shuffleFramePosition(17).y - 6.6667) < 0.01);
});

test('betting options follow the native defaults and reject junk', () => {
  assert.deepEqual(normalizeBettingOptions(null), { wheelUp: 'increase', unit: 'bb', confirm: 'always' });
  assert.deepEqual(
    normalizeBettingOptions({ wheelUp: 'decrease', unit: 'sb', confirm: 'never' }),
    { wheelUp: 'decrease', unit: 'sb', confirm: 'never' },
  );
  assert.deepEqual(
    normalizeBettingOptions({ wheelUp: 'sideways', unit: 'usd', confirm: 'maybe' }),
    { wheelUp: 'increase', unit: 'bb', confirm: 'always' },
    'unknown values fall back to the native defaults',
  );
  assert.equal(betUnitOf({ unit: 'bb' }, 50, 100), 100);
  assert.equal(betUnitOf({ unit: 'sb' }, 50, 100), 50);
  assert.equal(betUnitOf({ unit: 'bb' }, 0, 0), 1, 'never returns a zero step');
});

test('card squeeze frames follow the native wheel and drag curves', () => {
  assert.equal(cardOrdinal('2c'), 0);
  assert.equal(cardOrdinal('As'), 51);
  assert.throws(() => cardOrdinal('1x'));
  assert.equal(squeezeWheelFrame(0, 1), 6, 'one wheel notch peels six frames');
  assert.equal(squeezeWheelFrame(58, 1), 60);
  assert.equal(squeezeWheelFrame(30, 0), 30);
  assert.equal(squeezeDragFrame(0, 400, 0), 60, 'a 400px drag fully opens');
  assert.ok(squeezeDragFrame(0, 100, 0) > 0 && squeezeDragFrame(0, 100, 0) < 60);
  assert.equal(squeezeDragFrame(50, 10, 0), 50, 'dragging back never re-closes the peel');
});

test('showdown reveals run in seat order and finish before the badge', () => {
  assert.deepEqual(showdownPlan([5, 1, 3]), [
    { seat: 1, at: 1067 },
    { seat: 3, at: 1733 },
    { seat: 5, at: 2400 },
  ]);
  assert.equal(showdownComplete([5, 1, 3]), 2700);
  assert.deepEqual(showdownPlan([]), []);
  assert.equal(showdownComplete([]), 0);
});

test('wait-list action: join while seats are free, else join the queue, leave it, or full', () => {
  const t = (over = {}) => ({ players: 6, seats: 6, wait: 0, myWait: 0, ...over });
  assert.equal(waitlistActionFor(t({ players: 4 })), 'join', 'free seat means a plain join');
  assert.equal(waitlistActionFor(t({ players: 4, wait: 3 })), 'join', 'a queue does not hide a free seat');
  assert.equal(waitlistActionFor(t()), 'joinWait', 'a full table offers the wait list');
  assert.equal(waitlistActionFor(t({ wait: WAITLIST_TABLE_CAP - 1 })), 'joinWait');
  assert.equal(waitlistActionFor(t({ wait: WAITLIST_TABLE_CAP })), 'full', 'queue at the cap');
  assert.equal(waitlistActionFor(t({ wait: 2, myWait: 2 })), 'queued', 'already queued');
  assert.equal(waitlistActionFor(t({ wait: WAITLIST_TABLE_CAP, myWait: 4 })), 'queued', 'queued wins over full');
  assert.equal(waitlistActionFor(t({ players: 5, wait: 1, myWait: 1 })), 'queued', 'queued wins over a seat being held');
  assert.equal(waitlistActionFor(t({ myWait: 0 }), 3), 'queued', 'an explicit position overrides the row');
  assert.equal(waitlistActionFor(null), 'join', 'no table selected');
});

test('wait count is a whole number and 0 when empty', () => {
  assert.equal(waitCount({ wait: 3 }), 3);
  assert.equal(waitCount({ wait: 0 }), 0);
  assert.equal(waitCount({}), 0);
  assert.equal(waitCount({ wait: -2 }), 0);
  assert.equal(waitCount({ wait: Number.NaN }), 0);
  assert.equal(waitCount(null), 0);
});

test('seat-offer countdown: whole seconds rounded up, m:ss label, urgent in the last 10 s', () => {
  const now = 1_000_000;
  assert.equal(offerSecondsLeft(now + 30_000, now), 30);
  assert.equal(offerSecondsLeft(now + 23_001, now), 24, 'a partial second still shows');
  assert.equal(offerSecondsLeft(now, now), 0, 'the deadline itself has expired');
  assert.equal(offerSecondsLeft(now - 500, now), 0, 'never negative');
  assert.equal(offerSecondsLeft(Number.NaN, now), 0);
  assert.equal(formatCountdown(24), '0:24');
  assert.equal(formatCountdown(8), '0:08');
  assert.equal(formatCountdown(65), '1:05');
  assert.equal(formatCountdown(0), '0:00');
  assert.equal(formatCountdown(-3), '0:00');
  assert.equal(isOfferUrgent(11), false);
  assert.equal(isOfferUrgent(10), true);
  assert.equal(isOfferUrgent(1), true);
  assert.equal(isOfferUrgent(0), false, 'an expired offer is closed, not urgent');
  assert.equal(offerProgress(15), 0.5);
  assert.equal(offerProgress(40), 1, 'clamped to a full ring');
  assert.equal(offerProgress(5, 0), 0, 'no hold length means no ring');
});

test('header chip counts real queues and hides when there are none', () => {
  const q = (key, position, size = 5) => ({ queueKey: key, position, size, kind: 'table', tableId: key.slice(2) });
  assert.equal(chipCount([q('t:a', 3), q('t:b', 1)]), 2);
  assert.equal(chipCount([q('t:a', 0)]), 0, 'position 0 is not a queue');
  assert.equal(chipCount(null), 0);
  assert.equal(waitlistChipLabel(2), '2 wait lists');
  assert.equal(waitlistChipLabel(1), '1 wait list');
  assert.equal(waitlistChipLabel(0), '', 'no label: the chip hides');
  assert.equal(queuePositionLabel({ position: 3, size: 5 }), '#3 of 5');
  assert.equal(queuePositionLabel({ position: 4, size: 2 }), '#4 of 4', 'a stale size never reads below the position');
});

test('queue updates are applied immutably: update, append, or remove at position 0', () => {
  const a = Object.freeze({ queueKey: 't:a', position: 3, size: 5, kind: 'table', tableId: 'a', tableName: 'Alpha' });
  const queues = Object.freeze([a]);
  const moved = applyQueueUpdate(queues, { queueKey: 't:a', position: 2, size: 4, kind: 'table', tableId: 'a' });
  assert.deepEqual(moved.map((q) => [q.position, q.size, q.tableName]), [[2, 4, 'Alpha']], 'keeps the known table name');
  assert.equal(queues[0].position, 3, 'the input is untouched');
  const added = applyQueueUpdate(queues, { queueKey: 'g:holdem:50/100:6', position: 1, size: 1, kind: 'group', groupKey: 'holdem:50/100:6' });
  assert.deepEqual(added.map((q) => q.queueKey), ['t:a', 'g:holdem:50/100:6']);
  assert.deepEqual(applyQueueUpdate(queues, { queueKey: 't:a', position: 0, size: 4, kind: 'table', tableId: 'a' }), []);
  assert.deepEqual(applyQueueUpdate(queues, { queueKey: 't:zz', position: 0, size: 0, kind: 'table', tableId: 'zz' }), [a]);
});

test('group view: key, name and the card action', () => {
  const t = (players, seats = 6) => ({ game: 'holdem', sb: 50, bb: 100, seats, players });
  assert.equal(groupKeyOf(t(6)), 'holdem:50/100:6');
  assert.equal(queueName({ queueKey: 'g:holdem:50/100:6', kind: 'group', groupKey: 'holdem:50/100:6', position: 1, size: 1 }), "Hold'em 50/100 · 6-Max");
  assert.equal(queueName({ queueKey: 't:a', kind: 'table', tableId: 'a', tableName: 'Alpha', position: 1, size: 1 }), 'Alpha');
  assert.equal(queueName({ queueKey: 't:a', kind: 'table', tableId: 'a', position: 1, size: 1 }), 'a', 'falls back to the id');
  assert.equal(groupActionFor([t(6), t(5)]), 'join', 'any free seat in the group means a plain join');
  assert.equal(groupActionFor([t(6), t(6)]), 'joinWait', 'a full group offers its wait list');
  assert.equal(groupActionFor([t(6)], 2), 'queued');
  assert.equal(groupActionFor([t(3)], 1), 'queued', 'queued wins over a free seat');
  assert.equal(groupActionFor([]), 'joinWait', 'no visible table with room');
});

// ---- lobby filters (P0 slice W5a) ----

const lt = (over = {}) => ({
  id: 'x', name: 'Table', game: 'holdem', category: 'Gold', sb: 50, bb: 100, ante: 0, min_buyin: 4000, max_buyin: 10000,
  seats: 6, speed: 'Normal', featured: false, players: 3, wait: 0, avgPot: 0, vpip: 0, handsPerHour: 80, running: true, ...over,
});
const query = (tab, over = {}) => ({ ...DEFAULT_TAB_FILTERS, tab, search: '', favs: [], ...over });
const ids = (list) => list.map((t) => t.id);

test('each tab has the native pill set; tabs without native pills have none', () => {
  const labels = (tab) => pillsFor(tab).map((p) => p.label);
  assert.deepEqual(labels('rush'), ['All', "Hold'em", 'PLO']);
  assert.deepEqual(labels('plo'), ['All', 'PLO', 'PLO-5', 'PLO-6']);
  assert.deepEqual(labels('aof'), ['All', "Hold'em", 'Omaha']);
  assert.deepEqual(labels('holdem'), []);
  assert.deepEqual(labels('nope'), []);
});

test('each tab has the native Group View column set', () => {
  const labels = (tab) => columnsFor(tab).map((c) => COLUMN_LABEL[c]);
  assert.deepEqual(labels('holdem'), ['Promotion', 'Table Size', 'Stakes', 'Buy-in', 'Players', 'Action']);
  assert.deepEqual(labels('rush'), ['Promotion', 'Games', 'Stakes', 'Buy-in', 'Players', 'Pros', 'Hands/hr', 'Action']);
  assert.deepEqual(labels('plo'), ['Promotion', 'Games', 'Table Size', 'Stakes', 'Buy-in', 'Players', 'Action']);
  assert.deepEqual(labels('aof'), ['Promotion', 'Games', 'Stakes', 'Buy-in', 'Players', 'Action']);
  assert.deepEqual(columnsFor('short'), columnsFor('holdem'), 'other tabs fall back to the Hold\'em set');
  for (const tab of Object.keys(TAB_GAMES)) assert.equal(columnsFor(tab).at(-1), 'action');
});

test('variants come from the game id, or from the name for Rush and AoF pools', () => {
  assert.equal(variantOf(lt({ game: 'omaha' })), 'plo');
  assert.equal(variantOf(lt({ game: 'omaha5' })), 'plo5');
  assert.equal(variantOf(lt({ game: 'omaha6' })), 'plo6');
  assert.equal(variantOf(lt({ game: 'shortdeck' })), 'holdem');
  assert.equal(variantOf(lt({ game: 'rush', name: 'Rush & Cash Platinum 01' })), 'holdem');
  assert.equal(variantOf(lt({ game: 'rush', name: 'Rush & Cash PLO 01' })), 'plo');
  assert.equal(variantOf(lt({ game: 'aof', name: 'AoF Omaha Gold' })), 'plo');
  assert.equal(variantOf(lt({ game: 'holdem', name: 'Explorer table' })), 'holdem', 'no false match inside a word');
  assert.equal(VARIANT_LABEL.plo5, 'PLO-5');
});

test('Table Size chip: green 6-Max up to six seats, yellow 9-Max above', () => {
  assert.deepEqual(tableSizeChip(6), { label: '6-Max', tone: '6max' });
  assert.deepEqual(tableSizeChip(9), { label: '9-Max', tone: '9max' });
  assert.deepEqual(tableSizeChip(3), { label: '3-Max', tone: '6max' });
  assert.equal(promotionOf(lt({ featured: true })), 'Featured');
  assert.equal(promotionOf(lt({ category: 'Diamond' })), 'Diamond');
});

test('Battle Royale tab: honest empty-state copy and no joinable rows', () => {
  assert.deepEqual(UNAVAILABLE_TABS.battle, {
    title: 'Battle Royale is not available in DanGG yet',
    detail: 'Native rules and payout format have not been captured; no format is invented here.',
  });
  const rows = [lt({ id: 'br', game: 'battleroyale' }), lt({ id: 'h', game: 'holdem' })];
  assert.deepEqual(ids(filterTables(rows, query('battle'))), [], 'the Battle tab never lists rows');
  assert.deepEqual(ids(filterTables(rows, query('home'))), ['h'], 'Home never lists a Battle Royale row');
  assert.equal(UNAVAILABLE_TABS.holdem, undefined, 'other tabs are unaffected');
});

test('pills filter rows to the right game ids', () => {
  const plo = [lt({ id: 'a', game: 'omaha' }), lt({ id: 'b', game: 'omaha5' }), lt({ id: 'c', game: 'omaha6' }), lt({ id: 'h', game: 'holdem' })];
  assert.deepEqual(ids(filterTables(plo, query('plo'))), ['a', 'b', 'c'], 'All keeps every PLO game and drops other tabs');
  assert.deepEqual(ids(filterTables(plo, query('plo', { pill: 'plo' }))), ['a']);
  assert.deepEqual(ids(filterTables(plo, query('plo', { pill: 'plo5' }))), ['b']);
  assert.deepEqual(ids(filterTables(plo, query('plo', { pill: 'plo6' }))), ['c']);
  const rush = [lt({ id: 'r1', game: 'rush', name: 'Rush & Cash Gold' }), lt({ id: 'r2', game: 'rush', name: 'Rush & Cash PLO' })];
  assert.deepEqual(ids(filterTables(rush, query('rush', { pill: 'holdem' }))), ['r1']);
  assert.deepEqual(ids(filterTables(rush, query('rush', { pill: 'plo' }))), ['r2']);
  const aof = [lt({ id: 'f1', game: 'aof', name: 'AoF Gold 01' })];
  assert.deepEqual(ids(filterTables(aof, query('aof', { pill: 'omaha' }))), [], 'no Omaha AoF pools seeded yet');
  assert.deepEqual(ids(filterTables(aof, query('aof', { pill: 'holdem' }))), ['f1']);
});

test('stake, seat, speed, search and favourites still filter', () => {
  const list = [
    lt({ id: 'lo', name: 'Micro Bay', bb: 200 }), lt({ id: 'mid', name: 'Mid Harbour', bb: 1000, seats: 9 }),
    lt({ id: 'hi', name: 'High Reef', bb: 5000, speed: 'Fast' }),
  ];
  assert.deepEqual(ids(filterTables(list, query('holdem', { stake: 'low' }))), ['lo']);
  assert.deepEqual(ids(filterTables(list, query('holdem', { stake: 'mid' }))), ['mid']);
  assert.deepEqual(ids(filterTables(list, query('holdem', { stake: 'high' }))), ['hi']);
  assert.deepEqual(ids(filterTables(list, query('holdem', { seats: '9' }))), ['mid']);
  assert.deepEqual(ids(filterTables(list, query('holdem', { speed: 'Fast' }))), ['hi']);
  assert.deepEqual(ids(filterTables(list, query('holdem', { search: '  hARBOUR ' }))), ['mid'], 'search is trimmed and case-insensitive');
  assert.deepEqual(ids(filterTables(list, query('holdem', { favOnly: true, favs: ['hi'] }))), ['hi']);
  assert.equal(filterTables(list, query('home')).length, 3, 'home lists every game');
});

test('sorting is stable and home puts featured tables first', () => {
  const list = [lt({ id: 'a', bb: 100 }), lt({ id: 'b', bb: 200 }), lt({ id: 'c', bb: 100 }), lt({ id: 'd', bb: 200 })];
  assert.deepEqual(ids(sortTables(list, 'holdem', 'bb', -1)), ['b', 'd', 'a', 'c']);
  assert.deepEqual(ids(sortTables(list, 'holdem', 'bb', 1)), ['a', 'c', 'b', 'd']);
  const named = [lt({ id: 'z', name: 'zeta' }), lt({ id: 'a', name: 'Alpha' })];
  assert.deepEqual(ids(sortTables(named, 'holdem', 'name', 1)), ['a', 'z']);
  const home = [lt({ id: 'p', bb: 50 }), lt({ id: 'f', bb: 900, featured: true })];
  assert.deepEqual(ids(sortTables(home, 'home', 'bb', -1)), ['f', 'p']);
  assert.deepEqual(ids(list), ['a', 'b', 'c', 'd'], 'input is not reordered');
});

test('filter prefs persist per tab, immutably, and reject bad stored values', () => {
  const start = {};
  const rush = withTabFilters(start, 'rush', { pill: 'plo', stake: 'high' });
  assert.deepEqual(start, {}, 'input prefs untouched');
  assert.equal(filtersForTab(rush, 'rush').pill, 'plo');
  assert.deepEqual(filtersForTab(rush, 'plo'), DEFAULT_TAB_FILTERS, 'other tabs keep their own state');
  assert.equal(filtersForTab(withTabFilters(rush, 'holdem', { pill: 'plo' }), 'holdem').pill, 'all', 'pill must exist on the tab');
  const round = parseFilterPrefs(JSON.stringify(rush));
  assert.deepEqual(round, rush);
  const bad = parseFilterPrefs('{"rush":{"pill":"nope","stake":9,"favOnly":"yes"},"evil":{},"toString":{},"__proto__":{"x":1}}');
  assert.deepEqual(Object.keys(bad), ['rush']);
  assert.deepEqual(bad.rush, DEFAULT_TAB_FILTERS);
  assert.deepEqual(parseFilterPrefs('not json'), {});
  assert.deepEqual(parseFilterPrefs(null), {});
  assert.deepEqual(parseFilterPrefs('[1]'), {});
});

// ---- lobby Filters popover (P0 slice W5b) ----

test('Hide full drops tables with every seat taken', () => {
  const list = [lt({ id: 'full', players: 6, seats: 6 }), lt({ id: 'open', players: 5, seats: 6 }), lt({ id: 'empty', players: 0 })];
  assert.deepEqual(ids(filterTables(list, query('holdem', { hideFull: true }))), ['open', 'empty']);
  assert.deepEqual(ids(filterTables(list, query('holdem'))), ['full', 'open', 'empty'], 'off by default');
});

test('Has seats keeps only tables you can sit at now: a free seat and nobody waiting', () => {
  const list = [
    lt({ id: 'full', players: 6, seats: 6 }), lt({ id: 'open', players: 4, seats: 6 }),
    lt({ id: 'queued', players: 5, seats: 6, wait: 2 }), lt({ id: 'bad-wait', players: 1, wait: undefined }),
  ];
  assert.deepEqual(ids(filterTables(list, query('holdem', { hasSeats: true }))), ['open', 'bad-wait']);
  assert.deepEqual(ids(filterTables(list, query('holdem', { hasSeats: true, hideFull: true, stake: 'high' }))), [], 'combines with the other filters');
});

test('active filter count covers every popover filter but not the visible pill', () => {
  assert.equal(activeFilterCount(DEFAULT_TAB_FILTERS), 0);
  assert.equal(activeFilterCount({ ...DEFAULT_TAB_FILTERS, pill: 'plo' }), 0, 'the pill is shown in the row, not the badge');
  assert.equal(activeFilterCount({ ...DEFAULT_TAB_FILTERS, search: '   ' }), 0, 'blank search is not a filter');
  const all = { pill: 'plo', stake: 'low', seats: '6', speed: 'Fast', search: 'reef', favOnly: true, hideFull: true, hasSeats: true };
  assert.equal(activeFilterCount(all), 7);
});

test('Reset clears the popover filters, keeps the pill, and does not mutate', () => {
  const before = { ...DEFAULT_TAB_FILTERS, pill: 'plo5', stake: 'mid', search: 'x', hideFull: true, hasSeats: true, favOnly: true };
  const snapshot = { ...before };
  const after = resetExtraFilters(before);
  assert.deepEqual(after, { ...DEFAULT_TAB_FILTERS, pill: 'plo5' });
  assert.deepEqual(before, snapshot, 'input untouched');
  assert.equal(activeFilterCount(after), 0);
});

test('Hide full, Has seats and search persist per tab and survive a round trip', () => {
  const prefs = withTabFilters(withTabFilters({}, 'rush', { hideFull: true, search: 'gold' }), 'plo', { hasSeats: true });
  assert.equal(filtersForTab(prefs, 'rush').hideFull, true);
  assert.equal(filtersForTab(prefs, 'rush').hasSeats, false);
  assert.equal(filtersForTab(prefs, 'rush').search, 'gold');
  assert.equal(filtersForTab(prefs, 'plo').hasSeats, true);
  assert.equal(filtersForTab(prefs, 'plo').search, '', 'search is per tab');
  assert.deepEqual(parseFilterPrefs(JSON.stringify(prefs)), prefs);
  const bad = parseFilterPrefs(JSON.stringify({ rush: { hideFull: 'yes', hasSeats: 1, search: 42 } }));
  assert.deepEqual(bad.rush, DEFAULT_TAB_FILTERS, 'non-boolean toggles and non-string search fall back to defaults');
  const long = filtersForTab(withTabFilters({}, 'holdem', { search: 'a'.repeat(500) }), 'holdem');
  assert.equal(long.search.length, SEARCH_MAX, 'stored search is capped');
});

// ---- W6: tournament categories and filters ------------------------------------------------
import {
  DEFAULT_TOURNAMENT_FILTERS, filterTournaments, gameOf, buyinBandOf, speedOf, phaseOf, inCategory,
  tournamentFilterCount, resetTournamentFilters, withTournamentFilters, parseTournamentFilters,
  readTournamentFilters, writeTournamentFilters, emptyTournamentMessage, TOURNAMENT_FILTERS_KEY, TOURNAMENT_SEARCH_MAX,
} from '../src/lib/tournamentFilters.ts';

const T_NOW = Date.parse('2026-11-12T12:00:00Z');
const tourney = (over = {}) => ({
  id: 't', name: 'Daily Main', status: 'registering', start_at: '2026-11-12T14:00:00Z',
  buyin: 1000, fee: 100, format: 'NLH', mode: 'STANDARD', blind_speed: 8, late_reg: 90, ...over,
});
const TOURNEYS = [
  tourney({ id: 'nlh-reg', name: 'Sunday Major', buyin: 20000, fee: 2000 }),
  tourney({ id: 'plo-reg', name: 'PLO Classic', format: 'PLO', buyin: 300, fee: 30 }),
  tourney({ id: 'free', name: 'Freeroll $2,000', buyin: 0, fee: 0 }),
  tourney({ id: 'late', name: 'Turbo $15K', status: 'running', start_at: '2026-11-12T11:30:00Z', buyin: 750, fee: 75 }),
  tourney({ id: 'run', name: 'Mystery Bounty $50K', mode: 'MYSTERY', status: 'running', start_at: '2026-11-12T09:00:00Z', blind_speed: 3 }),
  tourney({ id: 'flip', name: 'Flip & Go $20K', mode: 'FLIP', buyin: 2000, fee: 200 }),
];
const tq = (over = {}) => ({ ...DEFAULT_TOURNAMENT_FILTERS, registered: [], nowMs: T_NOW, ...over });

test('tournament game filter splits NLH and PLO (PLO-5/PLO-6 count as PLO)', () => {
  assert.equal(gameOf(tourney({ format: 'PLO5' })), 'plo');
  assert.equal(gameOf(tourney({ format: null })), 'nlh');
  assert.deepEqual(ids(filterTournaments(TOURNEYS, tq({ game: 'plo' }))), ['plo-reg']);
  assert.equal(filterTournaments(TOURNEYS, tq({ game: 'nlh' })).length, 5);
});

test('tournament buy-in bands use buy-in plus fee in cents', () => {
  assert.equal(buyinBandOf(tourney({ buyin: 0, fee: 0 })), 'free');
  assert.equal(buyinBandOf(tourney({ buyin: 450, fee: 50 })), 'micro', '$5 is the top of micro');
  assert.equal(buyinBandOf(tourney({ buyin: 2300, fee: 200 })), 'low');
  assert.equal(buyinBandOf(tourney({ buyin: 9000, fee: 1000 })), 'mid');
  assert.equal(buyinBandOf(tourney({ buyin: 20000, fee: 2000 })), 'high');
  assert.deepEqual(ids(filterTournaments(TOURNEYS, tq({ buyin: 'free' }))), ['free']);
  assert.deepEqual(ids(filterTournaments(TOURNEYS, tq({ buyin: 'high' }))), ['nlh-reg']);
});

test('tournament status separates registering, late reg and running', () => {
  assert.equal(phaseOf(TOURNEYS[3], T_NOW), 'late', 'started 30 min ago with 90 min late reg');
  assert.equal(phaseOf(TOURNEYS[4], T_NOW), 'running', 'late reg closed');
  assert.equal(phaseOf(tourney({ status: 'completed' }), T_NOW), 'completed');
  assert.deepEqual(ids(filterTournaments(TOURNEYS, tq({ status: 'late' }))), ['late']);
  assert.deepEqual(ids(filterTournaments(TOURNEYS, tq({ status: 'running' }))), ['run']);
  assert.equal(filterTournaments(TOURNEYS, tq({ status: 'registering' })).length, 4);
});

test('tournament speed comes from blind levels with a name override', () => {
  assert.equal(speedOf(tourney({ blind_speed: 8 })), 'regular');
  assert.equal(speedOf(tourney({ blind_speed: 5 })), 'turbo');
  assert.equal(speedOf(tourney({ blind_speed: 2 })), 'hyper');
  assert.equal(speedOf(tourney({ name: 'Hyper Sunday', blind_speed: 10 })), 'hyper');
  assert.deepEqual(ids(filterTournaments(TOURNEYS, tq({ speed: 'turbo' }))), ['late']);
  assert.deepEqual(ids(filterTournaments(TOURNEYS, tq({ speed: 'hyper' }))), ['run']);
});

test('registered only keeps the events the player entered', () => {
  const list = filterTournaments(TOURNEYS, tq({ registeredOnly: true, registered: ['free', 'late'] }));
  assert.deepEqual(ids(list), ['free', 'late']);
  assert.deepEqual(filterTournaments(TOURNEYS, tq({ registeredOnly: true })), []);
});

test('tournament categories match mode first and fall back to the name', () => {
  assert.equal(inCategory(tourney({ name: 'Weekly', mode: 'BOUNTY' }), 'bounty'), true);
  assert.equal(inCategory(tourney({ name: 'Mystery Bounty $10K', mode: 'MYSTERY' }), 'bounty'), false);
  assert.equal(inCategory(tourney({ name: 'WSOP Express $30K' }), 'wsop'), true);
  assert.equal(inCategory(tourney(), 'unknown'), true, 'unknown category lists everything');
  assert.deepEqual(ids(filterTournaments(TOURNEYS, tq({ category: 'flip' }))), ['flip']);
});

test('tournament filters combine with case-insensitive search', () => {
  const list = filterTournaments(TOURNEYS, tq({ search: '  turbo ', status: 'late', registeredOnly: true, registered: ['late'] }));
  assert.deepEqual(ids(list), ['late']);
  assert.deepEqual(filterTournaments(TOURNEYS, tq({ search: 'turbo', game: 'plo' })), []);
});

test('tournament filter count, immutable updates and reset', () => {
  assert.equal(tournamentFilterCount(DEFAULT_TOURNAMENT_FILTERS), 0);
  const f = withTournamentFilters(DEFAULT_TOURNAMENT_FILTERS, { game: 'plo', status: 'late', registeredOnly: true, search: ' x ' });
  assert.equal(tournamentFilterCount(f), 4);
  assert.equal(DEFAULT_TOURNAMENT_FILTERS.game, 'all', 'defaults are not mutated');
  assert.equal(withTournamentFilters(f, { speed: 'warp' }).speed, 'all', 'invalid values fall back');
  assert.deepEqual(resetTournamentFilters(), DEFAULT_TOURNAMENT_FILTERS);
});

test('tournament filters persist through storage and survive bad data', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const f = withTournamentFilters(DEFAULT_TOURNAMENT_FILTERS, { category: 'sat', buyin: 'mid', speed: 'turbo' });
  writeTournamentFilters(f, storage);
  assert.ok(store.has(TOURNAMENT_FILTERS_KEY));
  assert.deepEqual(readTournamentFilters(storage), f);
  assert.deepEqual(parseTournamentFilters('not json'), DEFAULT_TOURNAMENT_FILTERS);
  assert.deepEqual(parseTournamentFilters('[1,2]'), DEFAULT_TOURNAMENT_FILTERS);
  assert.equal(parseTournamentFilters(JSON.stringify({ search: 'x'.repeat(200) })).search.length, TOURNAMENT_SEARCH_MAX);
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.deepEqual(readTournamentFilters(broken), DEFAULT_TOURNAMENT_FILTERS);
  assert.doesNotThrow(() => writeTournamentFilters(f, broken));
});

test('tournament empty-state copy names the filters', () => {
  assert.match(emptyTournamentMessage(DEFAULT_TOURNAMENT_FILTERS), /No tournaments scheduled/);
  assert.match(emptyTournamentMessage(withTournamentFilters(DEFAULT_TOURNAMENT_FILTERS, { game: 'plo' })), /this filter/);
  assert.match(emptyTournamentMessage(withTournamentFilters(DEFAULT_TOURNAMENT_FILTERS, { game: 'plo', status: 'late' })), /these 2 filters/);
});

// ---- Table chat reducer (P0 slice C3) ----
import {
  chatReducer, INITIAL_CHAT, CHAT_HISTORY_LIMIT, chatLineFrom, reactionLineFrom, chatCounter, senderRole,
  linesForView, chatLineClass, isDealerLine, DEALER_NICK,
} from '../src/lib/tableChat.ts';

const chatLine = (n, over = {}) => ({ id: `c:${n}`, kind: 'chat', userId: 7, nick: 'Bo', text: `m${n}`, at: n, ...over });

test('chat reducer appends a line and counts it unread while the panel is closed', () => {
  const s = chatReducer(INITIAL_CHAT, { type: 'append', line: chatLine(1) });
  assert.equal(s.lines.length, 1);
  assert.equal(s.unread, 1);
  assert.equal(INITIAL_CHAT.lines.length, 0, 'the previous state is not mutated');
  const own = chatReducer(s, { type: 'append', line: chatLine(2), own: true });
  assert.equal(own.unread, 1, 'my own lines are never unread');
  const dup = chatReducer(own, { type: 'append', line: chatLine(2) });
  assert.equal(dup, own, 'a repeated id is ignored');
});

test('chat reducer keeps only the latest 50 lines', () => {
  let s = INITIAL_CHAT;
  for (let i = 1; i <= 60; i++) s = chatReducer(s, { type: 'append', line: chatLine(i) });
  assert.equal(s.lines.length, CHAT_HISTORY_LIMIT);
  assert.equal(s.lines[0].id, 'c:11');
  assert.equal(s.lines.at(-1).id, 'c:60');
});

test('chat history merges with live lines, dedupes by id and stays in time order', () => {
  const live = chatReducer(INITIAL_CHAT, { type: 'append', line: chatLine(5) });
  const merged = chatReducer(live, { type: 'history', lines: [chatLine(3), chatLine(4), chatLine(5)] });
  assert.deepEqual(merged.lines.map((l) => l.id), ['c:3', 'c:4', 'c:5']);
  assert.equal(merged.unread, live.unread, 'history is backlog, not unread');
  const again = chatReducer(merged, { type: 'history', lines: [chatLine(3), chatLine(4)] });
  assert.equal(again, merged, 'a replayed history changes nothing');
  const many = Array.from({ length: 70 }, (_, i) => chatLine(i + 1));
  assert.equal(chatReducer(INITIAL_CHAT, { type: 'history', lines: many }).lines.length, CHAT_HISTORY_LIMIT);
});

test('opening the chat resets unread; lines while open are not unread', () => {
  let s = INITIAL_CHAT;
  s = chatReducer(s, { type: 'append', line: chatLine(1) });
  s = chatReducer(s, { type: 'append', line: chatLine(2) });
  assert.equal(s.unread, 2);
  s = chatReducer(s, { type: 'open' });
  assert.equal(s.unread, 0);
  assert.equal(s.open, true);
  s = chatReducer(s, { type: 'append', line: chatLine(3) });
  assert.equal(s.unread, 0);
  s = chatReducer(s, { type: 'close' });
  s = chatReducer(s, { type: 'append', line: chatLine(4) });
  assert.equal(s.unread, 1);
});

test('chat frames parse into lines; unknown reactions and malformed rows are dropped', () => {
  assert.deepEqual(chatLineFrom({ id: 9, userId: 2, nick: 'A', message: '<img src=x>', at: 5 }),
    { id: 'c:9', kind: 'chat', userId: 2, nick: 'A', text: '<img src=x>', at: 5 });
  assert.equal(chatLineFrom({ message: 'no id' }), null);
  const r = reactionLineFrom({ reactionId: 3, userId: 2, nick: 'A', at: 8 });
  assert.equal(r.text, 'Laughing');
  assert.equal(r.kind, 'reaction');
  for (const bad of ['3', 4, null, 1.5]) assert.equal(reactionLineFrom({ reactionId: bad, userId: 2, at: 1 }), null);
});

test('chat counter shows only in the last 40 characters; sender role marks self', () => {
  assert.equal(chatCounter('x'.repeat(240)), null);
  assert.equal(chatCounter('x'.repeat(241)), 39);
  assert.equal(chatCounter('x'.repeat(280)), 0);
  assert.equal(senderRole({ userId: 4 }, 4), 'self');
  assert.equal(senderRole({ userId: 4 }, 5), 'other');
  assert.equal(senderRole({ userId: 4 }, null), 'other');
});

/* ---------------------------- tournament prizes ---------------------------- */

const fmt = (n) => `$${n}`;
const paid3 = [{ place: 1, amount: 5000 }, { place: 2, amount: 3000 }, { place: 3, amount: 2000 }];

test('prize rows format places, tickets and the places-paid count', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 21, 112].map(prizeOrdinal), ['1st', '2nd', '3rd', '4th', '11th', '21st', '112th']);
  assert.equal(prizeText(paid3[1], fmt), '$3000');
  assert.equal(prizeText({ place: 1, amount: 0, ticket: 'Sunday Major' }, fmt), 'Sunday Major ticket');
  assert.equal(placesPaidLabel(paid3), '3 places paid');
  assert.equal(placesPaidLabel([{ place: 1, amount: 0, ticket: 'X' }]), '1 place paid');
});

test('bubble line: the first unpaid place, then in the money, hidden when unknown or decided', () => {
  assert.equal(bubbleLabel(paid3, 20), 'Bubble: 4th');
  assert.equal(bubbleLabel(paid3, 4), 'Bubble: 4th');
  assert.equal(bubbleLabel(paid3, 3), 'In the money');
  assert.equal(bubbleLabel(paid3, 1), null);
  assert.equal(bubbleLabel(paid3, null), null);
  assert.equal(bubbleLabel([], 10), null);
  assert.equal(bubbleLabel([{ place: 1, amount: 0, ticket: 'X' }], 9), 'Bubble: 2nd', 'a satellite bubbles at 2nd');
});

test('finish toast and presentation show the real place and amount', () => {
  assert.deepEqual(finishToast({ nick: 'Dan', place: 3, payout: 2000 }, fmt), { title: 'Finished 3rd', body: 'Dan wins $2000' });
  assert.deepEqual(finishToast({ nick: 'Dan', place: 1, prize: 0, ticket: 'Major' }, fmt), { title: 'Finished 1st', body: 'Dan wins Major ticket' });
  assert.equal(finishTitle(1), 'TOURNAMENT WINNER');
  assert.equal(finishTitle(undefined), 'TOURNAMENT WINNER');
  assert.equal(finishTitle(2), 'FINISHED 2ND');
  assert.equal(finishTitle(3), 'FINISHED 3RD');
});

/* ------------------------------ Rush Cash Drop (R4) ------------------------------ */
import { cashDropRateLabel, cashDropFieldErrors, CASHDROP_RATE_KEY, CASHDROP_AMOUNT_BB_KEY } from '../src/lib/cashDrop.ts';

test('cashDropRateLabel shows the configured rate as a percentage', () => {
  assert.equal(cashDropRateLabel(0.12), '12%');
  assert.equal(cashDropRateLabel(0.125), '12.5%');
  assert.equal(cashDropRateLabel(1), '100%');
  assert.equal(cashDropRateLabel(undefined), '12%');
});

test('cashDropFieldErrors flags out-of-range and non-numeric Cash Drop settings only', () => {
  assert.deepEqual(cashDropFieldErrors({ [CASHDROP_RATE_KEY]: 0.12, [CASHDROP_AMOUNT_BB_KEY]: 5, other: 'x' }), {});
  assert.deepEqual(Object.keys(cashDropFieldErrors({ [CASHDROP_RATE_KEY]: 1.5, [CASHDROP_AMOUNT_BB_KEY]: 2.5 })).sort(),
    [CASHDROP_AMOUNT_BB_KEY, CASHDROP_RATE_KEY]);
  assert.ok(cashDropFieldErrors({ [CASHDROP_RATE_KEY]: '' })[CASHDROP_RATE_KEY]);
});

// ---- Group View stake rows (P0 slice F2) ----
const gt = (id, over = {}) => ({
  id, name: id, game: 'holdem', category: 'Low', sb: 50, bb: 100, ante: 0, min_buyin: 4000, max_buyin: 10000,
  seats: 6, speed: 'Normal', featured: false, players: 0, wait: 0, avgPot: 0, vpip: 0, handsPerHour: 0, running: true, ...over,
});

test('groupTables folds tables by game + sb + bb + seats and sums players and wait', () => {
  const groups = groupTables([
    gt('a', { players: 2, wait: 0 }), gt('b', { players: 6, wait: 3 }), gt('c', { players: 4, wait: 1 }),
    gt('d', { seats: 9, players: 5 }), gt('e', { game: 'omaha', players: 1 }),
  ]);
  const g = groups.find((x) => x.key === 'holdem:50/100:6');
  assert.equal(groups.length, 3, '6-max, 9-max and PLO at the same stakes are separate rows');
  assert.deepEqual(g.tables.map((t) => t.id), ['a', 'b', 'c']);
  assert.equal(g.players, 12);
  assert.equal(g.wait, 4);
  assert.deepEqual([g.game, g.sb, g.bb, g.seats], ['holdem', 50, 100, 6]);
});

test('groupTables key matches the group wait-list key', () => {
  const t = gt('a', { game: 'omaha', sb: 25, bb: 50, seats: 9 });
  assert.equal(tableGroupKey(t), 'omaha:25/50:9');
  assert.equal(tableGroupKey(t), groupKeyOf(t));
  assert.equal(groupTables([t])[0].key, 'omaha:25/50:9');
});

test('groupTables orders rows by stakes descending', () => {
  const groups = groupTables([
    gt('lo', { sb: 5, bb: 10 }), gt('hi', { sb: 500, bb: 1000 }), gt('mid', { sb: 50, bb: 100 }),
    gt('ante', { sb: 25, bb: 100 }), gt('hi9', { sb: 500, bb: 1000, seats: 9 }),
  ]);
  assert.deepEqual(groups.map((g) => g.tables[0].id), ['hi9', 'hi', 'mid', 'ante', 'lo']);
});

test('groupTables excludes private tables', () => {
  const groups = groupTables([gt('pub', { players: 2 }), gt('priv', { private: true, players: 5, wait: 2 }), gt('solo', { private: true, bb: 200 })]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].tables.map((t) => t.id), ['pub']);
  assert.equal(groups[0].players, 2);
  assert.equal(groups[0].wait, 0);
  assert.deepEqual(groupTables([gt('x', { private: true })]), []);
});

test('groupTables picks the first free seat, or Join Wait List for a full group', () => {
  const open = groupTables([gt('full', { players: 6 }), gt('free1', { players: 3 }), gt('free2', { players: 0 })])[0];
  assert.equal(open.action, 'join');
  assert.equal(open.firstFree.id, 'free1', 'first table in lobby order with a free seat');
  const full = groupTables([gt('f1', { players: 6, wait: 2 }), gt('f2', { players: 6 })])[0];
  assert.equal(full.action, 'joinWait');
  assert.equal(full.firstFree, null);
  assert.equal(full.wait, 2);
});

test('groupTables does not mutate its input and ignores junk wait values', () => {
  const input = Object.freeze([Object.freeze(gt('a', { wait: -1 })), Object.freeze(gt('b', { wait: Number.NaN }))]);
  const [g] = groupTables(input);
  assert.equal(g.wait, 0);
  assert.equal(input.length, 2);
});

/* ------------------------------ Rush pool lobby (P0 slice R3) ------------------------------ */

const pool = (over = {}) => ({
  poolKey: 'rush:500/1000', groupKey: 'rush:500/1000:6', game: 'rush', category: 'Platinum', sb: 500, bb: 1000, seats: 6,
  min_buyin: 20000, max_buyin: 100000, featured: false, tables: 2, players: 9, pros: 0, handsPerHour: 0,
  firstFree: 'rp-2', wait: 0, ...over,
});
const rushTable = (over = {}) => ({
  id: 'rp-1', name: 'Rush & Cash Platinum 01', game: 'rush', category: 'Platinum', sb: 500, bb: 1000, ante: 0,
  min_buyin: 20000, max_buyin: 100000, seats: 6, speed: 'Fast', featured: false, players: 6, wait: 0,
  avgPot: 0, vpip: 0, handsPerHour: 60, running: false, ...over,
});

test('rush pools: sorted by stakes descending, Hold\'em before PLO, input untouched', () => {
  const input = Object.freeze([
    pool({ poolKey: 'rush:50/100', sb: 50, bb: 100 }),
    pool({ poolKey: 'rushplo:500/1000', game: 'rushplo' }),
    pool(),
    pool({ poolKey: 'rush:1000/2000', sb: 1000, bb: 2000 }),
  ]);
  assert.deepEqual(sortPools(input).map((p) => p.poolKey), ['rush:1000/2000', 'rush:500/1000', 'rushplo:500/1000', 'rush:50/100']);
  assert.equal(input[0].poolKey, 'rush:50/100');
  assert.equal(poolVariant({ game: 'rushplo' }), 'plo');
  assert.equal(poolVariant({ game: 'rush' }), 'holdem');
});

test('rush pools: a pool shows when any of its tables survives the filters', () => {
  const pools = [pool(), pool({ poolKey: 'rushplo:500/1000', game: 'rushplo' }), pool({ poolKey: 'rush:50/100', sb: 50, bb: 100 })];
  const visible = [rushTable({ game: 'rushplo', name: 'Rush & Cash PLO Platinum 01' }), rushTable({ sb: 50, bb: 100 })];
  assert.deepEqual(visiblePools(pools, visible).map((p) => p.poolKey), ['rushplo:500/1000', 'rush:50/100']);
  assert.deepEqual(visiblePools(pools, []), []);
});

test('rush pools: Join uses the server firstFree table; a full pool joins the group wait list', () => {
  const tables = [rushTable(), rushTable({ id: 'rp-2', players: 3 }), rushTable({ id: 'other', bb: 200, sb: 100 }), rushTable({ id: 'priv', private: true })];
  assert.deepEqual(poolTables(pool(), tables).map((t) => t.id), ['rp-1', 'rp-2']);
  const open = poolAsGroup(pool(), tables);
  assert.equal(open.key, 'rush:500/1000:6');
  assert.equal(open.action, 'join');
  assert.equal(open.firstFree?.id, 'rp-2');
  assert.equal(open.players, 9);
  const full = poolAsGroup(pool({ firstFree: null, wait: 3 }), tables);
  assert.equal(full.action, 'joinWait');
  assert.equal(full.firstFree, null);
  assert.equal(full.wait, 3);
});

test('rush pools: players, chips and flag formatting', () => {
  assert.equal(playersLabel(1), '1 player');
  assert.equal(playersLabel(1234), '1,234 players');
  assert.equal(playersLabel(-2), '0 players');
  assert.equal(chipsWonLabel(1234567), '12,345');
  assert.equal(chipsWonLabel(-5), '0');
  assert.equal(countryFlag('ro'), '🇷🇴');
  assert.equal(countryFlag('GB'), '🇬🇧');
  assert.equal(countryFlag(''), '🏳️');
  assert.equal(countryFlag('ROU'), '🏳️');
});

test('rush leaderboard rows: rank, flag, nick, chips won, and the viewer marked', () => {
  const rows = leaderboardRows([
    { rank: 1, userId: 7, nick: 'Ana', country: 'RO', won: 900000 },
    { rank: 2, userId: 9, nick: 'Ben', country: '', won: 3000 },
  ], 9);
  assert.deepEqual(rows, [
    { key: '1-7', rank: 1, flag: '🇷🇴', nick: 'Ana', chips: '9,000', isMe: false },
    { key: '2-9', rank: 2, flag: '🏳️', nick: 'Ben', chips: '30', isMe: true },
  ]);
  assert.deepEqual(leaderboardRows(undefined), []);
});

import { LEADER_METRICS, metricInfo, formatMetricValue, metricValueLabel } from '../src/lib/leaderboard.ts';

test('leaderboard metrics: tab order, labels, VIP fallback for unknown metrics', () => {
  assert.deepEqual(LEADER_METRICS.map((m) => [m.key, m.tab, m.column]), [
    ['vip', 'VIP points', 'VIP points'], ['elo', 'Elo', 'Elo'], ['xp', 'XP', 'XP'],
  ]);
  assert.match(metricInfo('elo').subtitle, /Elo/);
  assert.equal(metricInfo('chips').key, 'vip');
  assert.ok(Object.isFrozen(LEADER_METRICS));
});

test('leaderboard metrics: values formatted with separators and unit', () => {
  assert.equal(formatMetricValue(1234567), '1,234,567');
  assert.equal(formatMetricValue(12.9), '12');
  assert.equal(formatMetricValue(undefined), '0');
  assert.equal(formatMetricValue(Number.NaN), '0');
  assert.equal(metricValueLabel('vip', 12500), '12,500 pts');
  assert.equal(metricValueLabel('elo', 1240), '1,240 Elo');
  assert.equal(metricValueLabel('xp', 900), '900 XP');
});

// ---- C4 dealer log (DanGG extra) ----

test('dealer frames parse as dealer lines with the Dealer nick', () => {
  const line = chatLineFrom({ id: 9, kind: 'dealer', nick: 'spoof', userId: 4, message: 'Hand #3 started', at: 5 });
  assert.equal(line.kind, 'dealer');
  assert.equal(line.nick, DEALER_NICK);
  assert.equal(line.userId, 0);
  assert.equal(line.text, 'Hand #3 started');
  assert.equal(isDealerLine(line), true);
  assert.equal(chatLineFrom({ id: 1, nick: 'Bo', userId: 7, message: 'hi' }).kind, 'chat', 'no kind stays chat');
});

test('chat view hides dealer lines; dealer view shows only them', () => {
  const lines = [chatLine(1), chatLine(2, { kind: 'dealer', userId: 0, nick: 'Dealer' }), chatLine(3, { kind: 'reaction' })];
  assert.deepEqual(linesForView(lines, 'chat').map((l) => l.id), ['c:1', 'c:3']);
  assert.deepEqual(linesForView(lines, 'dealer').map((l) => l.id), ['c:2']);
  assert.equal(lines.length, 3, 'filtering does not mutate');
});

test('dealer lines get the muted system style and no moderation role', () => {
  const dealer = chatLine(1, { kind: 'dealer', userId: 0 });
  assert.equal(chatLineClass(dealer), 'tchat-line tchat-dealer tchat-system');
  assert.equal(chatLineClass(chatLine(2), true), 'tchat-line tchat-chat active');
  assert.equal(senderRole(dealer, 0), 'system', 'never self, even for a zero id');
  assert.equal(senderRole(chatLine(3), 7), 'self');
});

test('dealer lines append but never raise the unread badge', () => {
  const s = chatReducer(INITIAL_CHAT, { type: 'append', line: chatLine(1, { kind: 'dealer', userId: 0 }) });
  assert.equal(s.lines.length, 1);
  assert.equal(s.unread, 0);
});

test('build labels expose the deploy time', () => {
  assert.equal(buildLabel('20261112121130'), '2026-11-12 12:11:30');
  assert.equal(buildLabel('202611121211'), '2026-11-12 12:11');
  assert.equal(buildLabel('dev'), 'dev');
});

test('the chip shuffle scrubs with the wheel inside its frame range', () => {
  assert.equal(shuffleScrubFrame(37, 1), 43);
  assert.equal(shuffleScrubFrame(37, -1), 37);
  assert.equal(shuffleScrubFrame(245, 1), 245);
  assert.equal(shuffleScrubFrame(143, 1), 149);
  assert.equal(shuffleScrubFrame(60, 0), 60);
});
