// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyClubEntryPayment, clubEntryCheckoutUrl, createClubEntryProvider } from './club-entry-provider.js';
const order={id:'local-order',reference:'club-entry:opaque-reference',feeCents:100,paymentLinkId:'11111111-1111-4111-8111-111111111111'};
const paid={id:'22222222-2222-4222-8222-222222222222',status:'paid',test:false,customerReference:order.reference,paymentLinkId:order.paymentLinkId,network:'polygon',currencyToken:'USDC',amountBaseUnits:'1000007',amountReceivedBaseUnits:'1000007',transactionId:'0xreceipt',paidAt:'2026-11-18T00:00:00Z',recipientWallet:'0xmerchant'};
test('Club Entry verifies exact server quote, account binding and final stablecoin receipt',()=>{
  assert.equal(verifyClubEntryPayment(order,paid).amountBaseUnits,'1000007');
  for(const patch of [{status:'pending'},{test:true},{customerReference:'someone-else'},{paymentLinkId:'another-link'},{network:'ethereum'},{currencyToken:'ETH'},{amountReceivedBaseUnits:'999999'},{amountReceivedBaseUnits:'1020000'},{amountBaseUnits:'999999'},{transactionId:''},{paidAt:null}]) {
    assert.throws(()=>verifyClubEntryPayment(order,{...paid,...patch}),JSON.stringify(patch));
  }
  assert.equal(verifyClubEntryPayment(order,{...paid,network:'bnb',currencyToken:'USDT',amountBaseUnits:'1000000000000000007',amountReceivedBaseUnits:'1000000000000000007'}).network,'bnb');
});
test('checkout has only the fixed trusted provider origin and opaque reference',()=>{
  const url=new URL(clubEntryCheckoutUrl(order));
  assert.equal(url.origin,'https://nervixpay.live'); assert.equal(url.pathname,`/l/${order.paymentLinkId}`);
  assert.equal(url.searchParams.get('ref'),order.reference); assert.equal(url.searchParams.get('mode'),'card');assert.equal(url.searchParams.get('prefer'),'bnb:USDC');
  assert.throws(()=>clubEntryCheckoutUrl({...order,paymentLinkId:'../../evil'}));
});
test('provider stays closed without credentials and refuses a different merchant or test token',async()=>{
  assert.equal(await createClubEntryProvider({}).ready(),false);
  for(const patch of [{merchant:{id:'wrong',blocked:false}},{credential:{mode:'test'}}]) {
    const provider=createClubEntryProvider({token:'test-only-token',merchantId:'merchant',fetchImpl:async()=>Response.json({merchant:{id:'merchant',blocked:false},credential:{mode:'live',scopes:['integrations:verify','payment_links:read','payment_links:write','payments:read']},...patch})});
    assert.equal(await provider.ready(),false);
  }
});
test('provider reads a payment by bounded UUID and never follows redirects or accepts a browser paid flag',async()=>{
  const calls=[];
  const provider=createClubEntryProvider({token:'test-only-token',merchantId:'merchant',fetchImpl:async(url,init)=>{
    calls.push({url,init});return Response.json({payment:paid});
  }});
  assert.deepEqual(await provider.payment(paid.id),paid);
  assert.equal(calls[0].url,`https://nervixpay.live/api/v1/payments/${paid.id}`); assert.equal(calls[0].init.redirect,'error');
  await assert.rejects(()=>provider.payment('https://attacker.invalid'));
});

test('checkout accepts the configured existing merchant without renaming it', async () => {
  for (const [id,name,expected] of [['dedicated','DanGG',true],['dedicated','Fake or Real',true],['37b595c2-ae97-4ca0-9dcd-71452c8f4c3c','Fake or Real',true]]) {
    const provider = createClubEntryProvider({ token:'fixture', merchantId:id, fetchImpl:async()=>Response.json({merchant:{id,name,blocked:false},credential:{mode:'live',scopes:['integrations:verify','payment_links:read','payment_links:write','payments:read']}}) });
    assert.equal(await provider.ready(),expected);
  }
});

test('BNB USDC uses 18 decimals and rejects unsupported assets, wrong precision and underpayment',()=>{
 const receipt={...paid,network:'bnb',currencyToken:'USDC',amountBaseUnits:'1000500000000000000',amountReceivedBaseUnits:'1000500000000000000'};
 assert.equal(verifyClubEntryPayment(order,receipt).token,'USDC');
 for(const patch of [{currencyToken:'BNB'},{network:'ethereum'},{amountBaseUnits:'1000500'},{amountReceivedBaseUnits:'1000500'},{amountReceivedBaseUnits:'999999999999999999'},{amountBaseUnits:'1010000000000000000'},{amountReceivedBaseUnits:'1010000000000000000'}])assert.throws(()=>verifyClubEntryPayment(order,{...receipt,...patch}));
});
