#!/usr/bin/env node
// Exercise table menu commands using disposable Play Money accounts.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { startSandbox } from './contributor-sandbox.mjs';
const artifacts=path.resolve(process.env.ARTIFACTS_DIR || 'artifacts/table-menu');
await mkdir(artifacts,{recursive:true});
const sandbox=await startSandbox();
let browser;
try {
  const response=await fetch(sandbox.api+'/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:`boards${Date.now()}`,nick:'Board Test',password:'disposable-board-test'})});
  assert.ok(response.ok);
  const account=await response.json();
  const hosted=await fetch(sandbox.api+'/api/tables/host',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${account.token}`},body:JSON.stringify({economy:'play_money',name:'Board fixture',game:'holdem',seats:6,sb:1,bb:2,min_buyin:40,max_buyin:400})});
  assert.ok(hosted.ok);
  const table=await hosted.json();
  const mac='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath=process.env.CHROME_PATH || (existsSync(mac)?mac:execFileSync('which',['google-chrome'],{encoding:'utf8'}).trim());
  browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox']});
  const page=await browser.newPage(); const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.evaluateOnNewDocument(token=>{
    localStorage.setItem('openpoker.revealAnimation','0'); sessionStorage.setItem('ggpoker.entered','1'); localStorage.setItem('ggpoker.token',token); localStorage.setItem('ggpoker.welcomeSeen','1'); localStorage.setItem('ggpoker.sound','0');
    const Native=window.WebSocket;
    window.WebSocket=class extends Native {
      constructor(url,protocols) {super(url,protocols);this.isFixtureTable=new URL(url,location.href).pathname==='/ws';if(this.isFixtureTable)window.menuSocket=this;}
      set onmessage(handler) {
        if(!this.isFixtureTable){super.onmessage=handler;return;}
        window.injectTable=message=>handler.call(this,new MessageEvent('message',{data:JSON.stringify(message)}));
        super.onmessage=event=>{const m=JSON.parse(event.data);if(m.type==='state')window.menuState=m.state;if(m.type==='error')window.menuError=m.error;if(!window.fixtureActive)handler.call(this,event);};
      }
    };
  },account.token);
  await page.goto(sandbox.url+'/#/table/'+encodeURIComponent(table.id)+'?buyin=100');
  await page.waitForFunction(()=>typeof window.injectTable==='function');
  await page.waitForSelector('.ls-content:not([inert])');

  await page.waitForFunction(()=>window.menuState?.players.some(p=>p.isMe));
  async function menu(label) {
    if(!await page.$('.table-menu')) await page.click('.table-menu-btn');
    const clicked=await page.evaluate(text=>{const b=[...document.querySelectorAll('.table-menu button')].find(b=>b.textContent.replace('✓','').trim()===text);if(!b||b.disabled)return false;b.click();return true;},label);
    assert.ok(clicked,`Menu command available: ${label}`);
  }
  const me=()=>page.evaluate(()=>window.menuState.players.find(p=>p.isMe));
  await menu('Sit out next hand');
  await page.waitForFunction(()=>{const p=window.menuState.players.find(p=>p.isMe);return p?.sitOutNext||p?.sittingOut;});
  console.log('PASS sit-out command acknowledged');
  await page.evaluate(()=>{window.menuFold=setInterval(()=>{const s=window.menuState,p=s?.players.find(p=>p.isMe);if(p&&s.actor===p.id)window.menuSocket.send(JSON.stringify({type:'action',tableId:s.id,action:'fold',amount:0,handNo:s.handNo,turnNo:s.turnNo}));},200);});
  await page.waitForFunction(()=>{const p=window.menuState.players.find(p=>p.isMe);return p?.sittingOut&&!p.inHand;},{timeout:60000});
  await page.evaluate(()=>clearInterval(window.menuFold));
  console.log('PASS next deal excludes the sitting-out player');

  await menu((await me()).sittingOut?'Post blinds / sit in':'Sitting out next hand');
  await page.waitForFunction(()=>{const p=window.menuState.players.find(p=>p.isMe);return p&&!p.sitOutNext&&!p.sittingOut;});
  for(const [label,field] of [['Sit out next big blind','sitOutNextBigBlind'],['Sit out at all tables','sitOutAll']]) {
    await menu(label);await page.waitForFunction(f=>window.menuState.players.find(p=>p.isMe)?.[f]===true,{},field);
    await menu(label);await page.waitForFunction(f=>window.menuState.players.find(p=>p.isMe)?.[f]===false,{},field);
    console.log('PASS toggle',label);
  }
  for(const label of ['Auto rebuy','Hotkeys','Four-colour deck','Auto-muck losing hand','Offer to run it more than once']) {
    await menu(label);await menu(label);console.log('PASS click/toggle',label);
  }
  for(const label of ['Deal','Flip','Slide','Off','Bottom bar','Side panel','Floating']) {await menu(label);console.log('PASS select',label);}
  await menu('Bottom bar');await menu('Deal');
  await menu('Disable animations');await menu('Enable animations');
  await menu('Shuffle chips');await menu('FX preview');
  await page.click('.table-menu-btn');
  assert.equal(await page.$eval('.table-menu-btn',n=>getComputedStyle(n).webkitTapHighlightColor),'rgba(0, 0, 0, 0)');
  const controls=await page.$$eval('.table-menu button',bs=>bs.map(b=>({text:b.textContent.trim(),disabled:b.disabled})));
  await writeFile(path.join(artifacts,'menu-controls.json'),JSON.stringify({controls,errors},null,2));
  await menu('Leave table after this hand');
  await page.evaluate(()=>{window.menuFold=setInterval(()=>{const s=window.menuState,p=s?.players.find(p=>p.isMe);if(p&&s.actor===p.id)window.menuSocket.send(JSON.stringify({type:'action',tableId:s.id,action:'fold',amount:0,handNo:s.handNo,turnNo:s.turnNo}));},200);});
  await page.waitForFunction(()=>!window.menuState.players.some(p=>p.isMe),{timeout:60000});
  await page.evaluate(()=>clearInterval(window.menuFold));
  console.log('PASS leave-after-hand releases the seat');
  assert.deepEqual(errors,[]);
  console.log('PASS menu browser audit');
} finally { await browser?.close(); await sandbox.close(); }
