#!/usr/bin/env node
// Disposable local UI checks. GitHub requests are mocked; no visitor account is authorized.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {startSandbox} from './contributor-sandbox.mjs';
assert.equal(process.argv.length, 2);
const artifacts=path.resolve(process.env.ARTIFACTS_DIR || 'artifacts/startup-star');
await mkdir(artifacts,{recursive:true});
const sandbox=await startSandbox(); let browser;
const errors=[]; const results=[];
try {
  const mac='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath=process.env.CHROME_PATH || (existsSync(mac)?mac:execFileSync('which',['google-chrome'],{encoding:'utf8'}).trim());
  browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox']});
  for (const width of [390,320]) {
    const page=await browser.newPage(); page.on('pageerror',e=>errors.push(e.message));
    await page.setViewport({width,height:844});
    if(width===320) await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.goto(sandbox.url);
    await page.waitForFunction(()=>document.querySelector('.ls-poster')?.complete && document.querySelector('.ls-poster')?.naturalWidth>0);
    const shown=await page.evaluate(()=>performance.now());
    assert.equal(await page.$eval('.ls-poster',n=>getComputedStyle(n).objectFit),'contain');
    assert.ok(await page.$('.ls-content[inert]'));
    await page.screenshot({path:path.join(artifacts,`intro-${width}.png`)});
    await page.waitForSelector('.ls--leaving');
    const readingMs=await page.evaluate(()=>performance.now())-shown;
    assert.ok(readingMs>=3200,`Poster was only readable for ${readingMs}ms`);
    if(width===390) {
      await page.waitForFunction(()=>document.querySelector('.ls-particles')?.width===innerWidth);
      await new Promise(resolve=>setTimeout(resolve,250));
      await page.screenshot({path:path.join(artifacts,'particles-390.png')});
    } else assert.equal(await page.$eval('.ls-particles',n=>getComputedStyle(n).display),'none');
    await page.waitForSelector('.ls',{hidden:true});
    await page.waitForSelector('#login-id,.login2-splash-login',{visible:true});
    assert.equal(await page.$('.ls-content[inert]'),null);
    await page.screenshot({path:path.join(artifacts,`login-${width}.png`)});
    await page.click('.creator-credit-btn'); await page.waitForSelector('.cn-star-button');
    assert.equal(await page.$eval('.cn-star-button',n=>getComputedStyle(n).backgroundColor),'rgb(255, 213, 74)');
    await page.click('.cn-star-button'); await page.waitForSelector('.cn-star-no');
    assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'No thanks');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.waitForFunction(()=>document.querySelector('.cn-card').getAnimations().every(animation=>animation.playState==='finished'));
    await page.screenshot({path:path.join(artifacts,`consent-${width}.png`)});
    let starts=0; let mode='error'; let held;
    await page.setRequestInterception(true);
    page.on('request',req=>{
      if(req.url().includes('/api/github-star/start')) {
        starts++; assert.deepEqual(JSON.parse(req.postData()),{consent:true});
        if(mode==='hold') {held=req;return;}
        void req.respond({status:mode==='success'?200:503,contentType:'application/json',body:JSON.stringify(mode==='success'?{url:sandbox.url+'/#github-consent-test'}:{error:'GitHub authorization is not available yet.'})});
      } else if(req.url().startsWith('https://github.com')) {void req.abort(); throw new Error('No real GitHub navigation is allowed in this test');}
      else void req.continue();
    });
    await page.click('.cn-star-no'); assert.equal(starts,0);
    await page.click('.cn-star-button'); await page.keyboard.press('Escape'); assert.equal(starts,0);
    await page.click('.cn-star-button'); await page.click('.cn-star-yes');
    await page.waitForSelector('[role="alert"]'); assert.match(await page.$eval('[role="alert"]',n=>n.textContent),/not available/);
    assert.equal(await page.$eval('.cn-star-yes',n=>n.disabled),false);
    mode='hold'; await page.click('.cn-star-yes');
    while(!held) await new Promise(resolve=>setTimeout(resolve,10));
    await page.click('.cn-star-no');
    await held.respond({status:200,contentType:'application/json',body:JSON.stringify({url:sandbox.url+'/#must-not-navigate'})}).catch(()=>{});
    await page.waitForSelector('.cn-star-button');
    assert.ok(!page.url().includes('must-not-navigate'));
    mode='success'; await page.click('.cn-star-button'); await page.click('.cn-star-yes');
    await page.waitForFunction(()=>location.hash==='#github-consent-test');
    results.push({width,readingMs:Math.round(readingMs),reducedMotion:width===320,consent:'yes/no/error/cancel passed'});
    await page.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(path.join(artifacts,'results.json'),JSON.stringify({ok:true,results,page_errors:errors},null,2));
  console.log(JSON.stringify({ok:true,results,artifacts},null,2));
} finally {await browser?.close();await sandbox.close();}
