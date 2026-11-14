import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--no-sandbox','--allow-file-access-from-files']});
const p=await b.newPage(); await p.setViewport({width:1820,height:1100,deviceScaleFactor:1});
await p.goto('file:///Users/davidai/Projects/GGPoker-flash/docs/screenshots/live-audit/compare.html',{waitUntil:'load'});
await new Promise(r=>setTimeout(r,600));
await p.screenshot({path:'/Users/davidai/Projects/GGPoker-flash/docs/screenshots/live-audit/compare.png',fullPage:true});
await b.close();
