import puppeteer from 'puppeteer-core';
const BASE='http://127.0.0.1:5198';
const {token}=await fetch(`${BASE}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'DansiDanutz',password:'ggpoker'})}).then(r=>r.json());
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
for (const [w,h] of [[1440,900],[1024,768],[768,1024]]) {
  const p=await b.newPage(); await p.setViewport({width:w,height:h});
  await p.evaluateOnNewDocument(t=>{localStorage.setItem('ggpoker.token',t);localStorage.setItem('ggpoker.welcomeSeen','1');sessionStorage.setItem('ggpoker.entered','1')},token);
  await p.goto(`${BASE}/#/table/nlh-diamond-01`,{waitUntil:'networkidle2'});
  await new Promise(r=>setTimeout(r,2200));
  await p.evaluate(()=>{document.querySelectorAll('[class*=toast]').forEach(e=>e.remove());});
  await p.screenshot({path:`/Users/davidai/Desktop/DavidAi/GGPoker-flash/.r4/docs/screenshots/table-shots/${w}-table.png`});
  const info=await p.evaluate(()=>({ox:document.documentElement.scrollWidth-document.documentElement.clientWidth, w:innerWidth}));
  console.log(w, JSON.stringify(info));
  await p.close();
}
await b.close();
