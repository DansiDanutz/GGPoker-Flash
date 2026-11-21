// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createOrganizerChips } from '../../server/organizer-chips.js';

const dir = process.env.LOBBY_BENCH_DIR;
assert.ok(dir && process.env.GGPOKER_DATA === join(dir, 'data'));
const ready = setInterval(() => {
  if (!existsSync(join(dir, 'go'))) return;
  clearInterval(ready);
  const db = new DatabaseSync(join(dir, 'data', 'ggpoker.db'));
  const chips = createOrganizerChips({ db });
  db.exec("INSERT INTO tables(id,name,game,category,sb,bb,min_buyin,max_buyin,owner_id,private,chip_economy) VALUES('t1','Benchmark','holdem','Silver',1,2,100,10000,1,1,1)");
  for (const userId of [1, 2]) {
    db.prepare('INSERT INTO organizer_chip_accounts VALUES(?,?,?)').run(1, 'wallet:' + userId, 10000);
    chips.openSeat({ organizerId: 1, userId, tableId: 't1', sessionId: 's' + userId, amount: 10000 });
  }
  const now = () => Number(process.hrtime.bigint()) / 1e6;
  const exec = db.exec.bind(db), intervals = [];
  let start, hand = 0;
  db.exec = sql => {
    const result = exec(sql);
    if (sql === 'BEGIN IMMEDIATE') start = now();
    if (sql === 'COMMIT') intervals.push([start, now()]);
    return result;
  };
  const timer = setInterval(() => {
    hand++;
    const players = [1, 2].map(userId => ({ userId, sessionId: 's' + userId, amount: userId === 1 ? 10000 - hand : 10000 }));
    assert.ok(chips.settleHand({ organizerId: 1, tableId: 't1', handId: 'h' + hand, players, rake: 1 }).applied);
    if (hand !== 200) return;
    clearInterval(timer);
    assert.deepEqual(chips.reconcileTable(1, 't1'), { escrow: 19800, held: 19800, reconciled: true });
    assert.equal(chips.supply(1).burned, 200);
    writeFileSync(join(dir, 'transactions.json'), JSON.stringify(intervals));
    db.close();
  }, 15);
}, 5);
