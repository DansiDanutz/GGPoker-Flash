// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createNervixPayConnections } from './nervixpay-connections.js';

const merchantId='11111111-1111-4111-8111-111111111111', credentialId='22222222-2222-4222-8222-222222222222';
const deviceCode='device-secret-that-must-never-be-stored-plain', token=`nvp.${credentialId}.access-secret-that-must-never-leak`;
const scopes=['integrations:verify','payment_links:read','payment_links:write','payments:read'];
function fixture(handler, key=randomBytes(32).toString('base64')) {
  const db=new DatabaseSync(':memory:');
  db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,banned INTEGER DEFAULT 0,deleted_at TEXT,login TEXT); INSERT INTO users VALUES(1,0,NULL,'owner'),(2,0,NULL,'player'),(3,1,NULL,'banned'),(4,0,NULL,'guest_deadbeef-abc')");
  let time=Date.parse('2026-11-19T12:00:00Z');
  const calls=[];
  const fetchImpl=async(url,init)=>{ calls.push({url,init}); return handler(url,init,calls); };
  return {db,calls,advance:ms=>time+=ms,service:createNervixPayConnections({db,encryptionKey:key,fetchImpl,now:()=>time})};
}
const device=()=>Response.json({deviceCode,userCode:'ABCD-EFGH',verificationUri:'https://nervixpay.live/integrations',verificationHint:'Open Integrations while signed in and approve the displayed code.',expiresAt:'2026-11-19T12:10:00.000Z',expiresIn:600,interval:5,mode:'live',scopes});
const issued=()=>Response.json({accessToken:token,tokenType:'Bearer',expiresAt:'2026-11-26T12:00:00.000Z',expiresIn:604800,credentialId,mode:'live',scopes});
const verified=(patch={})=>Response.json({ok:true,merchant:{id:merchantId,name:'Merchant',onboardingCompleted:true,blocked:false},credential:{id:credentialId,clientName:'DanGG / OpenPoker',mode:'live',scopes,expiresAt:'2026-11-26T12:00:00.000Z'},...patch});

test('missing key disables setup and user isolation blocks banned or different users', async()=>{
  const f=fixture(async()=>device(),'bad-key');
  assert.equal(f.service.status(1).enabled,false);
  await assert.rejects(()=>f.service.start({userId:1,merchantId,mode:'live'}),e=>e.status===503);
  await assert.rejects(()=>f.service.start({userId:3,merchantId,mode:'live'}),e=>e.status===403);
  assert.equal(f.service.status(2).hasRecord,false);
});

test('start persists only encrypted device material and returns safe approval metadata', async()=>{
  const f=fixture(async()=>device());
  const status=await f.service.start({userId:1,merchantId,mode:'live'});
  assert.deepEqual({status:status.status,userCode:status.userCode,verificationUri:status.verificationUri,mode:status.mode},{status:'pending',userCode:'ABCD-EFGH',verificationUri:'https://nervixpay.live/integrations',mode:'live'});
  assert.equal(JSON.stringify(status).includes(deviceCode),false);
  const disk=JSON.stringify(f.db.prepare('SELECT * FROM nervixpay_user_connections').get());
  assert.equal(disk.includes(deviceCode),false); assert.equal(disk.includes(token),false);
  const unavailable=createNervixPayConnections({db:f.db,encryptionKey:'bad-key',fetchImpl:async()=>{throw new Error('unused')}}).status(1);
  assert.equal(unavailable.enabled,false); assert.equal(unavailable.status,'error');
  const body=JSON.parse(f.calls[0].init.body);
  assert.deepEqual(body,{merchantId,clientName:'DanGG / OpenPoker',scopes:['payment_links:write','payments:read','integrations:verify'],mode:'live',metadata:{platform:'server'}});
});

test('poll enforces five seconds and duplicate polling makes one token request', async()=>{
  const f=fixture(async(url)=>url.endsWith('/request')?device():new Response(JSON.stringify({error:{code:'authorization_pending',message:'pending'},interval:5}),{status:409,headers:{'content-type':'application/json'}}));
  await f.service.start({userId:1,merchantId,mode:'live'});
  await assert.rejects(()=>f.service.poll(1),e=>e.status===429);
  f.advance(5000);
  const results=await Promise.allSettled([f.service.poll(1),f.service.poll(1)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(f.calls.filter(call=>call.url.endsWith('/token')).length,1);
});

test('concurrent or active starts require explicit disconnect and cannot replace an attempt', async()=>{
  let release; const waiting=new Promise(resolve=>{release=resolve});
  const f=fixture(async url=>{if(url.endsWith('/request')){await waiting;return device();}return Response.json({ok:true});});
  const first=f.service.start({userId:1,merchantId,mode:'live'}); await Promise.resolve();
  await assert.rejects(()=>f.service.start({userId:1,merchantId,mode:'live'}),e=>e.status===409);
  release(); await first;
  await assert.rejects(()=>f.service.start({userId:1,merchantId,mode:'live'}),e=>e.status===409);
  assert.equal(f.calls.filter(call=>call.url.endsWith('/request')).length,1);
});

test('exchange is encrypted before verification and retries verify without exchanging twice', async()=>{
  let verifyAttempts=0;
  const f=fixture(async(url)=>url.endsWith('/request')?device():url.endsWith('/token')?issued():(++verifyAttempts===1?new Response('',{status:503}):verified()));
  await f.service.start({userId:1,merchantId,mode:'live'}); f.advance(5000);
  const first=await f.service.poll(1); assert.equal(first.status,'verifying'); assert.equal(f.service.connectionFor(1),null);
  const disk=JSON.stringify(f.db.prepare('SELECT * FROM nervixpay_user_connections').get());
  assert.equal(disk.includes(token),false); assert.equal(disk.includes(deviceCode),false);
  f.advance(5000); assert.equal((await f.service.poll(1)).status,'verified');
  assert.deepEqual(f.service.connectionFor(1),{merchantId,token});
  assert.equal(f.calls.filter(call=>call.url.endsWith('/token')).length,1);
  f.db.prepare('UPDATE users SET banned=1 WHERE id=1').run(); assert.equal(f.service.connectionFor(1),null);
});

test('test credentials never become a live connection', async()=>{
  const f=fixture(async(url)=>url.endsWith('/request')?Response.json({deviceCode,userCode:'ABCD-EFGH',verificationUri:'https://nervixpay.live/integrations',expiresAt:'2026-11-19T12:10:00.000Z',expiresIn:600,interval:5,mode:'test',scopes}):url.endsWith('/token')?Response.json({...JSON.parse(await issued().text()),mode:'test'}):verified({credential:{id:credentialId,mode:'test',scopes,expiresAt:'2026-11-26T12:00:00.000Z'}}));
  await f.service.start({userId:1,merchantId,mode:'test'}); f.advance(5000); assert.equal((await f.service.poll(1)).status,'verified');
  assert.equal(f.service.connectionFor(1),null);
});

test('identity or scope mismatch revokes and discards the exchanged token', async()=>{
  for(const bad of [verified({merchant:{id:'33333333-3333-4333-8333-333333333333',onboardingCompleted:true,blocked:false}}),verified({credential:{id:credentialId,mode:'live',scopes:['integrations:verify'],expiresAt:'2026-11-26T12:00:00.000Z'}})]){
    const f=fixture(async(url,init)=>url.endsWith('/request')?device():url.endsWith('/token')?issued():url.endsWith('/verify')?bad:Response.json({ok:true}));
    await f.service.start({userId:1,merchantId,mode:'live'}); f.advance(5000);
    assert.equal((await f.service.poll(1)).status,'error'); assert.equal(f.service.connectionFor(1),null);
    assert.equal(f.calls.some(call=>call.url.endsWith('/credential')&&call.init.method==='DELETE'),true);
    assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM nervixpay_user_connections').get()).includes(token),false);
  }
});

test('invalid issued mode is disabled and retained until revocation retry succeeds', async()=>{
  let revokes=0;
  const f=fixture(async url=>url.endsWith('/request')?device():url.endsWith('/token')?Response.json({...JSON.parse(await issued().text()),mode:'test'}):url.endsWith('/credential')?(++revokes===1?new Response('',{status:503}):Response.json({ok:true})):verified());
  await f.service.start({userId:1,merchantId,mode:'live'}); f.advance(5000);
  const failed=await f.service.poll(1); assert.equal(failed.status,'disabled'); assert.match(failed.lastError,/revocation is pending/);
  assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM nervixpay_user_connections').get()).includes(token),false);
  assert.equal((await f.service.disconnect(1)).lastError,null); assert.equal(revokes,2);
});

test('verification mismatch retains encrypted bearer when revoke is unavailable', async()=>{
  let revokes=0;
  const mismatch=verified({merchant:{id:'33333333-3333-4333-8333-333333333333',onboardingCompleted:true,blocked:false}});
  const f=fixture(async url=>url.endsWith('/request')?device():url.endsWith('/token')?issued():url.endsWith('/verify')?mismatch:(++revokes===1?new Response('',{status:503}):Response.json({ok:true})));
  await f.service.start({userId:1,merchantId,mode:'live'}); f.advance(5000);
  assert.equal((await f.service.poll(1)).status,'disabled'); assert.equal(f.service.connectionFor(1),null);
  assert.equal((await f.service.disconnect(1)).lastError,null); assert.equal(revokes,2);
});

test('disconnect wins over late poll and remains explicit even if revoke is unavailable', async()=>{
  let release; const tokenWait=new Promise(resolve=>{release=resolve});
  const f=fixture(async(url)=>url.endsWith('/request')?device():url.endsWith('/token')?(await tokenWait,issued()):new Response('',{status:503}));
  await f.service.start({userId:1,merchantId,mode:'live'}); f.advance(5000);
  const polling=f.service.poll(1); await Promise.resolve();
  assert.equal((await f.service.disconnect(1)).status,'disabled'); release(); await polling;
  const status=f.service.status(1); assert.equal(status.status,'disabled'); assert.equal(status.hasRecord,true); assert.equal(f.service.connectionFor(1),null);
});

test('late issued token is durably queued without overwriting a newer attempt', async()=>{
  let release,starts=0,revokes=0; const tokenWait=new Promise(resolve=>{release=resolve});
  const f=fixture(async url=>url.endsWith('/request')?(starts++,device()):url.endsWith('/token')?(await tokenWait,issued()):url.endsWith('/credential')?(++revokes===1?new Response('',{status:503}):Response.json({ok:true})):verified());
  await f.service.start({userId:1,merchantId,mode:'live'}); f.advance(5000); const oldPoll=f.service.poll(1); await Promise.resolve();
  await f.service.disconnect(1); const newer=await f.service.start({userId:1,merchantId,mode:'live'}); assert.equal(newer.status,'pending');
  release(); await oldPoll;
  assert.equal(f.service.status(1).status,'pending'); assert.equal(f.db.prepare('SELECT COUNT(*) count FROM nervixpay_revocations').get().count,1);
  await f.service.disconnect(1); assert.equal(f.db.prepare('SELECT COUNT(*) count FROM nervixpay_revocations').get().count,0); assert.equal(revokes,2); assert.equal(starts,2);
});

test('disconnect retries provider revocation while remaining locally disabled', async()=>{
  let revokeAttempts=0;
  const f=fixture(async url=>url.endsWith('/request')?device():url.endsWith('/token')?issued():url.endsWith('/verify')?verified():(++revokeAttempts===1?new Response('',{status:503}):Response.json({ok:true})));
  await f.service.start({userId:1,merchantId,mode:'live'}); f.advance(5000); await f.service.poll(1);
  assert.match((await f.service.disconnect(1)).lastError,/revocation is pending/);
  assert.equal((await f.service.disconnect(1)).lastError,null);
  assert.equal(revokeAttempts,2);
});

test('unreadable token ciphertext is preserved for key recovery or manual revocation', async()=>{
  const f=fixture(async url=>url.endsWith('/request')?device():url.endsWith('/token')?issued():url.endsWith('/verify')?verified():Response.json({ok:true}));
  await f.service.start({userId:1,merchantId,mode:'live'}); f.advance(5000); await f.service.poll(1);
  const before=f.db.prepare('SELECT token_cipher FROM nervixpay_user_connections WHERE user_id=1').get().token_cipher;
  f.db.prepare("UPDATE nervixpay_user_connections SET token_tag='corrupt' WHERE user_id=1").run();
  const status=await f.service.disconnect(1); assert.equal(status.status,'disabled'); assert.match(status.lastError,/correct encryption key|revoke it/);
  assert.equal(f.db.prepare('SELECT token_cipher FROM nervixpay_user_connections WHERE user_id=1').get().token_cipher,before);
});

test('reconnect cannot orphan an old credential when revocation is unavailable', async()=>{
  let starts=0;
  const f=fixture(async url=>url.endsWith('/request')?(starts++,device()):url.endsWith('/token')?issued():url.endsWith('/verify')?verified():new Response('',{status:503}));
  await f.service.start({userId:1,merchantId,mode:'live'}); f.advance(5000); await f.service.poll(1);
  await f.service.disconnect(1);
  await assert.rejects(()=>f.service.start({userId:1,merchantId,mode:'live'}),e=>e.status===503);
  assert.equal(starts,1); assert.equal(f.service.connectionFor(1),null);
});

test('denied and expired device codes become terminal without leaking provider text', async()=>{
  for(const [providerStatus,code,expected] of [[403,'device_code_denied','denied'],[410,'device_code_expired','expired']]){
    const f=fixture(async url=>url.endsWith('/request')?device():new Response(JSON.stringify({error:{code,message:'secret provider detail'}}),{status:providerStatus,headers:{'content-type':'application/json'}}));
    await f.service.start({userId:1,merchantId,mode:'live'}); f.advance(5000);
    const status=await f.service.poll(1); assert.equal(status.status,expected); assert.equal(JSON.stringify(status).includes('secret provider detail'),false);
  }
});

test('raw database guest users cannot authorize NervixPay or persist credentials', async()=>{
 const f=fixture(async()=>device());
 await assert.rejects(()=>f.service.start({userId:4,merchantId,mode:'live'}),e=>e.status===403);
 assert.equal(f.calls.length,0);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM nervixpay_user_connections').get().n,0);
});
