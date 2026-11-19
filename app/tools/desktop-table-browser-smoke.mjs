#!/usr/bin/env node
// Local engine-generated showdown fixtures; no production accounts or game actions.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { startSandbox } from './contributor-sandbox.mjs';
import { PokerTable } from '../server/table.js';
const artifacts=path.resolve(process.env.ARTIFACTS_DIR || 'artifacts/desktop-table');
await mkdir(artifacts,{recursive:true});
const sandbox=await startSandbox();
let browser;
const checks=[];
const card=s=>({r:s[0],s:s[1],v:'23456789TJQKA'.indexOf(s[0])+2});
function fixture(user, tableId, runs, seats, handNo, shared=false) {
  const t=new PokerTable({id:tableId,name:'Board visibility',game:'holdem',seats,sb:1,bb:2,min_buyin:40,max_buyin:400,rakePercent:0});
  t.saveHand=()=>{};
  for(let i=0;i<seats;i++) t.sit({id:i===0?user.id:`fixture-${i}`,nick:i===0?'Hero':`Player ${i+1}`},i,100);
  t.button=2; t.handNo=handNo; t.street='turn';
  t.board=(shared?['As','Ks','Qs','Js']:['2c','3d','4h','9s']).map(card);
  t.deck=(shared?['8c','9h','Ts']:['5s','Ac','Kc']).slice(3-runs).map(card);
  const holes=shared?[['2c','3c'],['2d','3d']]:[['Ah','Ad'],['Kh','Kd']];
  t.seats.forEach((s,i)=>Object.assign(s.player,{inHand:true,folded:i>1,allIn:i<2,totalBet:i<2?100:0,bet:0,stack:i<2?0:100,acted:true,cards:(holes[i]||['6c','7d']).map(card),winAmount:0}));
  t.pot=200;
  t.runout();
  for (const id of [...(t.runRound?.asked || [])]) t.decideRuns(id, runs);
  const state=t.snapshotFor(user.id);
  assert.equal(state.boards.length,runs);
  assert.ok(state.allInEquity?.players.length === 2, 'Equity is captured before the live runout');
  assert.equal(state.result.byBoard.flat().reduce((sum,w)=>sum+w.amount,0),200);
  return state;
}
try {
  const response=await fetch(sandbox.api+'/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:`boards${Date.now()}`,nick:'Board Test',password:'disposable-board-test'})});
  assert.ok(response.ok);
  const account=await response.json();
  const hosted=await fetch(sandbox.api+'/api/tables/host',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${account.token}`},body:JSON.stringify({economy:'play_money',name:'Board fixture',game:'holdem',seats:6,sb:1,bb:2,min_buyin:40,max_buyin:400})});
  assert.ok(hosted.ok);
  const table=await hosted.json();
  const mac='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath=process.env.CHROME_PATH || (existsSync(mac)?mac:execFileSync('which',['google-chrome'],{encoding:'utf8'}).trim());
  browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
  const page=await browser.newPage(); const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:1200,height:800,isMobile:false,hasTouch:false});
  await page.evaluateOnNewDocument(token=>{
    localStorage.setItem('openpoker.revealAnimation','0'); sessionStorage.setItem('ggpoker.entered','1'); localStorage.setItem('ggpoker.token',token); localStorage.setItem('ggpoker.welcomeSeen','1'); localStorage.setItem('ggpoker.sound','0');
    const Native=window.WebSocket;
    window.WebSocket=class extends Native {
      constructor(url,protocols) {super(url,protocols);this.isFixtureTable=String(url).includes('/ws?');}
      set onmessage(handler) {
        if(!this.isFixtureTable){super.onmessage=handler;return;}
        window.injectTable=message=>handler.call(this,new MessageEvent('message',{data:JSON.stringify(message)}));
        super.onmessage=event=>{if(!window.fixtureActive)handler.call(this,event);};
      }
    };
  },account.token);
  await page.goto(sandbox.url+'/#/table/'+encodeURIComponent(table.id)+'?observe=1');
  await page.waitForFunction(()=>typeof window.injectTable==='function');
  await page.waitForSelector('.ls-content:not([inert])');
  await page.waitForSelector('.ls',{hidden:true});
  const waiting = { ...fixture(account.user,table.id,2,6,1), street:'preflop', boards:null, result:null, allInEquity:null, actor:null, actionEndsAt:Date.now()+300000, actionTimeMs:300000 };
  waiting.players=waiting.players.map(p=>({...p,allIn:false,folded:false,stack:10000,winAmount:0}));
  await page.evaluate(state=>{window.fixtureActive=true;window.injectTable({type:'joined',tableId:state.id,seat:0,observe:false});window.injectTable({type:'state',state});},waiting);

  for (const seats of [6,9]) for (const tournament of [false,true]) for (const [width,height] of [[1200,800],[900,650],[761,640],[760,640],[600,640],[500,640],[360,640]]) {
    await page.setViewport({width,height,isMobile:false,hasTouch:false});
    const populated=fixture(account.user,table.id,2,seats,seats);
    const state={...waiting,players:populated.players.map(p=>({...p,allIn:false,folded:false,stack:10000,winAmount:0})),seats,street:'river',tournament:tournament?{id:'fixture-tournament',name:'Desktop tournament',prizePool:600,level:1,winner:null}:null,actor:account.user.id};
    state.players=state.players.map(p=>({...p,cards:p.isMe?['Ah','Ad']:['??','??'],reveal:false,shown:[]}));
    await page.evaluate(state=>window.injectTable({type:'state',state}),state);
    await page.waitForSelector('.main-actions');await new Promise(r=>setTimeout(r,400));
    const geometry=await page.evaluate(()=>{
      const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
      const visible=n=>n.getBoundingClientRect().width&&n.getBoundingClientRect().height&&getComputedStyle(n).display!=='none';
      const overlaps=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
      const foreignCardOverlaps=[...document.querySelectorAll('.seat .pcard')].filter(visible).filter(c=>[...document.querySelectorAll('.seat .plate')].some(p=>p.closest('.seat')!==c.closest('.seat')&&overlaps(rect(c),rect(p)))).length;
      const identityFonts=[...document.querySelectorAll('.seat .plate .nm,.seat .plate .st')].map(n=>parseFloat(getComputedStyle(n).fontSize)*n.getBoundingClientRect().height/n.offsetHeight);
      const heroCards = [...document.querySelectorAll(".seat.me .cards .pcard")].map(rect);
      return {heroCards,identityFonts,foreignCardOverlaps,width:innerWidth,height:innerHeight,stage:document.querySelector('.table-stage').className,cards:[...document.querySelectorAll('.pcard')].filter(visible).map(n=>({rect:rect(n),shadow:getComputedStyle(n).boxShadow})),plates:[...document.querySelectorAll('.seat .plate')].map(rect),actions:[...document.querySelectorAll('.main-actions .act-btn,.main-actions .quick-bets button,.main-actions .bet-step,.main-actions .amount-input,.tchat-toggle')].filter(visible).map(n=>({label:n.getAttribute('aria-label')||n.textContent,rect:rect(n)}))};
    });
    await writeFile(path.join(artifacts,'latest-geometry.json'),JSON.stringify(geometry,null,2));
    await page.screenshot({path:path.join(artifacts,'latest.png')});
    assert.match(geometry.stage,/stage-wide/);
    assert.equal(geometry.heroCards.length, 2);
    assert.ok(Math.abs(geometry.heroCards[1].left - geometry.heroCards[0].left) >= geometry.heroCards[0].width * .5, "Both hero card ranks remain independently visible");
    assert.ok(geometry.identityFonts.every(size=>size>=10.9),'Player identities retain at least 11px effective text at compact desktop sizes');
    assert.equal(geometry.foreignCardOverlaps,0,'Cards must not obscure another player name or stack');
    assert.ok(geometry.cards.length>=17,'Populated six-seat table and board');
    assert.ok(geometry.cards.every(c=>c.shadow==='none'),'Cards have no legacy edge shadow');
    const overlaps=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
    for(const control of geometry.actions){const r=control.rect;assert.ok(r.left>=-1&&r.right<=width+1&&r.top>=0&&r.bottom<=height+1,`Control fits: ${control.label}`);assert.ok(!geometry.plates.some(p=>overlaps(r,p)),`Control avoids player labels: ${control.label}`);}
    for(let i=0;i<geometry.actions.length;i++)for(let j=i+1;j<geometry.actions.length;j++)assert.ok(!overlaps(geometry.actions[i].rect,geometry.actions[j].rect),`Controls overlap: ${geometry.actions[i].label}/${geometry.actions[j].label}`);
    await page.screenshot({path:path.join(artifacts,`${tournament?'tournament':'cash'}-${seats}-${width}.png`)});
    checks.push({seats,tournament,width,height,geometry});
    await page.evaluate(state=>window.injectTable({type:'state',state:{...state,actor:state.players.find(p=>!p.isMe).id}}),state);
    await page.waitForSelector('.reserved-actions');assert.equal(await page.$('.main-actions'),null,'Betting only on own turn');
  }
  assert.deepEqual(errors,[]);await writeFile(path.join(artifacts,'results.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({ok:true,cases:checks.length,artifacts}));
}finally{await browser?.close();await sandbox.close();}
