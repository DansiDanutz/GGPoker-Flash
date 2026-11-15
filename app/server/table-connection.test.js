// The table socket belongs to the signed-in account, not to one copy of its profile:
// refreshing the balance (Add Chips, a cashier update) must never leave the table.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const page = fs.readFileSync(path.join(import.meta.dirname, '..', 'src/pages/TablePage.tsx'), 'utf8');

test('the socket is keyed on the user id, so a profile refresh does not reconnect', () => {
  assert.match(page, /const userKey = user \? String\(user\.id\) : '';/);
  assert.match(page, /\}, \[tableId, userKey\]\);/, 'connect depends on the id only');
  assert.match(page, /\}, \[connect, tableId, userKey\]\);/, 'the join/leave effect depends on the id only');
  assert.doesNotMatch(page, /\}, \[connect, tableId, user\]\);/);
});

test('only the table host may switch straddles for the whole table', () => {
  const index = fs.readFileSync(path.join(import.meta.dirname, 'index.js'), 'utf8');
  assert.match(index, /Only the table host can change straddles/);
  assert.match(page, /\{isHost && <button[^\n]*straddle: !state\?\.straddle/);
});

test('the Wait for BB choice travels with every join, before the seat can be dealt in', () => {
  const index = fs.readFileSync(path.join(import.meta.dirname, 'index.js'), 'utf8');
  assert.match(index, /seatHuman\(table, u, buyin, held \? held\.seat : msg\.seat, msg\.waitForBlinds === true\)/);
  const joins = page.match(/type: 'join_table'[^\n]*/g) || [];
  assert.ok(joins.length >= 3);
  for (const j of joins) assert.match(j, /waitForBlinds: joinWaitRef\.current/, j);
});

test('while seated, the saved Auto-post choice follows the seat (switch, Post now or a server release)', () => {
  assert.match(page, /if \(!seatWait\.known\) return;\n\s*if \(seatWait\.wait !== joinWaitRef\.current\) changeJoinWait\(seatWait\.wait\);/);
  assert.match(page, /\}, \[seatWait\.known, seatWait\.wait\]\);/);
});

test('a reconnect never buys in again after the seat was cashed out (EGM round 3)', () => {
  const index = fs.readFileSync(path.join(import.meta.dirname, 'index.js'), 'utf8');
  assert.match(page, /type: 'join_table', tableId, buyin, observe, rejoin: everJoined\.current/);
  assert.match(index, /const rejoinedEmpty = msg\.rejoin === true && !table\.tournament && !table\.seatOf\(ws\.userId\);/);
  assert.match(index, /const watchOnly = msg\.observe \|\| rejoinedEmpty;/);
  assert.match(index, /if \(watchOnly\) \{/);
});

test('a tournament reconnect is never turned into watching: the redirect to the new table runs (EGM round 6)', () => {
  const index = fs.readFileSync(path.join(import.meta.dirname, 'index.js'), 'utf8');
  assert.match(index, /const rejoinedEmpty = msg\.rejoin === true && !table\.tournament && !table\.seatOf\(ws\.userId\);/);
  assert.match(index, /const watchOnly = msg\.observe \|\| rejoinedEmpty;/);
  const room = fs.readFileSync(path.join(import.meta.dirname, 'tournament-room.js'), 'utf8');
  assert.match(room, /away: player\.away,\s*awayChoice: player\.awayChoice,/, 'a moved seat keeps the sit-out choice it had');
});

test('a page reload after a cash-out does not buy in again (EGM round 7)', () => {
  const lib = fs.readFileSync(path.join(import.meta.dirname, '..', 'src/lib/seatSession.ts'), 'utf8');
  assert.match(lib, /sessionStorage/, 'per-tab: survives a reload, not a new tab');
  assert.match(page, /rejoin: everJoined\.current \|\| wasSeatedHere\(tableId\),/);
  assert.match(page, /if \(!msg\.observe\) markSeatedHere\(tableId\);/);
  assert.match(page, /clearSeatedHere\(tableId\);/);
  const room = fs.readFileSync(path.join(import.meta.dirname, 'tournament-room.js'), 'utf8');
  assert.match(room, /sitOutNextHand: player\.sitOutNextHand,/, 'a move mid-drop still sits the player out');
});
