import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const BASE='http://127.0.0.1:5198';
const OUT='/Users/davidai/Desktop/DavidAi/GGPoker-flash/.r4/docs/screenshots/settings-pages';
fs.mkdirSync(OUT,{recursive:true});
const {token}=await fetch(`${BASE}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'DansiDanutz',password:'ggpoker'})}).then(r=>r.json());
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
for (const [w,h] of [[1200,958],[390,844]]) {
  const p=await b.newPage(); await p.setViewport({width:w,height:h,isMobile:w<700,hasTouch:w<700});
  await p.evaluateOnNewDocument(t=>{localStorage.setItem('ggpoker.token',t);localStorage.setItem('ggpoker.welcomeSeen','1');sessionStorage.setItem('ggpoker.entered','1')},token);
  await p.goto(BASE+'/#/settings',{waitUntil:'networkidle2'});
  await p.waitForSelector('.settings-window .mp-menu-item',{timeout:20000});
  await new Promise(r=>setTimeout(r,500));
  await p.screenshot({path:`${OUT}/${w}-settings.png`});
  const items=await p.$$('.mp-menu-item');
  let clicked=null;
  for (const it of items) { const txt=await it.evaluate(e=>e.textContent); if (/Card Squeeze/.test(txt||'')) { await it.click(); clicked=txt; break; } }
  await new Promise(r=>setTimeout(r,900));
  await p.screenshot({path:`${OUT}/${w}-squeeze.png`});
  const info=await p.evaluate(()=>({ox:document.documentElement.scrollWidth-document.documentElement.clientWidth, items:document.querySelectorAll('.mp-menu-item').length, title:document.querySelector('.settings-title')?.textContent, flash:!!document.querySelector('.settings-flash'), act:document.activeElement?.textContent?.slice(0,40)}));
  console.log(w, clicked, JSON.stringify(info));
  await p.close();
}
await b.close();
