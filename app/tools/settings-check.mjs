import puppeteer from 'puppeteer-core';
const BASE='http://127.0.0.1:5198';
const {token}=await fetch(`${BASE}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'DansiDanutz',password:'ggpoker'})}).then(r=>r.json());
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:1200,height:900});
await p.evaluateOnNewDocument(t=>{localStorage.setItem('ggpoker.token',t);localStorage.setItem('ggpoker.welcomeSeen','1');sessionStorage.setItem('ggpoker.entered','1')},token);
await p.goto(BASE+'/#/settings',{waitUntil:'networkidle2'});
await p.waitForFunction(()=>document.querySelector('.settings-window'),{timeout:20000});
const before=await p.evaluate(()=>document.querySelector('.settings-actions span')?.textContent);
await p.evaluate(()=>{const c=document.querySelector('input[type=checkbox]'); c?.click();});
await new Promise(r=>setTimeout(r,300));
const state=await p.evaluate(()=>({label:document.querySelector('.settings-actions span')?.textContent, apply:[...document.querySelectorAll('.settings-actions button')].find(b=>b.textContent==='Apply')?.disabled}));
// revert so the demo settings stay untouched
await p.evaluate(()=>{const c=document.querySelector('input[type=checkbox]'); c?.click();});
await new Promise(r=>setTimeout(r,200));
const reverted=await p.evaluate(()=>document.querySelector('.settings-actions span')?.textContent);
console.log(JSON.stringify({before,state,reverted}));
await b.close();
