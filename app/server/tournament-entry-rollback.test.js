import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('registration and refund roll back if the final entrant count update fails', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'entry-rollback-'));
  process.env.GGPOKER_DATA = dir;
  const { db, registerTournamentEntry, refundTournamentEntry } = await import('./db.js');
  try {
    const { id } = db.prepare('SELECT id FROM users WHERE balance >= 200 LIMIT 1').get();
    const event = { ...db.prepare('SELECT * FROM tournaments LIMIT 1').get(), buyin: 175, fee: 25 };
    const snapshot = () => ({
      balance: db.prepare('SELECT balance FROM users WHERE id=?').get(id).balance,
      entrants: db.prepare('SELECT entrants FROM tournaments WHERE id=?').get(event.id).entrants,
      registrations: db.prepare('SELECT entry_id FROM tourney_regs WHERE user_id=? AND tournament_id=?').all(id,event.id),
      ledger: db.prepare('SELECT id,amount,reference FROM transactions WHERE user_id=? ORDER BY id').all(id),
    });
    const initial = snapshot();
    for (const change of [() => registerTournamentEntry(id,event,'fixture'), () => refundTournamentEntry(id,event)]) {
      const before = snapshot();
      db.exec("CREATE TEMP TRIGGER fixture_failure BEFORE UPDATE OF entrants ON tournaments BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
      assert.throws(change, /fixture failure/);
      assert.deepEqual(snapshot(), before);
      db.exec('DROP TRIGGER fixture_failure');
      change();
    }
    const final = snapshot();
    assert.equal(final.balance, initial.balance);
    assert.equal(final.entrants, initial.entrants);
    assert.deepEqual(final.registrations, initial.registrations);
    assert.deepEqual(final.ledger.slice(initial.ledger.length).map(row => row.amount), [-200,200]);
  } finally { db.close(); rmSync(dir, {recursive:true,force:true}); }
});
