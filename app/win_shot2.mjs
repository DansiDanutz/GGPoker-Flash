import puppeteer from 'puppeteer-core';
const b=await puppeteer.connect({browserURL:'http://127.0.0.1:9333',defaultViewport:null});
const pages=await b.pages(); const p=pages.find(x=>x.url().includes('5198'))||pages[0];
await p.bringToFront();
await p.evaluate(()=>{location.hash='/'}); await new Promise(r=>setTimeout(r,900));
await p.evaluate(()=>document.querySelector('.table-row')?.dispatchEvent(new MouseEvent('click',{bubbles:true})));
await new Promise(r=>setTimeout(r,300));
await p.evaluate(()=>[...document.querySelectorAll('.mini-actions .btn')].find(b=>b.textContent==='Join')?.click());
await new Promise(r=>setTimeout(r,500));
await p.evaluate(()=>document.querySelector('.modal-foot .btn-red')?.click());
await new Promise(r=>setTimeout(r,2800));
let win=false;
for(let i=0;i<70;i++){
  const s=await p.evaluate(()=>({win:!!document.querySelector('.win-overlay'),turn:!!document.querySelector('.act-check:not(:disabled), .act-call:not(:disabled)')}));
  if(s.win){ await p.screenshot({path:'/Users/davidai/Desktop/DavidAi/GGPoker-flash/research/screens/deliverable/table_win.png'}); win=true; break; }
  if(s.turn){ await p.click(await p.evaluate(()=>document.querySelector('.act-check:not(:disabled)')?'.act-check:not(:disabled)':'.act-call:not(:disabled)')); }
  await new Promise(r=>setTimeout(r,650));
}
if(!win) await p.screenshot({path:'/Users/davidai/Desktop/DavidAi/GGPoker-flash/research/screens/deliverable/table_now.png'});
await new Promise(r=>setTimeout(r,1200));
await p.screenshot({path:'/Users/davidai/Desktop/DavidAi/GGPoker-flash/research/screens/deliverable/table_now.png'});
await p.evaluate(()=>{location.hash='/'}); await new Promise(r=>setTimeout(r,1200));
await b.disconnect(); console.log('win',win);
