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
