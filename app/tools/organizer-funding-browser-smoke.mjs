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

const artifacts = path.resolve(process.env.ARTIFACTS_DIR || 'artifacts/organizer-funding');
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
  db.exec('PRAGMA busy_timeout = 5000'); // The fixture and its server write from separate processes.
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
    await page.waitForSelector('.ls', { hidden: true }); await page.waitForSelector('.funding-panel');
    return page;
  };
  const click = async (page, text, scope = '.funding-panel') => {
    currentPage = page;
    await page.waitForFunction(() => !document.documentElement.matches(':active-view-transition'));
    await page.waitForFunction((text, scope) => [...document.querySelectorAll(scope + ' button')].some(b => b.textContent.trim() === text && !b.disabled), {}, text, scope);
    const handle = await page.evaluateHandle((text, scope) => [...document.querySelectorAll(scope + ' button')].find(b => b.textContent.trim() === text && !b.disabled), text, scope);
    assert.ok(handle.asElement(), text); await handle.asElement().click(); await handle.dispose();
  };
  const playerPage = await makePage(member.token, `/organizers?club=${owner.user.id}`);
  const checkoutUrl = await playerPage.evaluate(async () => (await import('/src/lib/organizer-funding-api.ts')).fundingCheckout({paymentLinkId:'11111111-1111-4111-8111-111111111111',reference:'funding:browser-test'}));
  assert.equal(new URL(checkoutUrl).searchParams.get('prefer'), 'bnb:USDC');
  checks.push('Organizer checkout prefers BSC USDC without creating a payment');
  assert.ok(await playerPage.$('.cashout-panel'), 'Club profile exposes player USDT cash-out');
  assert.equal(chips.balance(owner.user.id, member.user.id), 0);
  await click(playerPage, 'Send chip request');
  await playerPage.waitForFunction(() => document.querySelector('.funding-panel').textContent.includes('Awaiting organizer'));
  const ownerPage = await makePage(owner.token, '/organiser?tab=transfers');
  assert.ok(await ownerPage.$('.session-credit-panel'), 'Organizer can manage agreed session credit');
  for (const width of [320, 390, 1280]) {
    for (const [page, name] of [[playerPage, 'player'], [ownerPage, 'organizer']]) {
      await page.setViewport({ width, height: 950 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} fits ${width}`);
      await page.$eval('.funding-panel', node => node.scrollIntoView({block: 'start'}));
      await page.screenshot({ path: path.join(artifacts, `${name}-${width}.png`), fullPage: true });
      checks.push(`${name} request at ${width}px`);
    }
  }
  await click(ownerPage, 'Credit from my stack');
  await ownerPage.waitForFunction(() => document.querySelector('.funding-panel').textContent.includes('Chips transferred'));
  await ownerPage.waitForFunction(() => document.querySelector('section[aria-label="Organizer Cash Chips"] select')?.textContent.includes('80,000'), {timeout: 2000});
  const request = (await srv.get('/api/marketplace/chips/funding', { token: owner.token })).data.requests[0];
  await post(`/api/marketplace/chips/funding/${request.id}/credit`, owner.token, {});
  assert.equal(chips.balance(owner.user.id, member.user.id), 20000);
  assert.equal(chips.balance(owner.user.id, owner.user.id), 80000);
  assert.equal(chips.supply(owner.user.id).circulating, 100000);
  checks.push('Zero-balance member requests 20,000; approval transfers once; displayed balance refreshes; supply reconciles');
  await click(playerPage, 'Refresh requests');
  await playerPage.waitForFunction(() => document.querySelector('.funding-panel').textContent.includes('Chips transferred'));
  await click(playerPage, 'Send chip request');
  await playerPage.waitForFunction(() => document.querySelector('.funding-panel').textContent.includes('Awaiting organizer'));
  await click(ownerPage, 'Refresh requests');
  await ownerPage.waitForSelector('.funding-panel input[inputmode="decimal"]');
  await ownerPage.type('.funding-panel input[inputmode="decimal"]', '2.00');
  await click(ownerPage, 'Create payment link');
  await ownerPage.waitForFunction(() => /connected|configured/.test(document.querySelector('.funding-panel [role="alert"]')?.textContent || ''));
  assert.equal(chips.balance(owner.user.id, owner.user.id), 80000);
  checks.push('Missing organizer merchant refuses checkout without reserving chips');
  // Return flow uses the real buyback escrow; the external USDT receipt is a fixture.
  await click(playerPage, 'Refresh cash-outs', '.cashout-panel');
  await playerPage.waitForFunction(() => document.querySelector('.cashout-panel')?.textContent.includes('20,000'));
  const fill = async (selector, value) => playerPage.$eval(selector, (node, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new Event('input', {bubbles:true})); }, value);
  await fill('.cashout-panel input[name="chips"]', '5000');
  await fill('.cashout-panel input[name="usdt"]', '1.50');
  await fill('.cashout-panel input[name="network"]', 'Polygon');
  await fill('.cashout-panel input[name="wallet"]', 'disposable-recipient-wallet');
  await click(playerPage, 'Request USDT cash-out', '.cashout-panel');
  await playerPage.waitForFunction(() => document.querySelector('.cashout-panel')?.textContent.includes('Awaiting organizer payment'));
  assert.equal(chips.balance(owner.user.id, member.user.id), 15000);
  const cashout = (await srv.get('/api/marketplace/chips/me', {token: member.token})).data.buybacks[0];
  await click(ownerPage, 'Refresh', 'section[aria-label="Organizer Cash Chips"]');
  await ownerPage.waitForFunction(() => document.querySelector('section[aria-label="Organizer Cash Chips"]')?.textContent.includes('disposable-recipient-wallet'));
  await click(ownerPage, 'Accept cash-out', 'section[aria-label="Organizer Cash Chips"]');
  await ownerPage.waitForSelector('input[aria-label="Unique payment reference"]');
  assert.equal((await srv.post(`/api/marketplace/chips/buybacks/${cashout.id}/cancel`, {token:member.token,body:{}})).status,409);
  await click(playerPage, 'Refresh cash-outs', '.cashout-panel');
  await playerPage.waitForFunction(() => document.querySelector('.cashout-panel')?.textContent.includes('payment in progress'));
  assert.equal(await playerPage.$$eval('.cashout-panel button', nodes => nodes.some(n => n.textContent === 'Cancel cash-out')),false);
  checks.push('Organizer acceptance locks cancellation before external payment');
  await post(`/api/marketplace/chips/buybacks/${cashout.id}/report`, owner.token, {receipt:'disposable-usdt-receipt',paymentAmount:'1.50',paymentCurrency:'USDT',paymentNetwork:'Polygon',paymentDetails:cashout.payment_details});
  await click(playerPage, 'Refresh cash-outs', '.cashout-panel');
  await playerPage.waitForFunction(() => document.querySelector('.cashout-panel')?.textContent.includes('Organizer reports payment sent'));
  await click(playerPage, 'Confirm USDT received', '.cashout-panel');
  await playerPage.waitForFunction(() => document.querySelector('.cashout-panel')?.textContent.includes('Cash-out completed'));
  await post(`/api/marketplace/chips/buybacks/${cashout.id}/confirm`, member.token, {});
  assert.equal(chips.balance(owner.user.id, member.user.id),15000);
  assert.equal(chips.balance(owner.user.id, owner.user.id),85000);
  assert.equal(chips.supply(owner.user.id).circulating,100000);
  checks.push('USDT cash-out reserves 5,000 chips, reports receipt, confirms once and reconciles 100,000 chips');
  await fill('.cashout-panel input[name="chips"]', '1000');
  await click(playerPage, 'Request USDT cash-out', '.cashout-panel');
  await playerPage.waitForFunction(() => document.querySelector('.cashout-panel')?.textContent.includes('Awaiting organizer payment'));
  await click(playerPage, 'Cancel cash-out', '.cashout-panel');
  await playerPage.waitForFunction(() => document.querySelector('.cashout-panel')?.textContent.includes('Cancelled · chips returned'));
  assert.equal(chips.balance(owner.user.id, member.user.id),15000);
  checks.push('Cancelling an unpaid cash-out returns reserved chips');
  for (const width of [320,390,1280]) {
    await playerPage.setViewport({width,height:950});
    await playerPage.$eval('.cashout-panel', node => node.scrollIntoView({block:'start'}));
    assert.ok(await playerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await playerPage.screenshot({path:path.join(artifacts,`cashout-${width}.png`),fullPage:true});
    checks.push(`Cash-out form and receipts at ${width}px`);
  }
  // Session credit is separate from gifts and paid chip purchases.
  const borrower = await post('/api/auth/register', null, {login:'session_borrower',nick:'Session player',password:'disposable-session-pass'});
  await post(`/api/organizers/${owner.user.id}/knock`, borrower.token, {message:'Session credit test'});
  db.prepare("UPDATE organizer_club_members SET status='approved' WHERE organizer_id=? AND user_id=?").run(owner.user.id, borrower.user.id);
  const borrowerPage = await makePage(borrower.token, `/organizers?club=${owner.user.id}`);
  await borrowerPage.$eval('.funding-panel input[type="number"]', node => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,'10000'); node.dispatchEvent(new Event('input',{bubbles:true})); });
  await click(borrowerPage,'Send chip request');
  await borrowerPage.waitForFunction(() => document.querySelector('.funding-panel').textContent.includes('Awaiting organizer'));
  const loanRequest = (await srv.get('/api/marketplace/chips/funding',{token:borrower.token})).data.requests[0];
  // Propose through the owner UI scoped to this player's request.
  await click(ownerPage,'Refresh requests');
  await ownerPage.waitForFunction(() => document.querySelector('.funding-panel').textContent.includes('Session player'));
  await ownerPage.evaluate(() => { const row=[...document.querySelectorAll('.funding-panel > ul > li')].find(n=>n.textContent.includes('Session player')); const input=row.querySelector('input[inputmode="decimal"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'10.00'); input.dispatchEvent(new Event('input',{bubbles:true})); });
  await ownerPage.locator(() => { const row=[...document.querySelectorAll('.funding-panel > ul > li')].find(n=>n.textContent.includes('Session player')); return [...row.querySelectorAll('button')].find(b=>b.textContent==='Offer session credit'); }).click();
  await ownerPage.waitForFunction(() => document.querySelector('.session-credit-panel').textContent.includes('Awaiting player acceptance'));
  assert.equal(chips.balance(owner.user.id,borrower.user.id),0,'Proposal does not deliver chips before consent');
  await click(borrowerPage,'Refresh requests');
  await borrowerPage.waitForFunction(() => document.querySelector('.session-credit-panel').textContent.includes('Awaiting player acceptance'));
  await click(borrowerPage,'Accept session terms','.session-credit-panel');
  await borrowerPage.waitForFunction(() => document.querySelector('.session-credit-panel').textContent.includes('Session active'));
  const session = (await srv.get('/api/marketplace/chips/session-credit',{token:borrower.token})).data.sessions.find(r=>r.fundingRequestId===loanRequest.id);
  await post(`/api/marketplace/chips/session-credit/${session.id}/accept`,borrower.token,{});
  assert.equal(chips.balance(owner.user.id,borrower.user.id),10000);
  assert.equal(chips.balance(owner.user.id,owner.user.id),75000);
  // Real ledger cash-table lifecycle; deterministic hand outcomes, no live game or funds.
  db.prepare("INSERT INTO tables(id,name,game,category,sb,bb,min_buyin,max_buyin,owner_id,private,chip_economy) VALUES('session-test','Session test','holdem','Diamond',50,100,1000,20000,?,1,1)").run(owner.user.id);
  chips.openSeat({organizerId:owner.user.id,userId:borrower.user.id,tableId:'session-test',sessionId:'borrower-seat',amount:10000});
  chips.openSeat({organizerId:owner.user.id,userId:member.user.id,tableId:'session-test',sessionId:'opponent-seat',amount:10000});
  assert.equal((await srv.post(`/api/marketplace/chips/session-credit/${session.id}/finish`,{token:borrower.token,body:{}})).status,409);
  chips.settleHand({organizerId:owner.user.id,tableId:'session-test',handId:'session-hand',players:[{sessionId:'borrower-seat',userId:borrower.user.id,amount:7000},{sessionId:'opponent-seat',userId:member.user.id,amount:13000}],rake:0});
  chips.closeSeat({organizerId:owner.user.id,userId:borrower.user.id,tableId:'session-test',sessionId:'borrower-seat'});
  chips.closeSeat({organizerId:owner.user.id,userId:member.user.id,tableId:'session-test',sessionId:'opponent-seat'});
  await click(borrowerPage,'End session & return unused chips','.session-credit-panel');
  await borrowerPage.waitForFunction(() => document.querySelector('.session-credit-panel').textContent.includes('Session ended · payment due'));
  const finished = await post(`/api/marketplace/chips/session-credit/${session.id}/finish`,borrower.token,{});
  assert.equal(finished.returnedChips,7000); assert.equal(finished.usedChips,3000); assert.equal(finished.dueCents,300);
  assert.equal(chips.balance(owner.user.id,borrower.user.id),0);
  assert.equal(chips.balance(owner.user.id,owner.user.id),82000);
  assert.equal(chips.balance(owner.user.id,member.user.id),18000);
  assert.equal(chips.supply(owner.user.id).circulating,100000);
  await click(borrowerPage,'Prepare session payment link','.session-credit-panel');
  await borrowerPage.waitForFunction(() => /connected|configured|connection/.test(document.querySelector('.funding-panel [role="alert"]')?.textContent || ''));
  assert.equal(chips.balance(owner.user.id,owner.user.id),82000,'Provider failure cannot reclaim chips twice');
  await post(`/api/organizers/${owner.user.id}/leave`,borrower.token,{});
  await borrowerPage.reload(); await borrowerPage.waitForSelector('.ls',{hidden:true}); await borrowerPage.waitForSelector('.funding-panel');
  await borrowerPage.waitForFunction(() => document.querySelector('.session-credit-panel')?.textContent.includes('Session ended · payment due'));
  assert.equal(await borrowerPage.$$eval('.funding-panel button',nodes=>nodes.some(node=>node.textContent.trim()==='Send chip request')),false);
  checks.push('Leaving a club hides new requests but preserves outstanding session settlement controls');
  checks.push('Session terms accepted explicitly; 10,000 lent, 7,000 returned, $3 due; retries and provider failure preserve all 100,000 chips');
  for (const width of [320,390,1280]) {
    await borrowerPage.setViewport({width,height:950});
    await borrowerPage.$eval('.session-credit-panel',node=>node.scrollIntoView({block:'start'}));
    assert.ok(await borrowerPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await borrowerPage.screenshot({path:path.join(artifacts,`session-${width}.png`),fullPage:true});
    checks.push(`Session credit settlement fits ${width}px`);
  }
  assert.deepEqual(errors, []); db.close();
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(JSON.stringify({ checks, errors }));
} catch (error) {
  if (currentPage) { console.error(await currentPage.$$eval('.funding-panel,.cashout-panel', nodes => nodes.map(node => node.textContent)).catch(() => 'Panel missing')); await currentPage.screenshot({path: path.join(artifacts, 'failure.png'), fullPage: true}); }
  throw error;
} finally {
  await browser?.close(); await web?.close(); await srv?.stop();
  if (srv) await rm(srv.dataDir, { recursive: true, force: true });
}
