// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto';
import { verifyClubEntryPayment } from './club-entry-provider.js';

const MAX=9_000_000_000, MAX_FEE=100_000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(message,status=400,code='session_credit_invalid'){throw Object.assign(new Error(message),{status,code});}
function integer(value,name,max=MAX){if(!Number.isSafeInteger(value)||value<1||value>max)fail(`${name} must be a bounded positive integer.`);return value;}
function uuid(value,name='id'){if(typeof value!=='string'||!UUID.test(value))fail(`Invalid ${name}.`);return value;}
function transaction(db,fn){if(db.isTransaction)return fn();db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}

export function createOrganizerSessionCredit({db,chips,funding,now=Date.now}){
 if(!funding||typeof funding.get!=='function'||typeof funding.credit!=='function')fail('Funding service is required.',500);
 db.exec(`
 CREATE TABLE IF NOT EXISTS organizer_session_credits(
  id TEXT PRIMARY KEY,funding_request_id TEXT NOT NULL UNIQUE,organizer_id INTEGER NOT NULL,user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 9000000000),fee_cents INTEGER NOT NULL CHECK(fee_cents BETWEEN 1 AND 100000),reference TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN('proposed','active','awaiting_payment','paid','declined')),returned_chips INTEGER,used_chips INTEGER,due_cents INTEGER,payment_link_id TEXT,
  created_at TEXT NOT NULL,updated_at TEXT NOT NULL
 );
 CREATE UNIQUE INDEX IF NOT EXISTS organizer_session_credit_open_pair ON organizer_session_credits(organizer_id,user_id) WHERE state IN('proposed','active','awaiting_payment');
 CREATE TABLE IF NOT EXISTS organizer_session_credit_receipts(
  session_id TEXT PRIMARY KEY,provider_payment_id TEXT NOT NULL UNIQUE,transaction_id TEXT NOT NULL,network TEXT NOT NULL,token TEXT NOT NULL,amount_base_units TEXT NOT NULL,received_at TEXT NOT NULL,UNIQUE(network,transaction_id)
 );
 CREATE TRIGGER IF NOT EXISTS organizer_session_credit_receipts_no_update BEFORE UPDATE ON organizer_session_credit_receipts BEGIN SELECT RAISE(ABORT,'immutable session credit receipt'); END;
 CREATE TRIGGER IF NOT EXISTS organizer_session_credit_receipts_no_delete BEFORE DELETE ON organizer_session_credit_receipts BEGIN SELECT RAISE(ABORT,'immutable session credit receipt'); END;
 `);
 const stamp=()=>new Date(now()).toISOString(),table=(name)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
 const active=(id)=>{id=integer(id,'userId');if(!db.prepare('SELECT 1 FROM users WHERE id=? AND banned=0 AND deleted_at IS NULL').get(id))fail('Active user required.',403,'user_inactive');return id;};
 const raw=(id)=>db.prepare('SELECT * FROM organizer_session_credits WHERE id=?').get(uuid(id));
 const view=(r)=>r&&({id:r.id,fundingRequestId:r.funding_request_id,organizerId:r.organizer_id,userId:r.user_id,amount:r.amount,feeCents:r.fee_cents,reference:r.reference,state:r.state,returnedChips:r.returned_chips,usedChips:r.used_chips,dueCents:r.due_cents,paymentLinkId:r.payment_link_id,createdAt:r.created_at,updatedAt:r.updated_at});
 const owned=(actor,id)=>{actor=active(actor);const r=raw(id);if(!r||(r.organizer_id!==actor&&r.user_id!==actor))fail('Session credit not found.',404,'session_credit_not_found');return r;};
 function propose({userId,fundingRequestId,feeCents}){
  userId=active(userId);fundingRequestId=uuid(fundingRequestId,'fundingRequestId');feeCents=integer(feeCents,'feeCents',MAX_FEE);
  let source;try{source=funding.get(userId,fundingRequestId);}catch{fail('Session credit not found.',404,'session_credit_not_found');}
  if(source.organizerId!==userId||source.state!=='requested')fail('A requested funding source is required.',409,'funding_state');
  const old=db.prepare('SELECT * FROM organizer_session_credits WHERE funding_request_id=?').get(fundingRequestId);
  if(old){if(old.fee_cents!==feeCents)fail('Session credit terms cannot change.',409,'terms_conflict');return view(old);}
  if(db.prepare("SELECT 1 FROM organizer_session_credits WHERE organizer_id=? AND user_id=? AND state IN('proposed','active','awaiting_payment')").get(source.organizerId,source.userId))fail('An open session credit already exists.',409,'session_credit_open');
  const id=randomUUID(),ts=stamp();db.prepare("INSERT INTO organizer_session_credits(id,funding_request_id,organizer_id,user_id,amount,fee_cents,reference,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'proposed',?,?)").run(id,fundingRequestId,source.organizerId,source.userId,source.amount,feeCents,`session-credit:${randomUUID()}`,ts,ts);return view(raw(id));
 }
 const list=(userId)=>{userId=active(userId);return db.prepare(`SELECT * FROM organizer_session_credits WHERE (organizer_id=? OR user_id=?) AND (state IN('proposed','active','awaiting_payment') OR id IN(
  SELECT id FROM organizer_session_credits WHERE (organizer_id=? OR user_id=?) AND state IN('paid','declined') ORDER BY updated_at DESC,id DESC LIMIT 100
 )) ORDER BY updated_at DESC,id DESC`).all(userId,userId,userId,userId).map(view);};
 const get=(userId,id)=>view(owned(userId,id));
 const decline=({userId,id})=>transaction(db,()=>{const r=owned(userId,id);if(r.state==='declined')return view(r);if(r.state!=='proposed')fail('Only a proposal can be declined.',409,'session_credit_state');db.prepare("UPDATE organizer_session_credits SET state='declined',updated_at=? WHERE id=?").run(stamp(),r.id);return view(raw(r.id));});
 const accept=({userId,id})=>transaction(db,()=>{const r=owned(userId,id);if(r.user_id!==userId)fail('Session credit not found.',404,'session_credit_not_found');if(r.state==='active')return view(r);if(r.state!=='proposed')fail('Only a proposal can be accepted.',409,'session_credit_state');
  if(db.prepare("SELECT 1 FROM organizer_funding_requests WHERE organizer_id=? AND user_id=? AND state='offered'").get(r.organizer_id,r.user_id))fail('Resolve outstanding paid offers before accepting session credit.',409,'funding_state');
  const source=funding.get(r.organizer_id,r.funding_request_id);if(source.state!=='requested'||source.userId!==r.user_id||source.amount!==r.amount)fail('Funding source is no longer requested.',409,'funding_state');
  const wallet=db.prepare('SELECT balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key=?').get(r.organizer_id,`wallet:${r.user_id}`)?.balance||0;
  const seat=db.prepare("SELECT 1 FROM organizer_chip_sessions WHERE organizer_id=? AND user_id=? AND status='open'").get(r.organizer_id,r.user_id);
  const ticket=table('organizer_chip_tickets')&&db.prepare("SELECT 1 FROM organizer_chip_tickets WHERE organizer_id=? AND holder_id=? AND state IN('issued','redeemed')").get(r.organizer_id,r.user_id);
  const spinTicket=table('organizer_chip_spin_tickets')&&db.prepare("SELECT 1 FROM organizer_chip_spin_tickets WHERE organizer_id=? AND holder_id=? AND state='issued'").get(r.organizer_id,r.user_id);
  const payout=table('organizer_chip_buybacks')&&db.prepare("SELECT 1 FROM organizer_chip_buybacks WHERE organizer_id=? AND requester_id=? AND state IN('requested','reported','disputed')").get(r.organizer_id,r.user_id);
  if(wallet||seat||ticket||spinTicket||payout)fail('Borrower wallet and chip escrows must be empty.',409,'session_credit_mixed');
  db.prepare("UPDATE organizer_session_credits SET state='active',updated_at=? WHERE id=?").run(stamp(),r.id);funding.credit({userId:r.organizer_id,id:r.funding_request_id});return view(raw(r.id));});
 const finish=({userId,id})=>transaction(db,()=>{const r=owned(userId,id);if(['awaiting_payment','paid'].includes(r.state))return view(r);if(r.state!=='active')fail('Active session credit required.',409,'session_credit_state');
  if(db.prepare("SELECT 1 FROM organizer_chip_sessions WHERE organizer_id=? AND user_id=? AND status='open'").get(r.organizer_id,r.user_id))fail('Close all chip seats first.',409,'session_credit_seat_open');
  const wallet=db.prepare('SELECT balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key=?').get(r.organizer_id,`wallet:${r.user_id}`)?.balance||0,returned=Math.min(wallet,r.amount),used=r.amount-returned;
  if(returned)chips.moveInTransaction({organizerId:r.organizer_id,from:`wallet:${r.user_id}`,to:`wallet:${r.organizer_id}`,amount:returned,kind:'session_credit_reclaim',reference:`session-credit:${r.id}:reclaim`});
  const due=Number((BigInt(r.fee_cents)*BigInt(used)+BigInt(r.amount)-1n)/BigInt(r.amount)),state=due?'awaiting_payment':'paid';
  db.prepare('UPDATE organizer_session_credits SET state=?,returned_chips=?,used_chips=?,due_cents=?,updated_at=? WHERE id=?').run(state,returned,used,due,stamp(),r.id);return view(raw(r.id));});
 function attachLink({userId,id,paymentLinkId}){const r=owned(userId,id);paymentLinkId=uuid(paymentLinkId,'paymentLinkId');if(r.state!=='awaiting_payment')fail('Payment is not due.',409,'session_credit_state');if(r.payment_link_id&&r.payment_link_id!==paymentLinkId)fail('Payment link cannot change.',409,'terms_conflict');if(!r.payment_link_id)db.prepare('UPDATE organizer_session_credits SET payment_link_id=?,updated_at=? WHERE id=?').run(paymentLinkId,stamp(),r.id);return view(raw(r.id));}
 const settle=({userId,id,payment})=>transaction(db,()=>{const r=owned(userId,id),receipt=db.prepare('SELECT * FROM organizer_session_credit_receipts WHERE session_id=?').get(r.id);if(!r.payment_link_id||!r.due_cents)fail('Payment is not due.',409,'session_credit_state');const verified=verifyClubEntryPayment({id:r.id,reference:r.reference,paymentLinkId:r.payment_link_id,feeCents:r.due_cents},payment);
  if(r.state==='paid'){if(!receipt||receipt.provider_payment_id!==verified.providerOrderId||receipt.transaction_id!==verified.transactionId||receipt.network!==verified.network||receipt.token!==verified.token||receipt.amount_base_units!==verified.amountBaseUnits)fail('Payment receipt conflicts.',409,'receipt_conflict');return view(r);}if(r.state!=='awaiting_payment')fail('Payment is not due.',409,'session_credit_state');
  for(const [name,pid,tx] of [['organizer_session_credit_receipts','provider_payment_id','transaction_id'],['organizer_funding_receipts','provider_payment_id','transaction_id'],['club_entry_payments','provider_order_id','transaction_id']])if(table(name)&&(db.prepare(`SELECT 1 FROM ${name} WHERE ${pid}=?`).get(verified.providerOrderId)||db.prepare(`SELECT 1 FROM ${name} WHERE network=? AND ${tx}=?`).get(verified.network,verified.transactionId)))fail('Payment receipt is already used.',409,'receipt_conflict');
  db.prepare('INSERT INTO organizer_session_credit_receipts VALUES(?,?,?,?,?,?,?)').run(r.id,verified.providerOrderId,verified.transactionId,verified.network,verified.token,verified.amountBaseUnits,stamp());db.prepare("UPDATE organizer_session_credits SET state='paid',updated_at=? WHERE id=?").run(stamp(),r.id);return view(raw(r.id));});
 return {list,get,propose,accept,decline,finish,attachLink,settle};
}
