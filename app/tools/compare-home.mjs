import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:1740,height:760,deviceScaleFactor:1});
await p.goto('file:///Users/davidai/Projects/GGPoker-flash/docs/screenshots/desk-pass/compare.html',{waitUntil:'load'});
await new Promise(r=>setTimeout(r,400));
await p.screenshot({path:'/Users/davidai/Projects/GGPoker-flash/docs/screenshots/desk-pass/compare.png',fullPage:true});
await b.close();
