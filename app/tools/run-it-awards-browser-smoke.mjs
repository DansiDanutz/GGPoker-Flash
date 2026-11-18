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
import { runSchedule } from '../src/game/runItPacing.ts';
import { seatLayout } from '../src/game/tableStage.ts';
const artifacts=path.resolve(process.env.ARTIFACTS_DIR || 'artifacts/run-it-awards');
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
  t.runoutMulti(runs);
  const state=t.snapshotFor(user.id);
  assert.equal(state.boards.length,runs);
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
  browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox']});
  const page=await browser.newPage(); const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await page.evaluateOnNewDocument(token=>{
    sessionStorage.setItem('ggpoker.entered','1'); localStorage.setItem('ggpoker.token',token); localStorage.setItem('ggpoker.welcomeSeen','1'); localStorage.setItem('ggpoker.sound','0');
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
  let handNo=40;
  for (const [runs,seats,shared] of [[2,6,false],[3,9,false],[2,6,true]]) {
    await page.setViewport({width:390,height:760,isMobile:true,hasTouch:true});
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:shared?'reduce':'no-preference'}]);
    const state=fixture(account.user,table.id,runs,seats,++handNo,shared);
    await page.evaluate(state=>{
      window.fixtureActive=true;
      clearInterval(window.fixtureRefresh);
      window.injectTable({type:'joined',tableId:state.id,seat:0,observe:false});
      const refresh=()=>window.injectTable({type:'state',state:{...state,now:Date.now()}});
      refresh(); window.fixtureRefresh=setInterval(refresh,250);
    },state);
    await page.waitForSelector('.multi-board');
    const plan=runSchedule(state.boards);
    await new Promise(resolve=>setTimeout(resolve,plan.resultAt[0]+180));
    const flights=await page.$$eval('.multi-board[data-board="1"] .board-particles',nodes=>nodes.map(n=>{
      const r=n.getBoundingClientRect(), stage=document.querySelector('.table-stage').getBoundingClientRect(), css=getComputedStyle(n);
      return {seat:Number(n.dataset.seat),x:(r.left+parseFloat(css.getPropertyValue('--award-x'))-stage.left)/stage.width*100,y:(r.top+parseFloat(css.getPropertyValue('--award-y'))-stage.top)/stage.height*100,display:css.display};
    }));
    assert.deepEqual(flights.map(f=>f.seat).sort(),[...new Set(state.result.byBoard[0].map(w=>w.seat))].sort());
    for(const flight of flights) {
      if(shared) assert.equal(flight.display,'none');
      else {
        const [x,y]=seatLayout(seats,'portrait')[flight.seat];
        assert.ok(Math.abs(flight.x-x)<1 && Math.abs(flight.y-y)<1,`Particle missed its winning seat: ${JSON.stringify(flight)}`);
      }
    }
    await page.screenshot({path:path.join(artifacts,`particles-${runs}-${shared?'reduced':'animated'}.png`)});
    await new Promise(resolve=>setTimeout(resolve,plan.done-plan.resultAt[0]+150));
    assert.equal(await page.$$eval('.multi-board.awarded',nodes=>nodes.length),runs,'Repeated snapshots must not restart the result sequence');
    const expectedCounts=new Map();
    for(const winners of state.result.byBoard) {
      const seatsWon=[...new Set(winners.map(w=>w.seat))];
      for(const seat of seatsWon) {
        const count=expectedCounts.get(seat)||{won:0,shared:0};
        count[seatsWon.length>1?'shared':'won']++; expectedCounts.set(seat,count);
      }
    }
    for(const [seat,count] of expectedCounts) {
      const label=await page.$eval(`.board-win-count[data-seat="${seat}"]`,n=>n.textContent);
      if(count.won) assert.match(label,new RegExp(`${count.won} boards? won`));
      if(count.shared) assert.match(label,new RegExp(`${count.shared} boards? shared`));
    }
    for(const [width,height] of [[320,568],[390,760],[430,900],[844,390]]) {
      await page.setViewport({width,height,isMobile:true,hasTouch:true});
      await new Promise(resolve=>setTimeout(resolve,180));
      const geometry=await page.evaluate(()=>{
        const box=n=>{const r=n.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
        const cards=[...document.querySelectorAll('.multi-board .pcard')].map(box);
        const seats=[...document.querySelectorAll('.seat .avatar-wrap,.seat .plate,.seat .cards')].map(box);
        return {cards,overlaps:cards.filter(c=>seats.some(s=>s.width>0&&s.height>0&&c.left<s.right&&c.right>s.left&&c.top<s.bottom&&c.bottom>s.top)),viewport:{width:innerWidth,height:innerHeight}};
      });
      assert.equal(geometry.cards.length,runs*5);
      assert.ok(geometry.cards.every(c=>c.width>=24&&c.height>=32&&c.left>=0&&c.top>=0&&c.right<=width+1&&c.bottom<=height+1),JSON.stringify(geometry));
      assert.equal(geometry.overlaps.length,0,`Cards overlap seats at ${runs} boards/${seats} seats/${width}: ${JSON.stringify(geometry)}`);
      await page.screenshot({path:path.join(artifacts,`boards-${runs}-seats-${seats}-${shared?'shared-':''}${width}.png`)});
      checks.push({runs,seats,shared,width,height,cards:geometry.cards.length});
    }
  }
  const nextHand=fixture(account.user,table.id,2,6,++handNo);
  await page.evaluate(state=>{
    clearInterval(window.fixtureRefresh);
    window.injectTable({type:'state',state:{...state,street:'idle',board:[],boards:null,result:null,now:Date.now()}});
  },nextHand);
  await page.waitForFunction(()=>!document.querySelector('.board-win-count,.board-particles,.multi-board'));
  assert.deepEqual(errors,[]);
  await writeFile(path.join(artifacts,'results.json'),JSON.stringify({ok:true,checks,errors},null,2));
  console.log(JSON.stringify({ok:true,checks,artifacts},null,2));
} finally {await browser?.close();await sandbox.close();}
