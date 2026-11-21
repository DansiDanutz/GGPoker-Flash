// Disposable local data only; no payment provider calls or real balances.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { startSandbox } from './contributor-sandbox.mjs';
const artifacts=path.resolve(process.env.ARTIFACTS_DIR || 'artifacts/organizer-workspace');
await mkdir(artifacts,{recursive:true});
const sandbox=await startSandbox();let browser;
const checks=[];
const request=async (route,token,body)=>{const r=await fetch(sandbox.api+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;};
try {
 const owner=await request('/api/auth/register',null,{login:`orgowner${Date.now()}`,nick:'Workspace owner',password:'disposable-workspace-test'});
 const member=await request('/api/auth/register',null,{login:`orgmember${Date.now()}`,nick:'Future member',password:'disposable-workspace-test'});
 const before=await request('/api/marketplace/billing/me',owner.token);
 const mac='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
 browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||(existsSync(mac)?mac:execFileSync('which',['google-chrome'],{encoding:'utf8'}).trim()),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage();const errors=[];const financialRequests=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.method()==='POST'&&/billing|chips|checkout/.test(r.url()))financialRequests.push(r.url());});
 await page.evaluateOnNewDocument(token=>{localStorage.setItem('ggpoker.token',token);sessionStorage.setItem('ggpoker.entered','1');localStorage.setItem('ggpoker.welcomeSeen','1');},owner.token);
 await page.setViewport({width:1280,height:950});
 await page.goto(sandbox.url+'/#/organiser');await page.waitForSelector('.ls-content:not([inert])');await page.waitForSelector('.ls',{hidden:true});
 const tabs=['how-it-works','transfers','nervixpay','management','my-tables','my-casino'];
 assert.equal(await page.$$eval('.ow-tabs a',ns=>ns.length),6);
 const select=async tab=>{await page.locator(`.ow-tabs a[href="#/organiser?tab=${tab}"]`).click();await page.waitForFunction(tab=>document.querySelector('.ow-tabs a[aria-current]')?.getAttribute('href')===`#/organiser?tab=${tab}`,{},tab);await new Promise(r=>setTimeout(r,180));};
 for(const width of [1280,390,320]) {
  await page.setViewport({width,height:950});
  for(const tab of tabs) {
   await select(tab);
   await page.waitForFunction(()=>!document.documentElement.matches(':active-view-transition'));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${tab} must fit ${width}px`);
   if(tab==='management')assert.equal(await page.$eval('section[aria-label="Organizer credits and services"]',n=>n.textContent.includes('Inactive')),true);
   if(tab==='nervixpay')await page.waitForFunction(()=>document.querySelector('section[aria-label="Organizer credits and services"]')?.textContent.includes('not configured'));
   await page.screenshot({path:path.join(artifacts,`${tab}-${width}.png`),fullPage:true});
   checks.push(`${tab} at ${width}px`);
  }
 }
 // Account redesign stays on the same disposable user and must never initiate billing.
 for (const width of [1280,390,320]) {
  await page.setViewport({width,height:950});
  for (const [route,selector,name] of [['/my-page?tab=overview','.mpp','profile'],['/my-page?tab=wallet','.wallet','wallet'],['/my-page?tab=transactions','.txp','transactions'],['/organizers','.org-page','clubs'],['/contributor','.contributor-workspace','contributor'],['/marketplace','.marketplace','marketplace']]) {
   await page.goto(sandbox.url+'/#'+route);
   await page.waitForSelector(selector);
   await page.waitForSelector('.ls',{hidden:true});
   await page.waitForFunction(()=>!document.documentElement.matches(':active-view-transition'));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} must fit ${width}px`);
   if(name==='wallet') {
    assert.ok(await page.$eval('.wallet',n=>n.textContent.includes('Play Money wallet')));
    assert.ok(await page.$$eval('.wallet button',ns=>ns.every(n=>n.getBoundingClientRect().height>=44)),'Wallet controls meet mobile touch size');
   }
   if(name==='profile') {
    assert.equal(await page.$eval('#mpp-nick',n=>n.value),'Workspace owner');
    assert.ok(await page.evaluate(()=>document.querySelector('.mpp-head').getBoundingClientRect().top<document.querySelector('.mpp .profile-role-guide').getBoundingClientRect().top),'Identity editing precedes membership guide');
   }
   await page.screenshot({path:path.join(artifacts,`${name}-${width}.png`),fullPage:true});
   checks.push(`${name} at ${width}px`);
  }
 }
 await page.goto(sandbox.url+'/#/organiser');await page.waitForSelector('.ow-tabs');
 await select('transfers');await page.type('input[aria-label="Cash Chips for buyback"]','1');
 await select('how-it-works');await select('transfers');assert.equal(await page.$eval('input[aria-label="Cash Chips for buyback"]',n=>n.value),'1','Tab switching preserves transfer drafts');
 await page.reload();await page.waitForSelector('.ls',{hidden:true});await page.waitForSelector('.ow-tabs a[aria-current]');assert.equal(await page.$eval('.ow-tabs a[aria-current]',n=>n.textContent),'Transfers');
 // Activate only the disposable membership fixture to exercise the real club APIs.
 const db=new DatabaseSync(path.join(sandbox.directory,'data','ggpoker.db'));
 db.prepare("INSERT INTO organizer_billing_memberships(user_id,role,active,expires_at) VALUES(?,'organizer',1,?) ON CONFLICT(user_id,role) DO UPDATE SET active=1,expires_at=excluded.expires_at").run(owner.user.id,new Date(Date.now()+86400000).toISOString());db.close();
 await select('my-casino');await page.waitForSelector('.ow-profile-form input');
 const set=async (selector,value)=>page.$eval(selector,(el,value)=>{Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
 await set('.ow-profile-form input','Emerald test club');await set('.ow-profile-form textarea','Friendly evening poker.');await set('.ow-profile-form input[type="number"]','0');
 await page.click('.ow-profile-form button');await page.waitForFunction(()=>document.querySelector('[aria-label="My Casino club settings"]')?.textContent.includes('has been saved'));
 const club=await request(`/api/organizers/${owner.user.id}`,owner.token);assert.equal(club.name,'Emerald test club');assert.equal(club.entryFeeCents,0);
 await request(`/api/organizers/${owner.user.id}/knock`,member.token,{message:'Please let me join.'});
 await page.click('.ow-section-top button');await page.waitForFunction(()=>document.querySelector('.ow-members')?.textContent.includes('Future member'));
 page.on('dialog',d=>d.accept());await page.click('.ow-members button');await page.waitForFunction(()=>document.querySelector('.ow-members')?.textContent.includes('approved'));
 assert.equal((await request(`/api/organizers/${owner.user.id}`,member.token)).membershipStatus,'approved');
 await page.click(`a[href="#/organizers?club=${owner.user.id}"]`);await page.waitForFunction(()=>document.querySelector('.org-modal')?.textContent.includes('Emerald test club')||document.querySelector('[role="dialog"]')?.textContent.includes('Emerald test club'));
 for (const width of [1280,390,320]) {
  await page.setViewport({width,height:950});
  await page.goto(sandbox.url+`/#/organizers?club=${owner.user.id}`);
  await page.waitForSelector('.org-modal');
  await page.waitForSelector('.ls',{hidden:true});
  assert.ok(await page.$eval('.org-modal',n=>n.scrollWidth<=n.clientWidth+1),'Club dialog content fits without clipping');
  await page.waitForFunction(() => {
    const rect = document.querySelector('.org-close')?.getBoundingClientRect();
    return rect && rect.width >= 44 && rect.height >= 44;
  }, { timeout: 1500 }).catch(async error => {
    const size = await page.$eval('.org-close', n => n.getBoundingClientRect().toJSON());
    throw new Error(`Club close target at ${width}px: ${size.width} × ${size.height}; expected at least 44 × 44`, { cause: error });
  });
  await page.screenshot({path:path.join(artifacts,`club-dialog-${width}.png`),fullPage:true});
  checks.push(`Club dialog at ${width}px`);
 }
 checks.push('Profile saved, member approved and shared club link opens the correct club');
 assert.deepEqual(financialRequests,[],'Browsing, saving profile and approving entry must not debit credits');
 const after=await request('/api/marketplace/billing/me',owner.token);assert.equal(after.balance_cents,before.balance_cents);assert.deepEqual(after.ledger,before.ledger);
 const guest=await browser.newPage();await guest.evaluateOnNewDocument(()=>{localStorage.removeItem('ggpoker.token');localStorage.setItem('ggpoker.guest','1');sessionStorage.setItem('ggpoker.entered','1');localStorage.setItem('ggpoker.welcomeSeen','1');});await guest.goto(sandbox.url+'/#/organiser');await guest.waitForFunction(()=>document.body.textContent.includes('Sign in to open this workspace'));assert.equal(await guest.$('.ow-workspace'),null);
 assert.deepEqual(errors,[]);await writeFile(path.join(artifacts,'results.json'),JSON.stringify({checks,errors,financialRequests},null,2));console.log(JSON.stringify({ok:true,checks:checks.length,artifacts}));
}finally{await browser?.close();await sandbox.close();}
