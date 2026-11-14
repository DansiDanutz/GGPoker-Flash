import puppeteer from 'puppeteer-core';
const BASE='http://127.0.0.1:5198';
const login=await fetch(`${BASE}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'DansiDanutz',password:'ggpoker'})}).then(r=>r.json());
const routes=['/','/tournaments','/casino','/slots','/my-page','/rewards','/cashier','/settings','/hand-history'];
const widths=[320,390,430,768,1024,1440,1920];
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
const fails=[];
for (const w of widths){
  const p=await b.newPage(); await p.setViewport({width:w,height:w<=430?844:w<=1024?1024:900,isMobile:w<=700,hasTouch:w<=700});
  await p.evaluateOnNewDocument(t=>{localStorage.setItem('ggpoker.token',t);localStorage.setItem('ggpoker.welcomeSeen','1');sessionStorage.setItem('ggpoker.entered','1')},login.token);
  for (const r of routes){
    await p.goto(BASE+'/#'+r,{waitUntil:'networkidle2'});
    await new Promise(x=>setTimeout(x,350));
    const m=await p.evaluate(()=>({doc:document.documentElement.scrollWidth-document.documentElement.clientWidth, body:document.body.scrollWidth-document.body.clientWidth}));
    if(m.doc>0||m.body>0) fails.push({w,route:r,...m});
  }
  await p.close();
}
// keyboard focus walk on home
const p=await b.newPage(); await p.setViewport({width:1440,height:900});
await p.evaluateOnNewDocument(t=>{localStorage.setItem('ggpoker.token',t);localStorage.setItem('ggpoker.welcomeSeen','1');sessionStorage.setItem('ggpoker.entered','1')},login.token);
await p.goto(BASE+'/#/',{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,600));
const focus=[];
for(let i=0;i<14;i++){
  await p.keyboard.press('Tab');
  focus.push(await p.evaluate(()=>{const e=document.activeElement; const s=getComputedStyle(e); const r=e.getBoundingClientRect(); return {tag:e.tagName, label:(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,32), outline:s.outlineWidth, shadow:s.boxShadow!=='none', visible:r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight};}));
}
// 200% zoom equivalent: 720 CSS px at 1440 physical
const z=await b.newPage(); await z.setViewport({width:720,height:450,deviceScaleFactor:2});
await z.evaluateOnNewDocument(t=>{localStorage.setItem('ggpoker.token',t);localStorage.setItem('ggpoker.welcomeSeen','1');sessionStorage.setItem('ggpoker.entered','1')},login.token);
await z.goto(BASE+'/#/',{waitUntil:'networkidle2'});
await z.waitForFunction(()=>!document.querySelector('.splash') && (document.querySelector('.home-feed, .bottom-nav, .m-home, .mobile-home')), {timeout:20000}).catch(()=>{});
await new Promise(r=>setTimeout(r,1200));
const zoom=await z.evaluate(()=>({ox:document.documentElement.scrollWidth-document.documentElement.clientWidth, w:innerWidth, feed:!!document.querySelector('.home-feed'), mobile:!!document.querySelector('.bottom-nav, .m-home, .mobile-home')}));
await z.screenshot({path:'/Users/davidai/Desktop/DavidAi/GGPoker-flash/.r4/docs/screenshots/audit-r14/zoom-200-home.png'});
console.log(JSON.stringify({fails, focus, zoom}, null, 1));
await b.close();
