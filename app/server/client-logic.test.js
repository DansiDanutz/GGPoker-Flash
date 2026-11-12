// The table UI's pure logic lives in TypeScript; Node strips the types so it can be tested here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { betLimits, potFractionTarget, sizingPresets, potOdds } from '../src/game/betting.ts';
import { betUnitOf, enterBetRequest, normalizeBettingOptions } from '../src/lib/tablePrefs.ts';
import { potChipLayout, shuffleFramePosition } from '../src/game/potChips.ts';
import { cardOrdinal, squeezeDragFrame, squeezeWheelFrame } from '../src/game/squeeze.ts';
import { showdownComplete, showdownPlan } from '../src/game/showdown.ts';
import { bestHand } from '../src/game/eval.ts';
import {
  WAITLIST_TABLE_CAP, waitlistActionFor, waitCount,
  offerSecondsLeft, formatCountdown, isOfferUrgent, offerProgress, chipCount, waitlistChipLabel,
  queuePositionLabel, groupKeyOf, queueName, applyQueueUpdate, groupActionFor,
} from '../src/lib/waitlist.ts';
import {
  TAB_GAMES, pillsFor, columnsFor, COLUMN_LABEL, variantOf, VARIANT_LABEL, tableSizeChip, promotionOf,
  DEFAULT_TAB_FILTERS, filtersForTab, withTabFilters, parseFilterPrefs, filterTables, sortTables,
  activeFilterCount, resetExtraFilters, SEARCH_MAX,
} from '../src/lib/lobbyFilters.ts';

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
