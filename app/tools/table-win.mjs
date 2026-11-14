import puppeteer from 'puppeteer-core';
const BASE='http://127.0.0.1:5198';
const {token}=await fetch(`${BASE}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'DansiDanutz',password:'ggpoker'})}).then(r=>r.json());
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:1200,height:900});
await p.evaluateOnNewDocument(t=>{localStorage.setItem('ggpoker.token',t);localStorage.setItem('ggpoker.welcomeSeen','1');sessionStorage.setItem('ggpoker.entered','1')},token);
await p.goto(`${BASE}/#/table/nlh-diamond-01`,{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,2000));
for (let i=0;i<40;i++){
  await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/deal me in/i.test(x.textContent)); if(b) b.click();});
  const n=await p.evaluate(()=>document.querySelectorAll('.seat.me .pcard').length);
  if(n>0) break;
  await new Promise(r=>setTimeout(r,1000));
}
let found=false;
for (let i=0;i<120;i++){
  const w=await p.evaluate(()=>!!document.querySelector('.seat.winner'));
  if(w){ found=true; break; }
  await new Promise(r=>setTimeout(r,400));
}
await p.evaluate(()=>{document.querySelectorAll('[class*=toast]').forEach(e=>e.remove());});
await new Promise(r=>setTimeout(r,250));
await p.screenshot({path:'/Users/davidai/Desktop/DavidAi/GGPoker-flash/.r4/docs/screenshots/table-shots/1200-win.png'});
console.log(JSON.stringify({winnerSeen:found}));
await b.close();
