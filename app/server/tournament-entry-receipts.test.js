import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('each tournament registration refunds its own paid price once', async () => {
  const dir = mkdtempSync(join(tmpdir(),'tourney-entry-'));
  process.env.GGPOKER_DATA = dir;
  const { db, registerTournamentEntry, refundTournamentEntry, recordTournamentPrize, awardSatelliteTicket } = await import('./db.js');
  try {
    const u = db.prepare('SELECT id,balance FROM users WHERE balance>=200 LIMIT 1').get();
    const t = { ...db.prepare('SELECT * FROM tournaments LIMIT 1').get(), buyin: 175, fee: 25 };
    const balance = () => db.prepare('SELECT balance FROM users WHERE id=?').get(u.id).balance;
    for (const entry of ['first', 'second']) {
      registerTournamentEntry(u.id,t,entry);
      assert.equal(balance(),u.balance-200);
      refundTournamentEntry(u.id,{...t,buyin:900});
      assert.equal(balance(),u.balance);
      assert.throws(() => recordTournamentPrize(u.id,t.id,'tourney_win',350,'Winner'), /was refunded/);
      assert.throws(() => refundTournamentEntry(u.id,t), /receipt unavailable/);
    }
    assert.throws(() => registerTournamentEntry(u.id,{...t,buyin:u.balance+1},'unfunded'), /Insufficient balance/);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM tourney_regs WHERE tournament_id=? AND user_id=?').get(t.id,u.id).n,0);
    registerTournamentEntry(u.id,t,'forfeited');
    db.prepare('DELETE FROM tourney_regs WHERE tournament_id=? AND user_id=?').run(t.id,u.id);
    registerTournamentEntry(u.id,t,'final');
    db.prepare('DELETE FROM tourney_regs WHERE tournament_id=? AND user_id=?').run(t.id,u.id);
    for (let i=0;i<2;i++) recordTournamentPrize(u.id,t.id,'tourney_win',350,'Winner');
    assert.throws(() => recordTournamentPrize(u.id,t.id,'tourney_win',400,'Winner'), /Conflicting tournament award/);
    assert.equal(balance(),u.balance-50);
    const prize = db.prepare("SELECT session_id,amount FROM transactions WHERE reference='prize:final'").get();
    assert.equal(prize.session_id,'final');
    assert.equal(prize.amount,350);
    for (const ref of ['bounty:event:table:1:a','bounty:event:table:2:b']) {
      assert.equal(recordTournamentPrize(u.id,t.id,'bounty',50,'Knockout',ref), true);
      assert.equal(recordTournamentPrize(u.id,t.id,'bounty',50,'Knockout',ref), false);
      assert.throws(() => recordTournamentPrize(u.id,t.id,'bounty',80,'Knockout',ref), /Conflicting tournament award/);
    }
    assert.equal(db.prepare("SELECT COUNT(*) n FROM transactions WHERE session_id='final' AND kind='bounty'").get().n,2);
    assert.equal(balance(),u.balance+50);
    const winner = db.prepare('SELECT id,balance,tickets FROM users WHERE id<>? AND balance>=200 LIMIT 1').get(u.id);
    registerTournamentEntry(winner.id,t,'satellite-final');
    for (let i=0;i<2;i++) awardSatelliteTicket(winner.id,t.id,'Satellite ticket');
    const totals = db.prepare('SELECT balance,tickets FROM users WHERE id=?').get(winner.id);
    assert.equal(totals.balance,winner.balance-200);
    assert.equal(totals.tickets,winner.tickets+1);
    const receipts = db.prepare("SELECT currency,amount FROM transactions WHERE user_id=? AND session_id='satellite-final' ORDER BY id").all(winner.id);
    assert.deepEqual(receipts.map(r => [r.currency,r.amount]), [['USD',-200],['USD',0],['TICKET',1]]);
  } finally { db.close(); rmSync(dir,{ recursive:true,force:true }); }
});
