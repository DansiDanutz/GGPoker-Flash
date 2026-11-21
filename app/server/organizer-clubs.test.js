import { verifyClubEntryPayment } from './club-entry-provider.js';
import { createClubEntryLedger } from './club-entry-ledger.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createOrganizerClubs } from './organizer-clubs.js';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY,login TEXT,nick TEXT,avatar TEXT,country TEXT,banned INTEGER DEFAULT 0,deleted_at TEXT,email TEXT);
    INSERT INTO users VALUES (1,'host','Host','a.png','RO',0,NULL,'private@host'),(2,'second','Second','','US',0,NULL,'private@second'),(3,'player','Player','','GB',0,NULL,'private@player'),(4,'guest_deadbeef-abc','Guest','','RO',0,NULL,'guest@private'),(5,'banned','Banned','','RO',1,NULL,'banned@private'),(6,'guest_normal','Legitimate','','CA',0,NULL,'legitimate@private');
    CREATE TABLE organizer_billing_memberships(user_id INTEGER,role TEXT,active INTEGER,expires_at TEXT,PRIMARY KEY(user_id,role));
    INSERT INTO organizer_billing_memberships VALUES (1,'organizer',1,'2026-03-01T00:00:00.000Z'),(2,'organizer',1,'2026-03-01T00:00:00.000Z'),(4,'organizer',1,'2026-03-01T00:00:00.000Z'),(5,'organizer',1,'2026-03-01T00:00:00.000Z'),(6,'organizer',1,'2026-03-01T00:00:00.000Z');
    CREATE TABLE tables(id TEXT PRIMARY KEY,owner_id INTEGER,private INTEGER,play_money INTEGER);
    INSERT INTO tables VALUES ('cash',1,1,0),('free',1,1,1),('public',1,0,0),('empty',2,1,0);
    CREATE TABLE hands(id INTEGER PRIMARY KEY,table_id TEXT,created_at TEXT);
    INSERT INTO hands VALUES (1,'cash','2026-01-20T00:00:00.000Z'),(2,'free','2026-01-20T00:00:00.000Z'),(3,'public','2026-01-20T00:00:00.000Z');
    CREATE TABLE tournaments(id TEXT PRIMARY KEY,owner_id INTEGER,private INTEGER,play_money INTEGER,start_at TEXT,entrants INTEGER,status TEXT);
    INSERT INTO tournaments VALUES ('paid',1,1,0,'2026-01-20T00:00:00.000Z',8,'completed'),('free',1,1,1,'2026-01-20T00:00:00.000Z',99,'completed'),('future',2,1,0,'2027-01-20T00:00:00.000Z',9999,'completed'),('registering',2,1,0,'2026-01-20T00:00:00.000Z',9999,'registering');
    CREATE TABLE organizer_chip_journals(id INTEGER PRIMARY KEY,organizer_id INTEGER,kind TEXT,amount INTEGER,created_at TEXT);
    INSERT INTO organizer_chip_journals VALUES (1,1,'rake',30,'2026-01-20T00:00:00.000Z'),(2,1,'transfer',9999,'2026-01-20T00:00:00.000Z');
  `);
  let time = Date.parse('2026-02-01T00:00:00.000Z');
  return { db, clubs: createOrganizerClubs({ db, now: () => time }), advance: (ms) => { time += ms; } };
}

test('directory is public-safe, ranked by commercial activity, and excludes empty-table inflation and inactive users', () => {
  const { clubs } = fixture(); const result = clubs.directory();
  assert.deepEqual(result.clubs.map((club) => club.ownerId), [1, 2, 6]);
  assert.equal(result.clubs[0].hands30d, 1); assert.equal(result.clubs[0].tournamentEntrants30d, 8); assert.equal(result.clubs[0].cashChipRake30d, 30);
  assert.equal(result.clubs[1].hands30d, 0); assert.ok(result.clubs[0].score > result.clubs[1].score);
  assert.equal(result.clubs[1].tournamentEntrants30d, 0);
  assert.ok(!JSON.stringify(result).includes('private@'));
  assert.equal(clubs.directory({ search: 'second' }).clubs[0].ownerId, 2);
});

test('profiles enforce ownership, safe bounds, and active membership expiry', () => {
  const f = fixture();
  assert.throws(() => f.clubs.updateProfile({ ownerId: 1, actorId: 2, name: 'No' }), (e) => e.code === 'owner_required');
  assert.throws(() => f.clubs.updateProfile({ ownerId: 1, actorId: 1, name: '<b>x</b>' }), /HTML/);
  const profile = f.clubs.updateProfile({ ownerId: 1, actorId: 1, name: 'Free Club', description: 'Friendly games', entryFeeCents: 0 });
  assert.equal(profile.entryFeeCents, 0); assert.equal(profile.name, 'Free Club');
  f.advance(31 * 86_400_000); assert.throws(() => f.clubs.profile(1, 3), (e) => e.code === 'organizer_inactive');
});

test('free joins are pending and idempotent, owners approve, leave removes, and rejected reapply has cooldown', () => {
  const f = fixture(); f.clubs.updateProfile({ ownerId: 1, actorId: 1, name: 'Free', entryFeeCents: 0 });
  assert.deepEqual(f.clubs.requestJoin({ organizerId: 1, userId: 3, message: 'Hi' }), { status: 'pending' });
  assert.deepEqual(f.clubs.requestJoin({ organizerId: 1, userId: 3, message: 'Changed' }), { status: 'pending' });
  assert.equal(f.clubs.members({ organizerId: 1, actorId: 1 })[0].message, 'Hi');
  assert.deepEqual(f.clubs.respond({ organizerId: 1, actorId: 1, userId: 3, decision: 'approve' }), { status: 'approved' });
  assert.equal(f.clubs.canEnter(1, 3), true); assert.deepEqual(f.clubs.leave({ organizerId: 1, userId: 3 }), { status: 'removed' }); assert.equal(f.clubs.canEnter(1, 3), false);
  f.clubs.requestJoin({ organizerId: 1, userId: 3 }); f.clubs.respond({ organizerId: 1, actorId: 1, userId: 3, decision: 'reject' });
  assert.throws(() => f.clubs.requestJoin({ organizerId: 1, userId: 3 }), (e) => e.code === 'join_cooldown');
});

test('paid clubs require settlement and cannot be manually approved', () => {
  const f = fixture();
  assert.throws(() => f.clubs.requestJoin({ organizerId: 1, userId: 3 }), (e) => e.code === 'payment_required');
  f.db.prepare("INSERT INTO organizer_club_members VALUES(1,3,'pending','',?,?)").run('2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
  assert.throws(() => f.clubs.respond({ organizerId: 1, actorId: 1, userId: 3, decision: 'approve' }), (e) => e.code === 'payment_required');
  assert.deepEqual(f.clubs.approvePaid({ organizerId: 1, userId: 3 }), { status: 'approved' });
  assert.deepEqual(f.clubs.approvePaid({ organizerId: 1, userId: 3 }), { status: 'approved' });
  assert.equal(f.clubs.canEnter(1, 3), true);
});

test('verified receipt unlocks the paying member only and applies the split once', () => {
  const { db, clubs } = fixture();
  const bonuses = [];
  const ledger = createClubEntryLedger({db,clubs,merchantId:'dedicated',publisherUserId:2,grantBonus: b => bonuses.push(b)});
  const order = ledger.create({organizerId:1,userId:3,quotedFeeCents:100,paymentLinkId:'fixture-link',idempotencyKey:'knock'});
  const paid = {id:'22222222-2222-4222-8222-222222222222',status:'paid',test:false,customerReference:order.reference,paymentLinkId:order.paymentLinkId,network:'polygon',currencyToken:'USDC',amountBaseUnits:'1000000',amountReceivedBaseUnits:'1000000',transactionId:'fixture-tx',paidAt:order.createdAt,recipientWallet:'fixture-wallet'};
  assert.equal(clubs.canEnter(1,3),false);
  assert.throws(()=>verifyClubEntryPayment(order,{...paid,status:'pending'}));
  const receipt = verifyClubEntryPayment(order,paid);
  const {payment} = ledger.settle(receipt);
  assert.equal(clubs.canEnter(1,3),true);
  assert.equal(clubs.canEnter(1,6),false);
  assert.equal(ledger.settle(receipt).applied,false);
  assert.deepEqual(bonuses.map(b=>[b.amountCents,b.nonredeemable]),[[64,true]]);
  assert.equal(ledger.earnings(2).netCents,16);
  assert.equal(payment.platformRoyaltyCents,20);
});

test('expired organizers disappear from every sort and page even with the highest activity', () => {
  const {db,clubs}=fixture();
  db.prepare('UPDATE organizer_billing_memberships SET expires_at=? WHERE user_id=1').run('2026-01-31');
  for (const rank of [true,false]) {
    assert.deepEqual(clubs.directory({rank}).clubs.map(c=>c.ownerId),[2,6]);
    assert.deepEqual(clubs.directory({rank,offset:2,limit:1}).clubs,[]);
  }
});

test('two used plugins outrank membership alone even with a lower points total', () => {
 const {db,clubs}=fixture();
 for(let i=100;i<200;i++){
   db.prepare('INSERT INTO users(id,login,nick) VALUES(?,?,?)').run(i,'player'+i,'Player');
   db.prepare("INSERT INTO organizer_club_members VALUES(2,?,'approved','','','')").run(i);
 }
 const [used,idle]=clubs.directory().clubs;
 assert.equal(used.ownerId,1); assert.equal(used.pluginsUsed,2);
 assert.equal(idle.ownerId,2); assert.equal(idle.pluginsUsed,0); assert.equal(idle.score,101);
 assert.ok(used.score<idle.score);
});

test('only current approved members count once toward reputation',()=>{
 const {clubs}=fixture(); const vote=stars=>clubs.vote({organizerId:1,userId:3,stars});
 assert.throws(()=>vote(5)); clubs.approvePaid({organizerId:1,userId:3});
 assert.throws(()=>vote(6)); vote(5); vote(3);
 assert.deepEqual({...clubs.profile(1).reputation},{votes:1,stars:3});
 assert.throws(()=>clubs.vote({organizerId:1,userId:1,stars:5}));
 clubs.leave({organizerId:1,userId:3}); assert.equal(clubs.profile(1).reputation.votes,0);
});
