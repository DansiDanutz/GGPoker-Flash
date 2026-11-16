import puppeteer from 'puppeteer-core';
const BASE='http://127.0.0.1:5198';
const {token}=await fetch(`${BASE}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'DansiDanutz',password:'ggpoker'})}).then(r=>r.json());
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:1200,height:900});
await p.evaluateOnNewDocument(t=>{localStorage.setItem('ggpoker.token',t);localStorage.setItem('ggpoker.welcomeSeen','1');sessionStorage.setItem('ggpoker.entered','1')},token);
await p.goto(`${BASE}/#/table/nlh-diamond-01`,{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,2000));
const dealt=await p.evaluate(()=>{
  const btn=[...document.querySelectorAll('button')].find(b=>/deal me in/i.test(b.textContent));
  if(btn) btn.click();
  return !!btn;
});
await new Promise(r=>setTimeout(r,6000));
const info=await p.evaluate(()=>({heroCards:document.querySelectorAll('.seat.me .pcard').length, board:document.querySelectorAll('.table-center .pcard').length, street:document.querySelector('.street, .table-center')?.textContent?.slice(0,40), dealt:null}));
await p.screenshot({path:'/Users/davidai/Desktop/DavidAi/GGPoker-flash/.r4/docs/screenshots/table-shots/1200-dealt.png'});
console.log(JSON.stringify({clicked:dealt,...info}));
await b.close();
