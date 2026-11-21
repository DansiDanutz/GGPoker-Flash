// SPDX-License-Identifier: AGPL-3.0-only
// Invoked by NervixPay's disposable full-migration runner; never connect to a configured database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { execFile,execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createOrganizerFundingProviders } from '../app/server/organizer-funding-provider.js';
import { createOrganizerFundingRoutes } from '../app/server/organizer-funding-routes.js';
import { createOrganizerChips } from '../app/server/organizer-chips.js';
import { createOrganizerFunding } from '../app/server/organizer-funding.js';
assert.match(process.env.PGHOST ?? '', /^\/tmp\/nervix-clearance-race\.[a-zA-Z0-9]+$/);
const {mapAgentPayment} = await import(pathToFileURL(process.env.H2_PROVIDER_ROOT+'/lib/agent-payments.ts'));
const merchant='b1000000-0000-4000-8000-000000000001';
const sql=s=>execFileSync('psql',['-XAtqv','ON_ERROR_STOP=1','-c',s],{encoding:'utf8'}).trim();
// Exercise the actual Next handler. Only authentication, throttling and PostgREST transport
// are substituted; clearance, minting and settlement execute the migrated PostgreSQL routines.
const req = createRequire(process.env.H2_PROVIDER_ROOT+'/package.json');
const ts = req('typescript');
const compiled = ts.transpileModule(readFileSync(process.env.H2_PROVIDER_ROOT+'/app/api/v1/payment-links/[id]/clearance/route.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const exports = {};
let mode='live';
const deps = {
  'next/server':{NextResponse:Response},
  '@/lib/http':{agentRateLimit:()=>null,noStore:{'cache-control':'no-store'}},
  '@/lib/agent-auth':{
    agentError:(status,code,message)=>Response.json({code,message},{status}),
    requireAgentCredential:async(request,scopes)=>{
      assert.equal(request.headers.get('authorization'),'Bearer fixture');
      assert.deepEqual([...scopes],['payment_links:write','payments:read']);
      return {credential:{mode},merchant:{id:merchant},db:{rpc:async(name,params)=>{
        assert.equal(name,'nervixpay_clear_link');assert.equal(params.p_merchant,merchant);assert.equal(params.p_mode,'live');
        const data=sql(`select nervixpay_clear_link('${merchant}','${params.p_link}','live')`);
        return {data:data?JSON.parse(data):null,error:null};
      }}};
    }
  }
};
vm.runInNewContext(compiled,{exports,require:k=>deps[k]??req(k)});
const invoke=(url,init,id)=>exports.POST(new Request(url,init),{params:Promise.resolve({id})});
test('malformed link is rejected before database access',async()=>{
  assert.equal((await invoke('http://fixture',{method:'POST',headers:{authorization:'Bearer fixture'}},'malformed')).status,400);
});
test('test credential cannot clear a live link',async()=>{
  mode='test';
  try {assert.equal((await invoke('http://fixture',{method:'POST',headers:{authorization:'Bearer fixture'}},randomUUID())).status,403);}
  finally {mode='live';}
});
function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY,nick TEXT,banned INTEGER DEFAULT 0,deleted_at TEXT);
    INSERT INTO users VALUES (1,'Owner',0,NULL),(2,'Member',0,NULL),(3,'Pending',0,NULL),(4,'Inactive owner',0,NULL);
    ALTER TABLE users ADD COLUMN login TEXT NOT NULL DEFAULT 'member';
    CREATE TABLE organizer_billing_memberships(user_id INTEGER,role TEXT,active INTEGER,expires_at TEXT,PRIMARY KEY(user_id,role));
    INSERT INTO organizer_billing_memberships VALUES (1,'organizer',1,'2099-01-01T00:00:00.000Z'),(4,'organizer',0,'2099-01-01T00:00:00.000Z');
    CREATE TABLE organizer_club_members(organizer_id INTEGER,user_id INTEGER,status TEXT,message TEXT,created_at TEXT,updated_at TEXT,PRIMARY KEY(organizer_id,user_id));
    INSERT INTO organizer_club_members VALUES (1,2,'approved','','',''),(1,3,'pending','','',''),(4,2,'approved','','','');
  `);
  const now = () => Date.parse('2026-01-01T00:00:00Z');
  const chips = createOrganizerChips({ db, now });
  db.prepare('INSERT INTO organizer_chip_accounts VALUES (?,?,?)').run(1, 'wallet:1', 50_000);
  return { db, chips, funding: createOrganizerFunding({ db, chips, now }) };
}

for (const scenario of ['paid first','order before cancel, paid later','cancel first','provider reply lost','clearance endpoint upgrade','abandoned final nonpayment']) {
  test(scenario,async()=>{
    const {db,chips,funding}=fixture(), link=randomUUID(), order=randomUUID();
    const r=funding.create({userId:2,organizerId:1,amount:10000,key:scenario});
    funding.offer({userId:1,id:r.id,feeCents:100,startCheckout:true});
    sql(`insert into payment_links(id,merchant_id,item_name,link_type) values('${link}','${merchant}','offline','embed')`);
    db.exec('create table organizer_funding_provider_links(request_id text primary key,organizer_id text,merchant_id text,link_id text)');
    db.prepare('insert into organizer_funding_provider_links values(?,?,?,?)').run(r.id,'1',merchant,link);
    funding.attachLink({userId:1,id:r.id,paymentLinkId:link});
    const mint=()=>sql(`select nervixpay_create_order('${merchant}',50,jsonb_build_object('id','${order}','payment_link_id','${link}',
      'item_name','fixture','network','polygon','amount','1','amount_base_units','1000000','currency_token','USDC',
      'token_contract','0x'||repeat('c',40),'recipient_wallet','0x'||repeat('1',40),'start_block','1','expires_at',clock_timestamp()-interval '10 minutes','customer_reference','${r.reference}'))`);
    const settle=()=>assert.equal(sql(`select nervixpay_settle_order_with_usage('${order}','0x'||md5('${order}')||md5('${link}'),(select expires_at-interval '1 second' from orders where id='${order}'),null)`),'t');
    let drop=scenario==='provider reply lost';
    let missingEndpoint=scenario==='clearance endpoint upgrade';
    const providers=createOrganizerFundingProviders({connections:{'1':{merchantId:merchant,token:'fixture'}},fetchImpl:async(url,init)=>{
      assert.equal(init.headers.authorization,'Bearer fixture');
      if(new URL(url).pathname===`/api/v1/payments/${order}`) {
        const row=JSON.parse(sql(`select to_jsonb(o) from orders o where id='${order}' and merchant_id='${merchant}'`));
        return Response.json({payment:mapAgentPayment(row)});
      }
      assert.equal(new URL(url).pathname,`/api/v1/payment-links/${link}/clearance`);assert.equal(init.method,'POST');
      if(missingEndpoint) return new Response(null,{status:404});
      const response=await invoke(url,init,link); assert.equal(response.status,200);
      if(drop){drop=false;throw Error('reply lost after commit');}
      return response;
    }});
    const route=createOrganizerFundingRoutes({db,chips,funding,providers,mode:'enforce',requireUser:()=>({id:1}),readBody:async()=>({}),json:()=>{}});
    const cancel=()=>route({method:'POST'}, {}, new URL('http://fixture/api/marketplace/chips/funding/'+r.id+'/cancel'));
    const paid=scenario.startsWith('paid')||scenario.startsWith('order');
    if(missingEndpoint) {
      await assert.rejects(cancel(),e=>e.status===503);
      assert.equal(chips.balance(1,1),40000);
      assert.equal(funding.get(1,r.id).checkoutDisabled,false);
      assert.equal(db.prepare('select count(*) n from organizer_funding_clearances').get().n,0);
      missingEndpoint=false;
    }
    if(paid) {
      if(scenario==='paid first') {
        for(const suffix of [901,902]) {
          const older=sql(`select capacity_fixture_order(${suffix},'${link}')`);
          sql(`update orders set status='expired' where id='${older}'`);
        }
      }
      mint();
      if (scenario === 'paid first') sql('select capacity_fixture_order(400+i,null) from generate_series(1,101)i');
      if(scenario.startsWith('order')) {await assert.rejects(cancel(),/reserved/);assert.equal(chips.balance(1,1),40000);}
      settle();
    } else if(scenario==='abandoned final nonpayment'){
      mint();sql(`update orders set status='expired' where id='${order}'`);
      await assert.rejects(cancel(),/reserved/);
      const expiry=Number(sql(`select floor(extract(epoch from expires_at)) from orders where id='${order}'`));
      assert.equal(sql("select has_function_privilege('service_role','nervixpay_finalize_unpaid(uuid,uuid,timestamptz,bigint,bigint,timestamptz,text,text,text,text,text,text)','EXECUTE')"),'f');
      let head=2,possible=false,disagree=false;
      const h=n=>'0x'+n.toString(16).padStart(64,'0');
      const archives=await Promise.all([0,1].map(async index=>{
        const server=createServer(async(req,res)=>{
          const parts=[];for await(const b of req)parts.push(b);
          const {method,params,id}=JSON.parse(Buffer.concat(parts));
          const n=params[0]==='finalized'?head:Number(params[0]);
          const result=method==='eth_chainId'?'0x89':{number:'0x'+n.toString(16),hash:h(disagree && index && n===2?9:n),
            parentHash:h(n-1),timestamp:'0x'+(expiry-2+n).toString(16),logsBloom:'0x'+(possible && n===1?'f':'0').repeat(512)};
          res.end(JSON.stringify({jsonrpc:'2.0',id,result}));
        });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return server;
      }));
      const reconcile=async()=> (await promisify(execFile)(process.execPath,[process.env.H2_PROVIDER_ROOT+'/scripts/reconcile-abandoned-order.mjs',
        process.env.PGHOST,'postgres',sql('select current_user'),order,...archives.map(s=>'http://127.0.0.1:'+s.address().port)])).stdout.trim();
      try {
        assert.equal(await reconcile(),'pending'); // coverage ends before expiry
        head=4;possible=true;assert.equal(await reconcile(),'pending');
        possible=false;disagree=true;await assert.rejects(reconcile(),/disagree/);
        assert.equal(sql(`select count(*) from order_nonpayment_proofs where order_id='${order}'`),'0');
        await assert.rejects(cancel(),/reserved/);assert.equal(chips.balance(1,1),40000);
        disagree=false;
        sql(`update orders set reconciliation_lease_expires_at=clock_timestamp()+interval '1 minute' where id='${order}'`);
        assert.equal(await reconcile(),'pending');
        sql(`update orders set reconciliation_lease_expires_at=null where id='${order}'`);
        assert.equal(await reconcile(),'proof recorded');assert.equal(await reconcile(),'proof recorded');
        assert.equal(sql(`select count(*) from order_nonpayment_proofs where order_id='${order}'`),'1');
        drop=true;await assert.rejects(cancel(),/could not be reached/);assert.equal(chips.balance(1,1),40000);
        await cancel();assert.equal(chips.balance(1,1),50000);
        assert.throws(settle,/order_finality_fenced/);
      } finally {await Promise.all(archives.map(s=>new Promise(resolve=>s.close(resolve))));}
    } else if(drop) {await assert.rejects(cancel(),/could not be reached/);assert.equal(chips.balance(1,1),40000);}
    await cancel(); await cancel();
    if(!paid) assert.throws(mint,/payment_link_unavailable/);
    assert.equal(chips.balance(1,1),paid?40000:50000);assert.equal(chips.balance(1,2),paid?10000:0);
    assert.equal(db.prepare('select count(*) n from organizer_funding_receipts').get().n,paid?1:0);
    assert.equal(db.prepare('select count(*) n from organizer_funding_clearances').get().n,paid?0:1);
    assert.equal(db.prepare("select count(*) n from organizer_chip_journals where kind in ('funding_paid','funding_cancel')").get().n,1);
    db.close();
  });
}
