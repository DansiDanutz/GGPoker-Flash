import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const BASE='http://127.0.0.1:5198';
const OUT='/Users/davidai/Desktop/DavidAi/GGPoker-flash/.r4/docs/screenshots/tourn-table';
fs.mkdirSync(OUT,{recursive:true});
const login=await fetch(`${BASE}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'DansiDanutz',password:'ggpoker'})}).then(r=>r.json());
const auth={authorization:`Bearer ${login.token}`,'content-type':'application/json'};
const list=await fetch(`${BASE}/api/tournaments`).then(r=>r.json());
const t=list.tournaments.find(x=>x.status==='registering')||list.tournaments[0];
await fetch(`${BASE}/api/tournaments/${encodeURIComponent(t.id)}/register`,{method:'POST',headers:auth}).catch(()=>{});
const play=await fetch(`${BASE}/api/tournaments/${encodeURIComponent(t.id)}/play`,{method:'POST',headers:auth}).then(r=>r.json());
console.log('tournament',t.id,t.name,'table',play.tableId,play.error||'');
if(!play.tableId) process.exit(1);
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
for (const [w,h] of [[1200,900],[1440,900]]) {
  const p=await b.newPage(); await p.setViewport({width:w,height:h});
  await p.evaluateOnNewDocument(tk=>{localStorage.setItem('ggpoker.token',tk);localStorage.setItem('ggpoker.welcomeSeen','1');sessionStorage.setItem('ggpoker.entered','1')},login.token);
  await p.goto(`${BASE}/#/table/${play.tableId}`,{waitUntil:'networkidle2'});
  await new Promise(r=>setTimeout(r,3500));
  await p.evaluate(()=>{document.querySelectorAll('[class*=toast]').forEach(e=>e.remove());});
  await p.screenshot({path:`${OUT}/${w}-tourn-table.png`});
  const info=await p.evaluate(()=>({hud:!!document.querySelector('.tt-hud'), ox:document.documentElement.scrollWidth-document.documentElement.clientWidth, text:document.querySelector('.tt-hud')?.textContent?.slice(0,120)}));
  console.log(w, JSON.stringify(info));
  await p.close();
}
await b.close();
