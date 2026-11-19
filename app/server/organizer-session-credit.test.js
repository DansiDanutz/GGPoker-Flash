import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createOrganizerChips } from './organizer-chips.js';
import { createOrganizerFunding } from './organizer-funding.js';
import { createOrganizerSessionCredit } from './organizer-session-credit.js';

const LINK='11111111-1111-4111-8111-111111111111';
function fixture(amount=10000,feeCents=2500){
 const db=new DatabaseSync(':memory:'); db.exec(`
 CREATE TABLE users(id INTEGER PRIMARY KEY,nick TEXT,banned INTEGER DEFAULT 0,deleted_at TEXT); INSERT INTO users VALUES(1,'Owner',0,NULL),(2,'Player',0,NULL),(3,'Other',0,NULL);
 CREATE TABLE organizer_billing_memberships(user_id INTEGER,role TEXT,active INTEGER,expires_at TEXT,PRIMARY KEY(user_id,role)); INSERT INTO organizer_billing_memberships VALUES(1,'organizer',1,'2099-01-01T00:00:00Z');
 CREATE TABLE organizer_club_members(organizer_id INTEGER,user_id INTEGER,status TEXT,message TEXT,created_at TEXT,updated_at TEXT,PRIMARY KEY(organizer_id,user_id)); INSERT INTO organizer_club_members VALUES(1,2,'approved','','','');
 CREATE TABLE tables(id TEXT PRIMARY KEY,owner_id INTEGER,private INTEGER,chip_economy INTEGER); INSERT INTO tables VALUES('t1',1,1,1);`);
 const now=()=>Date.parse('2026-01-01T00:00:00Z'),chips=createOrganizerChips({db,now}); db.prepare('INSERT INTO organizer_chip_accounts VALUES(?,?,?)').run(1,'wallet:1',100000);
 const funding=createOrganizerFunding({db,chips,now}),request=funding.create({userId:2,organizerId:1,amount,key:`r-${amount}`}),credit=createOrganizerSessionCredit({db,chips,funding,now});
 const proposal=credit.propose({userId:1,fundingRequestId:request.id,feeCents}); return {db,chips,funding,credit,request,proposal};
}
test('proposal, decline, acceptance and central locks are strict and replay-safe',()=>{
 const f=fixture(); assert.throws(()=>f.credit.propose({userId:3,fundingRequestId:f.request.id,feeCents:2500}),e=>e.code==='session_credit_not_found');
 assert.throws(()=>f.credit.accept({userId:3,id:f.proposal.id}),e=>e.code==='session_credit_not_found');
 const accepted=f.credit.accept({userId:2,id:f.proposal.id}); assert.equal(accepted.state,'active'); assert.deepEqual(f.credit.accept({userId:2,id:f.proposal.id}),accepted);
 assert.equal(f.chips.balance(1,1),90000); assert.equal(f.chips.balance(1,2),10000);
 assert.throws(()=>f.chips.transfer({organizerId:1,fromUserId:2,toUserId:3,amount:1,idempotencyKey:'out'}),e=>e.code==='session_credit_locked');
 assert.throws(()=>f.chips.transfer({organizerId:1,fromUserId:1,toUserId:2,amount:1,idempotencyKey:'in'}),e=>e.code==='session_credit_locked');
 const d=fixture(); assert.equal(d.credit.decline({userId:1,id:d.proposal.id}).state,'declined'); assert.equal(d.chips.balance(1,1),100000);
});
test('accept requires requested source, empty wallet and no open seats',()=>{
 const f=fixture(); f.db.prepare('INSERT INTO organizer_chip_accounts VALUES(?,?,?)').run(1,'wallet:2',1); assert.throws(()=>f.credit.accept({userId:2,id:f.proposal.id}),e=>e.code==='session_credit_mixed');
 const s=fixture(); s.db.prepare("INSERT INTO organizer_chip_sessions VALUES(1,'open',2,'t1',0,'open','2026-01-01',NULL)").run(); assert.throws(()=>s.credit.accept({userId:2,id:s.proposal.id}),e=>e.code==='session_credit_mixed');
 const spin=fixture(); spin.db.exec("CREATE TABLE organizer_chip_spin_tickets(id TEXT,organizer_id INTEGER,holder_id INTEGER,state TEXT); INSERT INTO organizer_chip_spin_tickets VALUES('spin-ticket',1,2,'issued')"); assert.throws(()=>spin.credit.accept({userId:2,id:spin.proposal.id}),e=>e.code==='session_credit_mixed');
 const changed=fixture(); changed.db.prepare("UPDATE organizer_funding_requests SET state='rejected' WHERE id=?").run(changed.request.id); assert.throws(()=>changed.credit.accept({userId:2,id:changed.proposal.id}),e=>e.code==='funding_state');
});
test('partial loss reclaims unused chips and payment settles debt only',()=>{
 const f=fixture(); f.credit.accept({userId:2,id:f.proposal.id}); f.db.prepare("UPDATE organizer_chip_accounts SET balance=7000 WHERE organizer_id=1 AND account_key='wallet:2'").run(); f.db.prepare("INSERT INTO organizer_chip_accounts VALUES(1,'burn',3000)").run();
 const done=f.credit.finish({userId:2,id:f.proposal.id}); assert.deepEqual([done.state,done.returnedChips,done.usedChips,done.dueCents],['awaiting_payment',7000,3000,750]); assert.equal(f.chips.balance(1,1),97000);
 f.credit.attachLink({userId:1,id:done.id,paymentLinkId:LINK}); const payment={id:'22222222-2222-4222-8222-222222222222',status:'paid',test:false,customerReference:done.reference,paymentLinkId:LINK,network:'polygon',currencyToken:'USDC',amountBaseUnits:'7500000',amountReceivedBaseUnits:'7500000',transactionId:'0xsession',paidAt:'2026-01-02',recipientWallet:'0xmerchant'};
 assert.equal(f.credit.settle({userId:2,id:done.id,payment}).state,'paid'); assert.equal(f.credit.settle({userId:1,id:done.id,payment}).state,'paid'); assert.equal(f.chips.balance(1,2),0); assert.equal(f.db.prepare('SELECT SUM(balance) total FROM organizer_chip_accounts WHERE organizer_id=1').get().total,100000);
});
test('no loss pays immediately, full loss owes full price, and winnings remain',()=>{
 const n=fixture(); n.credit.accept({userId:2,id:n.proposal.id}); assert.equal(n.credit.finish({userId:1,id:n.proposal.id}).state,'paid'); assert.equal(n.chips.balance(1,1),100000);
 const full=fixture(); full.credit.accept({userId:2,id:full.proposal.id}); full.db.prepare("UPDATE organizer_chip_accounts SET balance=0 WHERE organizer_id=1 AND account_key='wallet:2'").run(); full.db.prepare("INSERT INTO organizer_chip_accounts VALUES(1,'burn',10000)").run(); assert.equal(full.credit.finish({userId:2,id:full.proposal.id}).dueCents,2500);
 const w=fixture(); w.credit.accept({userId:2,id:w.proposal.id}); w.db.prepare("UPDATE organizer_chip_accounts SET balance=12000 WHERE organizer_id=1 AND account_key='wallet:2'").run(); w.db.prepare("UPDATE organizer_chip_accounts SET balance=88000 WHERE organizer_id=1 AND account_key='wallet:1'").run(); const won=w.credit.finish({userId:2,id:w.proposal.id}); assert.equal(won.returnedChips,10000); assert.equal(won.dueCents,0); assert.equal(w.chips.balance(1,2),2000);
});
test('terms, participant access, open seats and payment evidence remain strict',()=>{
 const f=fixture(); assert.deepEqual(f.credit.propose({userId:1,fundingRequestId:f.request.id,feeCents:2500}),f.proposal);
 assert.throws(()=>f.credit.propose({userId:1,fundingRequestId:f.request.id,feeCents:2501}),e=>e.code==='terms_conflict');
 assert.equal(f.credit.get(1,f.proposal.id).id,f.proposal.id); assert.equal(f.credit.list(2).length,1); assert.throws(()=>f.credit.get(3,f.proposal.id),e=>e.code==='session_credit_not_found');
 f.credit.accept({userId:2,id:f.proposal.id}); f.chips.openSeat({organizerId:1,userId:2,tableId:'t1',sessionId:'loan-seat',amount:1000});
 assert.throws(()=>f.credit.finish({userId:1,id:f.proposal.id}),e=>e.code==='session_credit_seat_open'); f.chips.closeSeat({organizerId:1,userId:2,tableId:'t1',sessionId:'loan-seat'});
 f.db.prepare("UPDATE organizer_chip_accounts SET balance=5000 WHERE organizer_id=1 AND account_key='wallet:2'").run(); f.db.prepare("INSERT INTO organizer_chip_accounts VALUES(1,'burn',5000)").run(); const done=f.credit.finish({userId:1,id:f.proposal.id});
 f.credit.attachLink({userId:2,id:done.id,paymentLinkId:LINK});
 assert.throws(()=>f.credit.attachLink({userId:1,id:done.id,paymentLinkId:'33333333-3333-4333-8333-333333333333'}),e=>e.code==='terms_conflict');
 const payment={id:'44444444-4444-4444-8444-444444444444',status:'paid',test:false,customerReference:'wrong',paymentLinkId:LINK,network:'polygon',currencyToken:'USDC',amountBaseUnits:'12500000',amountReceivedBaseUnits:'12500000',transactionId:'0xwrong',paidAt:'2026-01-02',recipientWallet:'0xmerchant'};
 assert.throws(()=>f.credit.settle({userId:2,id:done.id,payment}),e=>e.code==='club_entry_payment_unverified');
});

test('active session credit blocks paid offers before reserving funds',()=>{
 const f=fixture();f.credit.accept({userId:2,id:f.proposal.id});
 const r=f.funding.create({userId:2,organizerId:1,amount:5000,key:'locked-offer'});
 assert.throws(()=>f.funding.offer({userId:1,id:r.id,feeCents:100}),e=>e.code==='session_credit_locked');
 assert.equal(f.chips.balance(1,1),90000);
 assert.equal(f.funding.get(1,r.id).state,'requested');
});
