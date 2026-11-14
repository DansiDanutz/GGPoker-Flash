import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const BASE='http://127.0.0.1:5198';
const OUT='/Users/davidai/Desktop/DavidAi/GGPoker-flash/.r4/docs/screenshots/spin';
fs.mkdirSync(OUT,{recursive:true});
const {token}=await fetch(`${BASE}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'DansiDanutz',password:'ggpoker'})}).then(r=>r.json());
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
for (const [w,h] of [[1200,958],[768,1024],[1440,900]]) {
  const p=await b.newPage(); await p.setViewport({width:w,height:h});
  await p.evaluateOnNewDocument(t=>{localStorage.setItem('ggpoker.token',t);localStorage.setItem('ggpoker.welcomeSeen','1');sessionStorage.setItem('ggpoker.entered','1')},token);
  await p.goto(BASE+'/#/',{waitUntil:'networkidle2'});
  await p.waitForFunction(()=>document.querySelectorAll('.game-tab').length>3,{timeout:20000});
  await p.evaluate(()=>{const t=[...document.querySelectorAll('.game-tab')].find(x=>/SPIN/i.test(x.getAttribute('title')||x.textContent)); t?.click();});
  await p.waitForFunction(()=>document.querySelector('.spin-lobby, .spin-grid'),{timeout:10000}).catch(()=>{});
  await new Promise(r=>setTimeout(r,700));
  await p.screenshot({path:`${OUT}/${w}-spin.png`});
  const info=await p.evaluate(()=>({ox:document.documentElement.scrollWidth-document.documentElement.clientWidth, tiles:document.querySelectorAll('.spin-tile').length}));
  console.log(w, JSON.stringify(info));
  await p.close();
}
await b.close();
