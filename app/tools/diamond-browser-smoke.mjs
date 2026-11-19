// Disposable local users/chips only. No payment credentials or provider calls.
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import net from 'node:net';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { startServer } from '../server/test-helpers.js';
import { sandboxEnvironment } from './contributor-sandbox.mjs';
import { createOrganizerChips } from '../server/organizer-chips.js';

const artifacts = path.resolve(process.env.ARTIFACTS_DIR || 'artifacts/diamonds');
await mkdir(artifacts, { recursive: true });
let srv, web, browser, currentPage;
const checks = [], errors = [];
try {
  const webPort = await new Promise((resolve, reject) => { const probe = net.createServer(); probe.once('error', reject); probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolve(port)); }); });
  const fixtureEnv = sandboxEnvironment('', 'funding-disposable-admin');
  delete fixtureEnv.GGPOKER_DATA;
  srv = await startServer({ env: { ...fixtureEnv,
    GGPOKER_ORGANIZER_CHIPS: 'enforce', GGPOKER_USAGE_BILLING: 'enforce', GGPOKER_PUBLIC_ORIGIN: `http://127.0.0.1:${webPort}`, ORGANIZER_NERVIXPAY_CONNECTIONS: '{}', NERVIXPAY_CLUB_TOKEN: '', NERVIXPAY_CLUB_MERCHANT_ID: '', NERVIXPAY_API_KEY: '' } });
  // startServer allocates the database location; don't override it with the sandbox helper.
  const post = async (route, token, body) => {
    const result = await srv.post(route, { token, body }); assert.equal(result.status, 200, JSON.stringify(result.data)); return result.data;
  };
  const owner = await post('/api/auth/register', null, { login: 'funding_owner', nick: 'Emerald host', password: 'disposable-funding-pass' });
  const member = await post('/api/auth/register', null, { login: 'funding_member', nick: 'Chip requester', password: 'disposable-funding-pass' });
  const db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
  db.prepare("INSERT INTO organizer_billing_memberships VALUES(?,'organizer',1,'2099-01-01T00:00:00.000Z')").run(owner.user.id);
  const chips = createOrganizerChips({ db });
  db.exec('BEGIN IMMEDIATE');
  chips.grantMembership({ organizerId: owner.user.id, reference: 'disposable-member-grant' });
  db.exec('COMMIT');
  await post('/api/organizers/me/profile', owner.token, { name: 'Emerald funding club', description: 'Disposable test club', entryFeeCents: 0 });
  await post(`/api/organizers/${owner.user.id}/knock`, member.token, { message: 'Please approve.' });
  db.prepare("UPDATE organizer_club_members SET status='approved' WHERE organizer_id=? AND user_id=?").run(owner.user.id, member.user.id);
  const app = path.resolve(import.meta.dirname, '..');
  web = await createServer({ root: app, configFile: path.join(app, 'vite.config.ts'), envDir: srv.dataDir, cacheDir: path.join(srv.dataDir, 'vite'),
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
    server: { host: '127.0.0.1', port: webPort, strictPort: true, open: false, proxy: { '/api': { target: srv.base, changeOrigin: true }, '/ws': { target: srv.base.replace('http:', 'ws:'), ws: true, changeOrigin: true } } } });
  await web.listen(); const url = web.resolvedUrls.local[0];
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || (existsSync(mac) ? mac : execFileSync('which', ['google-chrome'], { encoding: 'utf8' }).trim()), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const makePage = async (token, route) => {
    const context = await browser.createBrowserContext(), page = await context.newPage(); currentPage = page;
    page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    await page.evaluateOnNewDocument(token => { localStorage.setItem('ggpoker.token', token); sessionStorage.setItem('ggpoker.entered', '1'); localStorage.setItem('ggpoker.welcomeSeen', '1'); }, token);
    await page.setViewport({ width: 390, height: 950 }); await page.goto(url + '#' + route);
    await page.waitForSelector('.ls', { hidden: true }); await page.waitForSelector('.diamond-workspace');
    return page;
  };
  const click = async (page, text, scope = '.diamond-workspace') => {
    currentPage = page;
    await page.waitForFunction(() => !document.documentElement.matches(':active-view-transition'));
    await page.waitForFunction((text, scope) => [...document.querySelectorAll(scope + ' button')].some(b => b.textContent.trim() === text && !b.disabled), {}, text, scope);
    const handle = await page.evaluateHandle((text, scope) => [...document.querySelectorAll(scope + ' button')].find(b => b.textContent.trim() === text && !b.disabled), text, scope);
    assert.ok(handle.asElement(), text); await handle.asElement().click(); await handle.dispose();
  };
  chips.transfer({organizerId:owner.user.id,fromUserId:owner.user.id,toUserId:member.user.id,amount:30000,idempotencyKey:'diamond-fixture'});
  const ownerPage = await makePage(owner.token, '/organiser?tab=transfers');
  await ownerPage.$eval('.diamond-workspace input', node => { const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(node,'12000'); node.dispatchEvent(new Event('input',{bubbles:true})); });
  await click(ownerPage,'Save Diamond price');
  await ownerPage.waitForFunction(()=>document.querySelector('.diamond-workspace [role="status"]')?.textContent.includes('saved'));
  const playerPage = await makePage(member.token, '/marketplace');
  await playerPage.select('.diamond-workspace select', String(owner.user.id));
  await playerPage.$eval('.diamond-workspace input', node => { const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(node,'2'); node.dispatchEvent(new Event('input',{bubbles:true})); });
  await click(playerPage,'Request organizer approval');
  await playerPage.waitForSelector('.diamond-request');
  assert.equal(chips.balance(owner.user.id,member.user.id),30000);
  assert.equal(chips.balance(owner.user.id,owner.user.id),70000);
  await click(ownerPage,'Refresh Diamonds');
  await ownerPage.waitForSelector('.diamond-request');
  await click(ownerPage,'Approve & issue');
  await ownerPage.waitForFunction(()=>document.querySelector('.diamond-request')?.textContent.includes('approved'));
  const record=db.prepare("SELECT id FROM organizer_diamond_requests WHERE user_id=?").get(member.user.id);
  await post(`/api/marketplace/diamonds/requests/${record.id}/approve`,owner.token,{});
  assert.equal(chips.balance(owner.user.id,member.user.id),6000);
  assert.equal(chips.balance(owner.user.id,owner.user.id),74000);
  assert.deepEqual(chips.supply(owner.user.id),{minted:100000,burned:20000,circulating:80000});
  assert.equal(db.prepare('SELECT balance FROM organizer_diamond_balances WHERE user_id=?').get(member.user.id).balance,2);
  checks.push('Manual approval issues two Diamonds once: owner burns20,000, receives24,000, player pays24,000; 100,000 chip supply reconciles');
  for(const width of [320,390,1280]){
    for(const [page,name] of [[playerPage,'marketplace'],[ownerPage,'organizer']]){
      await page.setViewport({width,height:950});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} fits ${width}`);
      await page.$eval('.diamond-workspace',node=>node.scrollIntoView({block:'start'}));
      await page.screenshot({path:path.join(artifacts,`${name}-${width}.png`)});
    }
    checks.push(`Diamond purchase and approval fit ${width}px`);
  }
  await playerPage.goto(url+'#/cashier');
  await playerPage.waitForFunction(()=>document.querySelector('.cashier-ledgers')?.textContent.includes('2 Diamonds'));
  assert.match(await playerPage.$eval('.cashier-ledgers',node=>node.textContent),/6,000 Cash Chips/);
  await playerPage.screenshot({path:path.join(artifacts,'cashier-balances.png')});
  checks.push('Cashier shows real2 Diamonds and6,000 scoped Cash Chips');
  assert.deepEqual(errors,[]);
  await writeFile(path.join(artifacts,'results.json'),JSON.stringify({checks,errors},null,2));
  console.log(JSON.stringify({checks,errors}));
  db.close();
} finally {
  await browser?.close();await web?.close();await srv?.stop();
  if(srv)await rm(srv.dataDir,{recursive:true,force:true});
}
