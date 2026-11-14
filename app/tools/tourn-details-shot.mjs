import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const BASE='http://127.0.0.1:5198';
const OUT='/Users/davidai/Desktop/DavidAi/GGPoker-flash/.r4/docs/screenshots/tourn-details';
fs.mkdirSync(OUT,{recursive:true});
const {token}=await fetch(`${BASE}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'DansiDanutz',password:'ggpoker'})}).then(r=>r.json());
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
for (const w of [1200,768]) {
  const p=await b.newPage(); await p.setViewport({width:w,height:w===1200?958:w<=430?844:1024,isMobile:w<=700,hasTouch:w<=700});
  await p.evaluateOnNewDocument(t=>{localStorage.setItem('ggpoker.token',t);localStorage.setItem('ggpoker.welcomeSeen','1');sessionStorage.setItem('ggpoker.entered','1')},token);
  await p.goto(BASE+'/#/tournaments',{waitUntil:'networkidle2'});
  await p.waitForFunction(()=>document.querySelector('.tref-row'),{timeout:20000});
  await p.evaluate(()=>{const r=document.querySelectorAll('.tref-row')[1]; r?.click();});
  await new Promise(r=>setTimeout(r,500));
  await p.screenshot({path:`${OUT}/${w}-details.png`});
  const info=await p.evaluate(()=>({ox:document.documentElement.scrollWidth-document.documentElement.clientWidth, title:document.querySelector('.tref-detail h3')?.textContent, panel:document.querySelector('.tref-side-tabs .on')?.textContent}));
  console.log(w, JSON.stringify(info));
  await p.close();
}
await b.close();
