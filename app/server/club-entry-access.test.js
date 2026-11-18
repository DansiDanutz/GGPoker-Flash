// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {startServer} from './test-helpers.js';

test('a verified $1 receipt unlocks the private table socket and posts the split once',async()=>{
  const link='11111111-1111-4111-8111-111111111111',paymentId='22222222-2222-4222-8222-222222222222';
  // Mock only the external merchant API inside the isolated child process.
  const mock=`import {DatabaseSync} from 'node:sqlite';globalThis.fetch=async url=>{
    if(url.endsWith('/verify'))return Response.json({merchant:{id:'fixture',blocked:false},credential:{mode:'live',scopes:['integrations:verify','payment_links:read','payment_links:write','payments:read']}});
    if(!url.endsWith('/payments/${paymentId}')) throw Error('Unexpected URL');
    const db=new DatabaseSync(process.env.GGPOKER_DATA+'/ggpoker.db');const {reference}=db.prepare('select reference from club_entry_orders').get();db.close();
    return Response.json({payment:{id:'${paymentId}',paymentLinkId:'${link}',customerReference:reference,status:'paid',test:false,network:'polygon',currencyToken:'USDC',amountBaseUnits:'1000000',amountReceivedBaseUnits:'1000000',transactionId:'fixture-tx',paidAt:new Date().toISOString(),recipientWallet:'fixture-wallet'}});
  }`;
  const s=await startServer({env:{NODE_OPTIONS:'--import=data:text/javascript;base64,'+Buffer.from(mock).toString('base64'),NERVIXPAY_CLUB_MERCHANT_ID:'fixture',NERVIXPAY_CLUB_TOKEN:'fixture',DANGG_CLUB_ENTRY_PUBLISHER_ID:'creator',DANGG_VERIFIED_CLUB_LINKS:JSON.stringify({100:link})}});
  const db=new DatabaseSync(s.dataDir+'/ggpoker.db');let sock;
  try{
    db.exec(`INSERT INTO organizer_billing_memberships VALUES(2,'organizer',1,'2099-01-01');
    INSERT INTO organizer_club_profiles VALUES(2,'Fixture club','',100,'','');
    INSERT INTO marketplace_publishers(id,owner_user_id,display_name,kind,nervixpay_merchant_id,status,created_at,updated_at) VALUES('creator',1,'DansiDanutz','individual','fixture','approved','','');
    UPDATE tables SET private=1,owner_id=2 WHERE id='nlh-gold-01';`);
    const token=await s.login('DansiDanutz','ggpoker');sock=s.socket(token);await sock.opened;
    const tableId='nlh-gold-01', join=()=>sock.send({type:'join_table',tableId,observe:true});
    join();assert.match((await sock.nextType('error')).error,/membership/i);
    const entry=await s.post('/api/organizers/2/entry',{token,body:{}});assert.equal(entry.status,200,JSON.stringify(entry.data));
    const verify=()=>s.post('/api/club-entry/orders/'+entry.data.order.id+'/verify',{token,body:{paymentId}});
    for(let i=0;i<2;i++){const r=await verify();assert.equal(r.status,200,JSON.stringify(r.data));}
    join();assert.equal((await sock.nextType('joined')).tableId,tableId);
    assert.deepEqual({...db.prepare('select creator_net_cents,platform_retained_cents,organizer_bonus_chips from club_entry_payments').get()},{creator_net_cents:16,platform_retained_cents:20,organizer_bonus_chips:6400});
    assert.equal(db.prepare("select sum(amount) n from organizer_chip_journals where kind='club_entry_bonus'").get().n,6400);
  }finally{if(sock)await sock.close();db.close();await s.stop();}
});
