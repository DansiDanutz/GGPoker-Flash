import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createOrganizerBilling } from './organizer-billing.js';
import { createOrganizerChips } from './organizer-chips.js';
import { PokerTable } from './table.js';

test('disposable cash hand settles after credit expiry and blocks the next deal', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,banned INTEGER DEFAULT 0,deleted_at TEXT,is_admin INTEGER DEFAULT 0);
      INSERT INTO users VALUES(1,0,NULL,1),(2,0,NULL,0),(3,0,NULL,0);
      CREATE TABLE audit_log(actor TEXT,action TEXT,detail TEXT);
      CREATE TABLE tables(id TEXT PRIMARY KEY,owner_id INTEGER,private INTEGER,chip_economy INTEGER);
      INSERT INTO tables VALUES('expiry',2,1,1)`);
    let now = Date.parse('2026-01-01T00:00:00Z');
    const billing = createOrganizerBilling({ db, mode: 'enforce', now: () => now });
    db.prepare('INSERT INTO organizer_billing_memberships VALUES(?,?,1,?)').run(2,'organizer','2027-01-01T00:00:00Z');
    const chips = createOrganizerChips({ db, now: () => now });
    db.exec('BEGIN');chips.grantMembership({organizerId:2,reference:'fixture'});db.exec('COMMIT');
    billing.credit({userId:2,amountCents:500,reference:'fixture',actor:1});
    billing.startCash({userId:2,tableId:'expiry',idempotencyKey:'start'});
    chips.transfer({organizerId:2,fromUserId:2,toUserId:3,amount:5000,idempotencyKey:'fund'});
    for(const id of [2,3]) chips.openSeat({organizerId:2,userId:id,tableId:'expiry',sessionId:'s'+id,amount:5000});
    let settlement;
    const t = new PokerTable({id:'expiry',game:'holdem',seats:2,sb:50,bb:100,min_buyin:5000,max_buyin:5000,rakePercent:5,rakeCap:300,private:true,chip_economy:1}, {
      canStartHand: () => billing.canDeal('expiry'),
      beforeSettlement: (table, summary) => {
        settlement={organizerId:2,tableId:'expiry',handId:table.handId,players:table.humans().map(p=>({userId:p.id,sessionId:'s'+p.id,amount:p.stack})),rake:summary.rake};
        chips.settleHand(settlement);
      },
    });
    t.nextHandAt=Date.now()+1e9;
    for(const id of [2,3]) {t.sit({id,nick:'Fixture '+id},id-2,5000);t.setRunItAsk(id,false);}
    t.nextHandAt=0;t.startHand();assert.equal(t.street,'preflop');const hand=t.handId;
    now+=3600000;billing.tickCash();assert.equal(billing.cashSession(2,'expiry').active,0);
    for(let i=0;t.street!=='ended'&&i<20;i++) {const p=t.seatOf(t.actor).player;assert.equal(t.act(p.id,t.currentBet>p.bet?'call':'check').ok,true);}
    assert.equal(t.street,'ended');assert.equal(settlement.rake,10);
    assert.equal(settlement.players.reduce((n,p)=>n+p.amount,0),9990);
    assert.equal(chips.settleHand(settlement).applied,false);
    for(let i=0;i<3;i++){t.startHand();billing.tickCash();assert.equal(t.handId,hand);assert.throws(()=>billing.startCash({userId:2,tableId:'expiry',idempotencyKey:'unfunded'}),e=>e.code==='insufficient_credit');}
    assert.equal(billing.history(2).filter(x=>x.kind==='cash_hour').length,1);
    assert.equal(billing.account(2).balance_cents,0);
    assert.equal(chips.reconcileTable(2,'expiry').reconciled,true);
    for(const id of [2,3]) chips.closeSeat({organizerId:2,userId:id,tableId:'expiry',sessionId:'s'+id});
    assert.deepEqual(chips.supply(2),{minted:100000,burned:10,circulating:99990});
  } finally {db.close();}
});

for (const stacks of [[5000,5000], [1000,2000,3000,3000]]) test(`disposable all-in expiry reconciles ${stacks.length} players and blocks next deal`, () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,banned INTEGER DEFAULT 0,deleted_at TEXT,is_admin INTEGER DEFAULT 0);
      INSERT INTO users VALUES(1,0,NULL,1),(2,0,NULL,0),(3,0,NULL,0),(4,0,NULL,0),(5,0,NULL,0);
      CREATE TABLE audit_log(actor TEXT,action TEXT,detail TEXT);
      CREATE TABLE tables(id TEXT PRIMARY KEY,owner_id INTEGER,private INTEGER,chip_economy INTEGER);
      INSERT INTO tables VALUES('expiry',2,1,1)`);
    let now = Date.parse('2026-01-01T00:00:00Z');
    const billing = createOrganizerBilling({ db, mode: 'enforce', now: () => now });
    db.prepare('INSERT INTO organizer_billing_memberships VALUES(?,?,1,?)').run(2,'organizer','2027-01-01T00:00:00Z');
    const chips = createOrganizerChips({ db, now: () => now });
    db.exec('BEGIN');chips.grantMembership({organizerId:2,reference:'fixture'});db.exec('COMMIT');
    billing.credit({userId:2,amountCents:500,reference:'fixture',actor:1});
    billing.startCash({userId:2,tableId:'expiry',idempotencyKey:'start'});
    for (let i=0;i<stacks.length;i++) { const id=i+2; if(id!==2) chips.transfer({organizerId:2,fromUserId:2,toUserId:id,amount:stacks[i],idempotencyKey:'fund'+id}); chips.openSeat({organizerId:2,userId:id,tableId:'expiry',sessionId:'s'+id,amount:stacks[i]}); }
    let settlement;
    const t = new PokerTable({id:'expiry',game:'holdem',seats:stacks.length,sb:50,bb:100,min_buyin:5000,max_buyin:5000,rakePercent:5,rakeCap:300,private:true,chip_economy:1}, {
      canStartHand: () => billing.canDeal('expiry'),
      beforeSettlement: (table, summary) => {
        settlement={organizerId:2,tableId:'expiry',handId:table.handId,players:table.humans().map(p=>({userId:p.id,sessionId:'s'+p.id,amount:p.stack})),rake:summary.rake};
        chips.settleHand(settlement);
      },
    });
    t.nextHandAt=Date.now()+1e9;
    for(let i=0;i<stacks.length;i++) {const id=i+2;t.sit({id,nick:'Fixture '+id},i,stacks[i]);t.setRunItAsk(id,false);}
    t.nextHandAt=0;t.startHand();assert.equal(t.street,'preflop');const hand=t.handId;
    const C=s=>({r:s[0],s:s[1],v:'23456789TJQKA'.indexOf(s[0])+2});
    const holes=[['Ah','Ad'],['Kh','Kd'],['Qh','Qd'],['Jh','Jd']];
    t.seats.forEach((seat,i)=>{seat.player.cards=holes[i].map(C);});
    t.deck=['9s','7c','4d','3c','2s'].reverse().map(C);
    now+=3600000;billing.tickCash();assert.equal(billing.cashSession(2,'expiry').active,0);
    for(let i=0;t.street!=='ended'&&i<20;i++) {const p=t.seatOf(t.actor).player;assert.equal(t.act(p.id,'allin').ok,true);}
    assert.equal(t.street,'ended');const gross=stacks.reduce((n,x)=>n+x,0),rake=Math.min(300,gross*0.05);assert.equal(settlement.rake,rake);
    const expected=stacks.length===2?[9700,0]:[3700,3000,2000,0];
    assert.deepEqual(settlement.players.map(p=>p.amount),expected);
    assert.equal(t.result.winners.length,stacks.length===2?1:3);
    assert.equal(settlement.players.reduce((n,p)=>n+p.amount,0),gross-rake);
    assert.equal(chips.settleHand(settlement).applied,false);
    for(let i=0;i<3;i++){t.startHand();billing.tickCash();assert.equal(t.handId,hand);assert.throws(()=>billing.startCash({userId:2,tableId:'expiry',idempotencyKey:'unfunded'}),e=>e.code==='insufficient_credit');}
    assert.equal(billing.history(2).filter(x=>x.kind==='cash_hour').length,1);
    assert.equal(billing.account(2).balance_cents,0);
    assert.equal(chips.reconcileTable(2,'expiry').reconciled,true);
    for(const id of stacks.map((_,i)=>i+2)) chips.closeSeat({organizerId:2,userId:id,tableId:'expiry',sessionId:'s'+id});
    assert.deepEqual(chips.supply(2),{minted:100000,burned:rake,circulating:100000-rake});
  } finally {db.close();}
});
