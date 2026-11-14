import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const BASE='http://127.0.0.1:5198';
const OUT='/Users/davidai/Desktop/DavidAi/GGPoker-flash/.r4/docs/screenshots/tx-final';
fs.mkdirSync(OUT,{recursive:true});
const {token}=await fetch(`${BASE}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'DansiDanutz',password:'ggpoker'})}).then(r=>r.json());
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
for (const w of [1200,320,390,768,1440,1920]) {
  const p=await b.newPage(); await p.setViewport({width:w,height:w===1200?958:w<=430?844:w<=1024?1024:900,isMobile:w<=700,hasTouch:w<=700});
  await p.evaluateOnNewDocument(t=>{localStorage.setItem('ggpoker.token',t);localStorage.setItem('ggpoker.welcomeSeen','1');sessionStorage.setItem('ggpoker.entered','1')},token);
  await p.goto(BASE+'/#/my-page',{waitUntil:'networkidle2'});
  await p.waitForFunction(()=>document.querySelector('.mp-menu'),{timeout:20000});
  await p.evaluate(()=>{const x=[...document.querySelectorAll('.mp-menu-item')].find(b=>b.textContent.includes('Transaction History')); x?.click();});
  await p.waitForFunction(()=>document.querySelector('.txp-table tbody tr td'),{timeout:10000}).catch(()=>{});
  await new Promise(r=>setTimeout(r,400));
  await p.screenshot({path:`${OUT}/${String(w).padStart(4,'0')}-transactions.png`});
  const info=await p.evaluate(()=>({ox:document.documentElement.scrollWidth-document.documentElement.clientWidth, rows:document.querySelectorAll('.txp-table tbody tr').length, active:document.querySelector('.txp-tab.on')?.textContent}));
  console.log(w, JSON.stringify(info));
  await p.close();
}
await b.close();
