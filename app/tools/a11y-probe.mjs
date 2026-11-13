import puppeteer from 'puppeteer-core';
const BASE='http://127.0.0.1:5198';
const r=await fetch(`${BASE}/api/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'DansiDanutz',password:'ggpoker'})});
const {token}=await r.json();
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
for (const width of [390,1440]) {
  const p=await b.newPage();
  await p.setViewport({width,height:844,isMobile:width<700,hasTouch:width<700});
  await p.evaluateOnNewDocument(t=>{localStorage.setItem('ggpoker.token',t);localStorage.setItem('ggpoker.welcomeSeen','1');sessionStorage.setItem('ggpoker.entered','1');localStorage.setItem('ggpoker.animations','0')},token);
  await p.goto(BASE+'/#/',{waitUntil:'networkidle2'});
  await p.waitForFunction(()=>!document.querySelector('.splash'),{timeout:20000}).catch(()=>{});
  const rows=[];
  for (let i=0;i<14;i++){
    await p.keyboard.press('Tab');
    rows.push(await p.evaluate(()=>{
      const el=document.activeElement; if(!el||el===document.body) return {tag:'BODY'};
      const cs=getComputedStyle(el); const rect=el.getBoundingClientRect();
      return {tag:el.tagName, label:(el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,42), outline:`${cs.outlineStyle} ${cs.outlineWidth}`, visible:rect.width>0&&rect.height>0&&rect.bottom>0&&rect.top<innerHeight};
    }));
  }
  const invisible=rows.filter(x=>x.visible===false).length;
  const noOutline=rows.filter(x=>x.outline==='none 0px').length;
  console.log(`${width}px focus walk: ${rows.length} stops, ${invisible} offscreen, ${noOutline} without outline`);
  console.log('  '+rows.slice(0,6).map(x=>`${x.tag}:${x.label}`).join(' | '));
  await p.close();
}
await b.close();
