import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { collectPaidLoopEvidence } from '../../tools/collect-paid-loop-evidence.mjs';

test('paid-loop evidence handles SQLite timestamps and cannot borrow another table’s charges or seats', () => {
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE tables(id TEXT,name TEXT,sb INT,bb INT,min_buyin INT,max_buyin INT,seats INT,rake_percent INT,rake_cap INT,chip_economy INT,private INT,owner_id INT);
      INSERT INTO tables VALUES('a','A',1,2,10,100,6,5,300,1,1,1),('b','B',1,2,10,100,6,5,300,1,1,1);
      CREATE TABLE hands(table_id TEXT,result TEXT,created_at TEXT);
      INSERT INTO hands VALUES('a','{"pot":100,"rake":5}','2026-11-17 11:00:00'),('a','{"pot":200,"rake":10}','2026-11-17T09:59:59.999Z'),('b','{"pot":100,"rake":5}','2026-11-17T11:00:00.000Z');
      CREATE TABLE organizer_billing_ledger(user_id INT,resource_id TEXT,kind TEXT,amount_cents INT,reference TEXT,created_at TEXT);
      INSERT INTO organizer_billing_ledger VALUES(1,'b','setup',-1000,'setup-b','2026-11-17T11:00:00.000Z'),(1,'b','cash_hour',-500,'hour-b','2026-11-17T11:00:00.000Z');
      CREATE TABLE organizer_cash_sessions(table_id TEXT,active INT,paid_until TEXT,next_charge_at TEXT,started_at TEXT);
      CREATE TABLE organizer_chip_journals(organizer_id INT,kind TEXT,amount INT,from_account TEXT,to_account TEXT,created_at TEXT);
      INSERT INTO organizer_chip_journals VALUES(1,'seat_open',100,'wallet:2','table:b','2026-11-17T11:00:00.000Z');
      CREATE TABLE organizer_chip_accounts(organizer_id INT,account_key TEXT,balance INT);
      INSERT INTO organizer_chip_accounts VALUES(1,'wallet:1',100000);
      CREATE TABLE organizer_billing_accounts(user_id INT,balance_cents INT);
      INSERT INTO organizer_billing_accounts VALUES(1,900);
    `);
    const options={hours:2,now:new Date('2026-11-17T12:00:00.000Z')};
    const report=collectPaidLoopEvidence(db,options);
    const a=report.tables.find(t=>t.id==='a'), b=report.tables.find(t=>t.id==='b');
    assert.equal(a.hands.count,1);
    assert.equal(a.hands.total_rake,5);
    assert.deepEqual(a.checks.filter(c=>!c.ok).map(c=>c.id),['setup_charge','hourly_charge','seat_open']);
    assert.equal(a.billing.rows,0);
    assert.equal(a.chip_journals.rows,0);
    assert.ok(b.checks.every(c=>c.ok));
    assert.equal(report.verdict,'incomplete');
    db.exec(`INSERT INTO organizer_billing_ledger VALUES(1,'a','setup',-1000,'setup-a','2026-11-17 11:00:00'),(1,'a','cash_hour',-500,'hour-a','2026-11-17 11:00:00');
      INSERT INTO organizer_chip_journals VALUES(1,'seat_open',100,'wallet:2','table:a','2026-11-17 11:00:00');`);
    const fixed=collectPaidLoopEvidence(db,{...options,tableFilter:'a'});
    assert.equal(fixed.verdict,'proven');
    assert.equal(fixed.tables[0].billing.total_debits_cents,-1500);
    assert.equal(fixed.tables[0].chip_journals.rows,1);
    assert.equal(db.prepare('SELECT balance FROM organizer_chip_accounts').get().balance,100000);
  } finally { db.close(); }
});
