// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createOrganizerFundingProviders, organizerFundingCheckoutUrl } from './organizer-funding-provider.js';

const scopes=['integrations:verify','payment_links:read','payment_links:write','payments:read'];
const row={id:'request-1',reference:'funding:opaque-1',organizerId:'organizer-1',userId:'player-1',amount:2500,feeCents:375};
const link={id:'11111111-1111-4111-8111-111111111111',mode:'live',active:true,linkType:'embed',itemName:`Cash Chips ${row.amount} · ${row.reference}`,prices:[{network:'polygon',currencyToken:'USDC',amount:'3.75',pricingMode:'fixed'},{network:'bnb',currencyToken:'USDC',amount:'3.75',pricingMode:'fixed'}]};
const verification=merchantId=>({merchant:{id:merchantId,blocked:false},credential:{mode:'live',scopes}});

test('configuration and readiness fail closed',async()=>{
 assert.throws(()=>createOrganizerFundingProviders({connections:'{secret'}),error=>error.status===503&&!error.message.includes('secret'));
 assert.equal(await createOrganizerFundingProviders({connections:{}}).forOrganizer('organizer-1').ready(),false);
 for(const response of [{merchant:{id:'wrong',blocked:false},credential:{mode:'live',scopes}},{merchant:{id:'merchant',blocked:false},credential:{mode:'test',scopes}}]){
  const provider=createOrganizerFundingProviders({connections:{'organizer-1':{merchantId:'merchant',token:'token'}},fetchImpl:async()=>Response.json(response)}).forOrganizer('organizer-1');
  assert.equal(await provider.ready(),false);
 }
});

test('legacy connection remains the default fallback and checkout URL is bounded',async()=>{
 const calls=[];const provider=createOrganizerFundingProviders({connections:{'organizer-1':{merchantId:'legacy',token:'legacy-token'}},fetchImpl:async(url,init)=>(calls.push({url,init}),Response.json(verification('legacy')))}).forOrganizer('organizer-1');
 assert.equal(await provider.ready(),true);assert.equal(calls[0].init.headers.authorization,'Bearer legacy-token');
 const url=new URL(organizerFundingCheckoutUrl(link.id,row.reference));assert.equal(url.origin,'https://nervixpay.live');assert.equal(url.searchParams.get('ref'),row.reference);assert.throws(()=>organizerFundingCheckoutUrl('../../evil',row.reference));
});

test('a live user connection overrides legacy configuration',async()=>{
 const calls=[],user={merchantId:'user-merchant',token:'user-token'};
 const provider=createOrganizerFundingProviders({connections:{'organizer-1':{merchantId:'legacy',token:'legacy-token'}},resolveConnection:(_id,_legacy)=>user,fetchImpl:async(url,init)=>(calls.push({url,init}),Response.json(verification('user-merchant')))}).forOrganizer('organizer-1');
 assert.equal(await provider.ready(),true);assert.equal(calls[0].init.headers.authorization,'Bearer user-token');
});

test('explicit disconnect suppresses legacy fallback and invalidates cached readiness',async()=>{
 let current={merchantId:'user-merchant',token:'user-token'},fetches=0;
 const provider=createOrganizerFundingProviders({connections:{'organizer-1':{merchantId:'legacy',token:'legacy-token'}},resolveConnection:()=>current,fetchImpl:async()=>(fetches++,Response.json(verification('user-merchant')))}).forOrganizer('organizer-1');
 assert.equal(await provider.ready(),true);current=null;assert.equal(await provider.ready(),false);assert.equal(fetches,1);
 await assert.rejects(()=>provider.payment('22222222-2222-4222-8222-222222222222'),e=>e.status===503);
});

test('token replacement gets a distinct readiness cache and authorization header',async()=>{
 let current={merchantId:'merchant',token:'token-one'};const headers=[];
 const provider=createOrganizerFundingProviders({connections:{},resolveConnection:()=>current,fetchImpl:async(_url,init)=>(headers.push(init.headers.authorization),Response.json(verification('merchant')))}).forOrganizer('organizer-1');
 assert.equal(await provider.ready(),true);current={merchantId:'merchant',token:'token-two'};assert.equal(await provider.ready(),true);
 assert.deepEqual(headers,['Bearer token-one','Bearer token-two']);
});

test('disconnect or replacement during fetch fails closed before returning provider data',async()=>{
 for(const replacement of [null,{merchantId:'merchant',token:'token-two'}]){
  let current={merchantId:'merchant',token:'token-one'},release;
  const waiting=new Promise(resolve=>{release=resolve});
  const provider=createOrganizerFundingProviders({connections:{},resolveConnection:()=>current,fetchImpl:async()=>{await waiting;return Response.json({payment:{id:'paid'}});}}).forOrganizer('organizer-1');
  const pending=provider.payment('22222222-2222-4222-8222-222222222222');current=replacement;release();
  await assert.rejects(()=>pending,/connection changed/);
 }
});

test('creates exact request-bound product and validates live amount/network',async()=>{
 const db=new DatabaseSync(':memory:'),calls=[];
 const provider=createOrganizerFundingProviders({connections:{'organizer-1':{merchantId:'merchant',token:'token'}},fetchImpl:async(url,init)=>{calls.push({url,init});if(url.endsWith('/verify'))return Response.json(verification('merchant'));if(!init.body)return Response.json({items:[]});return Response.json({paymentLink:link});}}).forOrganizer('organizer-1');
 assert.equal(await provider.linkForRequest(db,row),link.id);const body=JSON.parse(calls.find(call=>call.init.body).init.body);assert.match(body.displayTitle,/^DanGG · /);assert.equal(body.itemName,link.itemName);assert.equal(new Set(body.prices.map(value=>value.network)).size,body.prices.length,'NervixPay requires one asset per network');assert.equal(body.prices.find(value=>value.network==='bnb').currencyToken,'USDC');assert.deepEqual(body.prices.map(value=>value.amount),['3.75','3.75']);
});

test('session settlement is labelled as repayment and grants no additional chips',async()=>{
 const db=new DatabaseSync(':memory:'),settlement={...row,id:'session-1',reference:'session:opaque',amount:1200,feeCents:180,purpose:'session_settlement'};let body;
 const settlementLink={...link,itemName:`Session settlement · 1200 Cash Chips · session:opaque`,prices:link.prices.map(value=>({...value,amount:'1.80'}))};
 const provider=createOrganizerFundingProviders({connections:{'organizer-1':{merchantId:'merchant',token:'token'}},fetchImpl:async(url,init)=>{if(url.endsWith('/verify'))return Response.json(verification('merchant'));if(!init.body)return Response.json({items:[]});body=JSON.parse(init.body);return Response.json({paymentLink:settlementLink});}}).forOrganizer('organizer-1');
 assert.equal(await provider.linkForRequest(db,settlement),settlementLink.id);assert.match(body.description,/does not grant additional chips/);
});

test('creation recovery reuses exact live links and rejects wrong amount or network',async()=>{
 const db=new DatabaseSync(':memory:');let created=false;
 const provider=createOrganizerFundingProviders({connections:{'organizer-1':{merchantId:'merchant',token:'token'}},fetchImpl:async(url,init)=>{if(url.endsWith('/verify'))return Response.json(verification('merchant'));if(init.body){created=true;return new Response('',{status:503});}return Response.json({items:created?[link]:[]});}}).forOrganizer('organizer-1');
 await assert.rejects(()=>provider.linkForRequest(db,row));assert.equal(await provider.linkForRequest(db,row),link.id);
 for(const bad of [{...link,prices:link.prices.map(value=>({...value,amount:'3.74'}))},{...link,prices:[{network:'ethereum',currencyToken:'USDC',amount:'3.75',pricingMode:'fixed'}]}]){
  const other=new DatabaseSync(':memory:');const badProvider=createOrganizerFundingProviders({connections:{'organizer-1':{merchantId:'merchant',token:'token'}},fetchImpl:async(url,init)=>url.endsWith('/verify')?Response.json(verification('merchant')):!init.body?Response.json({items:[]}):Response.json({paymentLink:bad})}).forOrganizer('organizer-1');
  await assert.rejects(()=>badProvider.linkForRequest(other,row),/valid live/);
 }
});

test('cancellation disables checkout and fails closed on existing or incomplete payment history',async()=>{
 for(const items of [[],[{paymentLinkId:link.id,status:'pending'}],Array.from({length:100},()=>({paymentLinkId:'other'}))]){
  const calls=[];
  const provider=createOrganizerFundingProviders({connections:{'organizer-1':{merchantId:'merchant',token:'token'}},fetchImpl:async(url,init)=>{calls.push({url,method:init.method});return Response.json(init.method==='PATCH'?{paymentLink:{...link,active:false}}:{items});}}).forOrganizer('organizer-1');
  const run=()=>provider.cancelLink({...row,paymentLinkId:link.id});
  if(items.length)await assert.rejects(run,/reconciliation/);else await run();
  assert.equal(calls[0].method,'PATCH');assert.match(calls[1].url,/payments\?limit=100$/);
 }
});

test('cancellation recovers saved unattached checkout and refuses unknown creation outcome',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE organizer_funding_provider_links(request_id TEXT,organizer_id TEXT,link_id TEXT)');
 const calls=[];const provider=createOrganizerFundingProviders({connections:{'organizer-1':{merchantId:'merchant',token:'token'}},fetchImpl:async(url,init)=>{calls.push(url);return Response.json(init.method==='PATCH'?{paymentLink:{...link,active:false}}:{items:[]});}}).forOrganizer('organizer-1');
 await assert.rejects(()=>provider.cancelLink(row,db),/unresolved/);assert.equal(calls.length,0);
 db.prepare('INSERT INTO organizer_funding_provider_links VALUES(?,?,?)').run(row.id,row.organizerId,link.id);
 await provider.cancelLink(row,db);assert.match(calls[0],new RegExp(link.id));assert.equal(calls.length,2);
});

test('existing two-asset funding links remain usable without creating a new link',async()=>{
 const db=new DatabaseSync(':memory:'),legacy={...link,prices:[link.prices[0],{network:'bnb',currencyToken:'USDT',amount:'3.75',pricingMode:'fixed'}]};let creates=0;
 const provider=createOrganizerFundingProviders({connections:{'organizer-1':{merchantId:'merchant',token:'token'}},fetchImpl:async(url,init)=>{
  if(url.endsWith('/verify'))return Response.json(verification('merchant'));
  if(init.method==='POST'){creates++;return Response.json({paymentLink:legacy});}
  return Response.json({items:[legacy]});
 }}).forOrganizer('organizer-1');
 assert.equal(await provider.linkForRequest(db,row),legacy.id);assert.equal(await provider.linkForRequest(db,row),legacy.id);assert.equal(creates,0);
});
