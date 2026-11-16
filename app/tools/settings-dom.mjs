import puppeteer from 'puppeteer-core';
const BASE='http://127.0.0.1:5198';
const {token}=await fetch(`${BASE}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'DansiDanutz',password:'ggpoker'})}).then(r=>r.json());
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:1200,height:900});
await p.evaluateOnNewDocument(t=>{localStorage.setItem('ggpoker.token',t);localStorage.setItem('ggpoker.welcomeSeen','1');sessionStorage.setItem('ggpoker.entered','1')},token);
await p.goto(BASE+'/#/settings',{waitUntil:'networkidle2'});
await p.waitForFunction(()=>document.querySelector('.settings-window'),{timeout:20000});
const info=await p.evaluate(()=>{
  const rows=[...document.querySelectorAll('.settings-window *')].filter(e=>e.children.length===0 && /Auto-muck/i.test(e.textContent||''));
  const el=rows[0];
  return {found:!!el, row:el?.parentElement?.parentElement?.outerHTML.slice(0,700), inputs:document.querySelectorAll('input[type=checkbox]').length};
});
console.log(JSON.stringify(info));
await b.close();
