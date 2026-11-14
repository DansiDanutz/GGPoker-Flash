import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const BASE='http://127.0.0.1:5198';
const OUT='/Users/davidai/Desktop/DavidAi/GGPoker-flash/.r4/docs/screenshots/wallet-final';
fs.mkdirSync(OUT,{recursive:true});
const {token}=await fetch(`${BASE}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'DansiDanutz',password:'ggpoker'})}).then(r=>r.json());
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
for (const w of [320,390,768,1440,1920]) {
  const p=await b.newPage(); await p.setViewport({width:w,height:w<=430?844:w<=1024?1024:900,isMobile:w<=700,hasTouch:w<=700});
  await p.evaluateOnNewDocument(t=>{localStorage.setItem('ggpoker.token',t);localStorage.setItem('ggpoker.welcomeSeen','1');sessionStorage.setItem('ggpoker.entered','1')},token);
  await p.goto(BASE+'/#/my-page',{waitUntil:'networkidle2'});
  await p.waitForFunction(()=>document.querySelector('.mp-menu'),{timeout:20000});
  await p.evaluate(()=>{const btn=[...document.querySelectorAll('.mp-menu-item')].find(x=>x.textContent.includes('My Wallet')); btn?.click();});
  await p.waitForFunction(()=>document.querySelector('.wallet'),{timeout:10000}).catch(()=>{});
  await new Promise(r=>setTimeout(r,400));
  await p.screenshot({path:`${OUT}/${String(w).padStart(4,'0')}-wallet.png`});
  const info=await p.evaluate(()=>({ox:document.documentElement.scrollWidth-document.documentElement.clientWidth, cards:document.querySelectorAll('.wallet-card').length}));
  console.log(w, 'overflow', info.ox, 'cards', info.cards);
  await p.close();
}
await b.close();
