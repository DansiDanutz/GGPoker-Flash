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
const desktop=process.env.DESKTOP_TABLE==='1';
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
  browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox']});
  const page=await browser.newPage(); const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport(desktop ? {width:1200,height:800,isMobile:false,hasTouch:false} : {width:390,height:844,isMobile:true,hasTouch:true});
  await page.evaluateOnNewDocument((token, desktop)=>{
    if (desktop) window.ggDesktop = {};
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
  },account.token,desktop);
  await page.goto(sandbox.url+'/#/table/'+encodeURIComponent(table.id)+'?observe=1');
  await page.waitForFunction(()=>typeof window.injectTable==='function');
  await page.waitForSelector('.ls-content:not([inert])');
  if (!desktop) {
  const waiting = { ...fixture(account.user,table.id,2,6,1), street:'preflop', boards:null, result:null, allInEquity:null, actor:null, actionEndsAt:Date.now()+300000, actionTimeMs:300000 };
  waiting.players=waiting.players.map(p=>({...p,allIn:false,folded:false,stack:10000,winAmount:0}));
  await page.evaluate(state=>{window.fixtureActive=true;window.injectTable({type:'joined',tableId:state.id,seat:0,observe:false});window.injectTable({type:'state',state});},waiting);
  await page.waitForSelector('.tchat-swipe-handle');
  for (const sheet of [false,true]) {
    await page.evaluate(state=>window.injectTable({type:'state',state}),waiting);
    await page.waitForFunction(()=>!document.querySelector('.tchat-dock.betting-active'));
    await page.evaluate(()=>document.querySelector('.tchat-swipe-handle').click());
    await page.waitForSelector('.tchat-dock.tools-open');
    if(sheet){await page.evaluate(()=>document.querySelector('[aria-label="Bet presets"]').click());await page.waitForSelector('.topt-sheet');}
    await page.evaluate(state=>window.injectTable({type:'state',state:{...state,actor:state.players.find(p=>p.isMe).id}}),waiting);
    await page.waitForSelector('.action-bar .main-actions');
    await page.waitForFunction(()=>!document.querySelector('.topt-sheet') && getComputedStyle(document.querySelector('.tchat-dock')).visibility==='hidden' && Math.abs(parseFloat(getComputedStyle(document.querySelector('.action-bar')).bottom))<1);
    await page.evaluate(state=>window.injectTable({type:'state',state}),waiting);
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.tchat-dock')).visibility==='visible');
    if(!sheet) assert.ok(await page.$('.tchat-dock.tools-open'),'Expanded tools return after acting');
    if(!sheet) await page.evaluate(()=>document.querySelector('.tchat-swipe-handle').click());
  }
  await page.evaluate(()=>document.querySelector('.tchat-swipe-handle').click());
  await page.waitForSelector('.tchat-keep');
  await page.click('.tchat-keep');
  await page.evaluate(state=>window.injectTable({type:'state',state:{...state,actor:state.players.find(p=>p.isMe).id}}),waiting);
  await page.waitForSelector('.tchat-dock.tools-pinned.betting-active');
  await page.waitForFunction(()=>Math.abs(parseFloat(getComputedStyle(document.querySelector('.action-bar')).bottom)-44)<1);
  assert.equal(await page.$eval('.tchat-dock', n=>getComputedStyle(n).visibility),'visible','Pinned tools stay available during betting');
  assert.ok(await page.evaluate(()=>{const a=document.querySelector('.action-bar').getBoundingClientRect();return [...document.querySelectorAll('.tchat-buttons .tchat-toggle')].every(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=a.bottom;});}),'Pinned tools fit below betting controls without overlap');
  assert.equal(await page.evaluate(()=>localStorage.getItem('openpoker.keepTableToolsExtended')),'1');
  await page.evaluate(state=>window.injectTable({type:'state',state}),waiting);
  await page.waitForSelector('.tchat-keep',{visible:true});
  for (const width of [320,390,430]) {
    await page.setViewport({width,height:760,isMobile:true,hasTouch:true});
    await page.waitForSelector('.reserved-actions button',{visible:true});
    await new Promise(r=>setTimeout(r,300));
    assert.ok(await page.evaluate(()=>{
      const r=document.querySelector('.reserved-actions button').getBoundingClientRect();
      const d=document.querySelector('.tchat-dock').getBoundingClientRect();
      return r.top>=d.top&&r.bottom<=d.bottom&&[...document.querySelectorAll('.tchat-keep,.tchat-swipe-handle,.tchat-toggle')].every(n=>{
        const b=n.getBoundingClientRect();return r.right<=b.left||r.left>=b.right||r.bottom<=b.top||r.top>=b.bottom;
      });
    }),'Pinned Check/Fold fits inside drawer without overlapping tools');
  }
  await page.click('.reserved-actions button');
  assert.equal(await page.$eval('.reserved-actions button',n=>n.getAttribute('aria-pressed')),'true');
  await page.click('.reserved-actions button');
  await page.click('.tchat-keep');
  assert.equal(await page.$eval('.tchat-keep',n=>n.getAttribute('aria-pressed')),'false');
  }
  let handNo=40;
  for (const [runs,seats,shared] of [[2,6,false],[3,9,false],[2,6,true]]) {
    await page.setViewport(desktop ? {width:1200,height:800,isMobile:false,hasTouch:false} : {width:390,height:760,isMobile:true,hasTouch:true});
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
    assert.equal(await page.$$eval('.allin-equity', nodes=>nodes.length),2, 'Revealed all-in contenders show equity');
    assert.ok(await page.$$eval('.allin-equity', nodes=>nodes.every(n=>/Equity.*[0-9]+\.[0-9]%/.test(n.textContent))), 'Equity labels show percentages');
    await page.evaluate(result => {
      window.payoutObserver?.disconnect();
      window.payoutFlights = [];
      window.payoutObserver = new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.matches('.payout-share')) window.payoutFlights.push({board:Number(node.dataset.board),seat:Number(node.dataset.seat),amount:Number(node.dataset.amount)});
        }
      });
      window.payoutObserver.observe(document.querySelector('.table-stage'), {childList:true});
      window.injectTable({type:'event',event:{type:'win',...result}});
    }, state.result);
    const plan=runSchedule(state.boards);
    const firstBoardFinished=Math.max(...plan.delays[0].filter(d=>d!==null))+700;
    await new Promise(resolve=>setTimeout(resolve,firstBoardFinished));
    assert.equal(await page.$$eval('.board-outcomes > span',nodes=>nodes.length),1,'First marker appears after board one, before later boards');
    assert.equal(await page.$('.multi-board.current'),null,'Marker does not wait for the final payout sequence');
    assert.ok(await page.$$eval('.multi-board[data-board="1"] .focus-on',n=>n.length)>0,'Completed board highlights its winning cards immediately');
    assert.equal(await page.$$eval('.multi-board[data-board="2"] .focus-on',n=>n.length),0,'Future board does not reveal its winning hand early');
    await new Promise(resolve=>setTimeout(resolve,plan.resultAt[0]+180-firstBoardFinished));
    assert.equal(await page.$eval('.multi-board.current', n => Number(n.dataset.board)), 1);
    assert.ok(await page.$eval('.multi-board[data-board="2"] .board', n => Number(getComputedStyle(n).opacity)) < .6, 'Other boards are dimmed during the current award');
    const firstShares = await page.$$eval('.payout-share[data-board="1"]', nodes => nodes.map(n => Number(n.dataset.amount)));
    assert.ok(await page.evaluate(()=>{
      const stage=document.querySelector('.table-stage').getBoundingClientRect();
      const row=document.querySelector('.multi-board[data-board="1"]').getBoundingClientRect();
      return [...document.querySelectorAll('.payout-share[data-board="1"]')].every(n=>Math.abs(parseFloat(n.style.left)-(row.left+row.width/2-stage.left))<1 && Math.abs(parseFloat(n.style.top)-(row.top+row.height/2-stage.top))<1);
    }), 'Board payout chips start at the highlighted board');
    if (shared) assert.equal(await page.$$eval('.payout-share', nodes => nodes.flatMap(n => n.getAnimations()).length), 0, 'Reduced motion shows awards without moving chips');
    assert.equal(firstShares.reduce((a,b)=>a+b,0), state.result.byBoard[0].reduce((a,w)=>a+w.amount,0), 'Only board one pot shares move at its award');
    assert.equal(await page.$$eval('.payout-share[data-board="2"]', nodes => nodes.length), 0, 'Board two cannot pay during board one');
    assert.equal(await page.$eval('.pot-label strong', n => Number(n.dataset.amount)), state.result.byBoard.slice(1).flat().reduce((sum,w)=>sum+w.amount,0), 'The pot removes board one share');
    const flights=await page.$$eval('.multi-board[data-board="1"] .board-particles',nodes=>nodes.map(n=>{
      const r=n.getBoundingClientRect(), stage=document.querySelector('.table-stage').getBoundingClientRect(), css=getComputedStyle(n);
      return {seat:Number(n.dataset.seat),x:(r.left+parseFloat(css.getPropertyValue('--award-x'))-stage.left)/stage.width*100,y:(r.top+parseFloat(css.getPropertyValue('--award-y'))-stage.top)/stage.height*100,display:css.display};
    }));
    assert.deepEqual(flights.map(f=>f.seat).sort(),[...new Set(state.result.byBoard[0].map(w=>w.seat))].sort());
    for(const flight of flights) {
      if(shared) assert.equal(flight.display,'none');
      else {
        const [x,y]=seatLayout(seats,desktop?'wide':'portrait')[flight.seat];
        assert.ok(Math.abs(flight.x-x)<1 && Math.abs(flight.y-y)<1,`Particle missed its winning seat: ${JSON.stringify(flight)}`);
      }
    }
    await page.screenshot({path:path.join(artifacts,`particles-${runs}-${shared?'reduced':'animated'}.png`)});
    for(let board=1;board<runs;board++) {
      await new Promise(resolve=>setTimeout(resolve,plan.resultAt[board]-plan.resultAt[board-1]));
      assert.equal(await page.$eval('.multi-board.current', n => Number(n.dataset.board)), board+1, `Board ${board+1} is highlighted in turn`);
      const remaining=state.result.byBoard.slice(board+1).flat().reduce((sum,w)=>sum+w.amount,0);
      assert.equal(await page.$eval('.pot-label strong', n => Number(n.dataset.amount)),remaining,`The pot removes board ${board+1} share`);
    }
    await new Promise(resolve=>setTimeout(resolve,plan.done-plan.resultAt.at(-1)+150));
    assert.equal(await page.$$eval('.multi-board.awarded',nodes=>nodes.length),runs,'Repeated snapshots must not restart the result sequence');
    assert.equal(await page.$('.allin-equity'), null, 'Frozen equity clears when results settle');
    assert.equal(await page.$('.win-overlay'), null, 'Per-board awards are not covered by an aggregate win banner');
    const paid = await page.evaluate(() => window.payoutFlights);
    const expected = state.result.byBoard.flatMap((winners, board) => winners.filter(w => w.amount > 0).map(w => ({board:board+1,seat:w.seat,amount:w.amount})));
    assert.deepEqual(paid, expected, 'Each board share animates exactly once, without a second aggregate payout');
    const outcomes=await page.$$eval('.board-outcomes > span', nodes=>nodes.map(n=>({seat:Number(n.parentElement.dataset.seat),board:Number(n.querySelector('small').textContent)-1,label:n.getAttribute('aria-label'),won:n.classList.contains('won'),text:n.textContent})));
    assert.equal(outcomes.length,runs,'Only the local player retains one result per board');
    assert.ok(outcomes.every(o=>o.seat===0),'Opponents never show result emoticons');
    for(const outcome of outcomes) {
      assert.equal(outcome.won,state.result.byBoard[outcome.board].some(w=>w.seat===outcome.seat));
      assert.ok(outcome.text.includes(outcome.won?'👌':'👎'));
    }
    assert.equal(await page.$('.board-win-count'),null,'No redundant boards-won text');
    for(const player of state.players.filter(p=>p.winAmount>0)) {
      assert.equal(await page.$eval(`.win-amount[data-seat="${player.seat}"]`,n=>Number(n.dataset.amount)),player.winAmount,'Only the total credited amount remains by each winner');
    }
    for(const [width,height] of (desktop ? [[600,640],[900,700],[1200,800]] : [[320,568],[390,760],[430,900]])) {
      await page.setViewport({width,height,isMobile:!desktop,hasTouch:!desktop});
      await new Promise(resolve=>setTimeout(resolve,180));
      const geometry=await page.evaluate(()=>{
        const box=n=>{const r=n.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
        const cards=[...document.querySelectorAll('.multi-board .pcard')].map(box);
        const seats=[...document.querySelectorAll('.seat .avatar-wrap,.seat .plate,.seat .cards')].map(box);
        const labels=[...document.querySelectorAll('.win-amount,.board-outcomes')].map(box);
        const labelOverlaps=labels.filter(c=>seats.some(s=>s.width>0&&s.height>0&&c.left<s.right&&c.right>s.left&&c.top<s.bottom&&c.bottom>s.top));
        return {labels,labelOverlaps,cards,overlaps:cards.filter(c=>seats.some(s=>s.width>0&&s.height>0&&c.left<s.right&&c.right>s.left&&c.top<s.bottom&&c.bottom>s.top)),viewport:{width:innerWidth,height:innerHeight}};
      });
      assert.equal(geometry.cards.length,runs*5);
      if(desktop) assert.equal(geometry.labelOverlaps.length,0,'Desktop award labels must not cover cards or player identities');
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
  await page.waitForFunction(()=>!document.querySelector('.board-win-count,.board-particles,.multi-board,.board-outcomes'));
  assert.deepEqual(errors,[]);
  await writeFile(path.join(artifacts,'results.json'),JSON.stringify({ok:true,checks,errors},null,2));
  console.log(JSON.stringify({ok:true,checks,artifacts},null,2));
} finally {await browser?.close();await sandbox.close();}
