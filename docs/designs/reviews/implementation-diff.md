# Implementation Diff — Remediation + Poker Parity (final)

Baseline: 320f00b
Head: 2b0d855

```diff
diff --git a/README.md b/README.md
index 0cbf69d..5188539 100644
--- a/README.md
+++ b/README.md
@@ -83,7 +83,7 @@ the mail icon for notifications, the chat icon for lobby chat, and the gear for
 - Frameless macOS window with the client's title bar, traffic lights, online counter and icon strip.
 - Original `PLAY GG.RO` logo, POKER / TOURNAMENTS / SLOTS / CASINO header pills, Bad Beat Jackpot ticker.
 - Second row game tabs using the original tab artwork: **Home, All-in or Fold, Rush & Cash,
-  Hold'em, PLO, Short Deck, Spin & Gold, Mystery Battle Royale**.
+  Hold'em, PLO/PLO5/PLO6, Short Deck, Spin & Gold, Mystery Battle Royale**.
 - Promotional carousel using the client's Flipout banner.
 - Cash-game table list with **stake/seat/speed filters, table search, favourites**, sortable columns,
   table selection,
@@ -95,7 +95,7 @@ the mail icon for notifications, the chat icon for lobby chat, and the gear for
 ### Poker tables
 - Real No-Limit Hold'em engine: blinds, antes, betting rounds, min-raise rules, all-in,
   side pots, showdown, split pots, hand evaluation, dealer button, timers.
-- Variants: **Hold'em, PLO/PLO5 (2+3 rule), Short Deck (36 cards), All-in or Fold, Rush & Cash,
+- Variants: **Hold'em, PLO/PLO5/PLO6 (2+3 rule), Short Deck (36 cards), All-in or Fold, Rush & Cash,
   Spin & Gold SNG** (3-handed, prize wheel, escalating blinds, winner-takes-all),
   Mystery Battle Royale tables.
 - Bot opponents with Monte-Carlo equity decisions fill empty seats; stack persistence.
@@ -230,7 +230,7 @@ Faithful to the installed client:
 - lobby layout, top navigation, game tabs, table list and side rail, built from the client's own artwork;
 - the original sound effects, lobby music and many table/notification cues;
 - the string table's 30 locales (including RTL Arabic) for the shared UI vocabulary;
-- cash-game, tournament, Spin & Gold and Mystery Battle Royale formats with a server-authoritative engine;
+- cash-game Hold'em, PLO, PLO5, PLO6, Short Deck, tournament, Spin & Gold and Mystery Battle Royale formats with a server-authoritative engine;
 - cashier, rewards, missions, GG Pass, Fish Buffet, Ocean Rewards, GG Care, Honeymoon, Prop Bet, hand history and support.
 
 Deliberate approximations in this local build:
@@ -251,7 +251,7 @@ Goldfish reviews and the consolidated disposition are in
 
 The review changed the code: `addTransaction` is now a single SQLite
 transaction, the deck shuffle uses `node:crypto`, the app enforces a single
-instance, CDP is gated to dev, request bodies are capped, and 11 committed
+instance, CDP is gated to dev, request bodies are capped, and 35 committed
 `node:test` cases cover the engine and ledger (`cd app && pnpm test`).
 
 ## Notes / scope
diff --git a/app/electron/main.cjs b/app/electron/main.cjs
index c6119ad..7ac12b1 100644
--- a/app/electron/main.cjs
+++ b/app/electron/main.cjs
@@ -1,7 +1,6 @@
-const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
+const { app, BrowserWindow, ipcMain, Menu, shell, dialog, session } = require('electron');
 const path = require('node:path');
 const { spawn } = require('node:child_process');
-const http = require('node:http');
 const fs = require('node:fs');
 
 
@@ -23,7 +22,7 @@ try { require('node:fs').mkdirSync(app.getPath('userData'), { recursive: true })
 
 const DEV = process.env.GGPOKER_DEV === '1';
 const PORT = Number(process.env.GGPOKER_PORT || 5198);
-const URL = DEV ? 'http://localhost:5199' : `http://127.0.0.1:${PORT}`;
+let URL = DEV ? 'http://localhost:5199' : `http://127.0.0.1:${PORT}`;
 
 if (DEV || process.env.GGPOKER_CDP === '1') {
   app.commandLine.appendSwitch('remote-debugging-port', '9333');
@@ -32,20 +31,39 @@ if (DEV || process.env.GGPOKER_CDP === '1') {
 let win = null;
 let serverProc = null;
 
-function waitForServer(timeoutMs = 20000) {
-  const start = Date.now();
+const CSP = "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:*; font-src 'self' data:;";
+
+function installCsp() {
+  if (DEV) return;
+  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
+    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP] } });
+  });
+}
+
+function waitForListening(child, timeoutMs = 15000) {
   return new Promise((resolve, reject) => {
-    const tick = () => {
-      const req = http.get(`http://127.0.0.1:${PORT}/api/lobby`, (res) => {
-        res.resume();
-        resolve();
-      });
-      req.on('error', () => {
-        if (Date.now() - start > timeoutMs) reject(new Error('server did not start'));
-        else setTimeout(tick, 250);
-      });
+    let buffer = '';
+    let settled = false;
+    const cleanup = () => {
+      child.stdout.off('data', onData);
+      child.off('exit', onExit);
+      clearTimeout(timer);
+    };
+    const finish = (fn, value) => {
+      if (settled) return;
+      settled = true;
+      cleanup();
+      fn(value);
     };
-    tick();
+    const onData = (chunk) => {
+      buffer += String(chunk);
+      const match = buffer.match(/LISTENING (\d+)/);
+      if (match) finish(resolve, Number(match[1]));
+    };
+    const onExit = (code) => finish(reject, new Error(`server exited before listening (code ${code})`));
+    const timer = setTimeout(() => finish(reject, new Error('server did not report a listening port')), timeoutMs);
+    child.stdout.on('data', onData);
+    child.once('exit', onExit);
   });
 }
 
@@ -64,7 +82,13 @@ async function startServer() {
   });
   serverProc.stdout.on('data', (d) => console.log('[server]', String(d).trim()));
   serverProc.stderr.on('data', (d) => console.error('[server]', String(d).trim()));
-  await waitForServer();
+  try {
+    const port = await waitForListening(serverProc);
+    URL = `http://127.0.0.1:${port}`;
+  } catch (e) {
+    try { serverProc.kill(); } catch { /* ignore */ }
+    throw e;
+  }
 }
 
 function createWindow() {
@@ -85,7 +109,7 @@ function createWindow() {
       preload: path.join(__dirname, 'preload.cjs'),
       contextIsolation: true,
       nodeIntegration: false,
-      sandbox: false,
+      sandbox: true,
     },
   });
   win.loadURL(URL);
@@ -105,7 +129,7 @@ function createWindow() {
           width: 1200, height: 961, minWidth: 980, minHeight: 720,
           frame: false, transparent: false, backgroundColor: '#0a0a0b',
           hasShadow: true, title: 'DanGG.ro',
-          webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
+          webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
         },
       };
     }
@@ -130,6 +154,9 @@ app.whenReady().then(async () => {
     await startServer();
   } catch (e) {
     console.error('Failed to start local server', e);
+    dialog.showErrorBox('DanGG.ro could not start', `The local server failed to start.\n\nData: ${app.getPath('userData')}\n\n${e && e.message ? e.message : e}`);
+    app.quit();
+    return;
   }
   if (process.platform === 'darwin') {
     Menu.setApplicationMenu(Menu.buildFromTemplate([
@@ -145,6 +172,7 @@ app.whenReady().then(async () => {
       { role: 'windowMenu' },
     ]));
   }
+  installCsp();
   createWindow();
   app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
 });
diff --git a/app/electron/preload.cjs b/app/electron/preload.cjs
index 13cf770..ee80970 100644
--- a/app/electron/preload.cjs
+++ b/app/electron/preload.cjs
@@ -5,5 +5,5 @@ contextBridge.exposeInMainWorld('ggDesktop', {
   minimize: () => ipcRenderer.invoke('win:minimize'),
   maximize: () => ipcRenderer.invoke('win:maximize'),
   isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
-  platform: process.platform,
+  platform: (typeof process !== 'undefined' && process.platform) || 'darwin',
 });
diff --git a/app/package.json b/app/package.json
index e9f1edb..6b909f3 100644
--- a/app/package.json
+++ b/app/package.json
@@ -4,7 +4,7 @@
   "version": "1.0.0",
   "type": "module",
   "scripts": {
-    "dev": "concurrently -k \"node server/index.js\" \"vite --port 5199 --strictPort\"",
+    "dev": "concurrently -k \"GGPOKER_DEV=1 node server/index.js\" \"vite --port 5199 --strictPort\"",
     "build": "vite build",
     "start": "node server/index.js",
     "serve": "node server/index.js",
diff --git a/app/server/claims.test.js b/app/server/claims.test.js
new file mode 100644
index 0000000..d11a832
--- /dev/null
+++ b/app/server/claims.test.js
@@ -0,0 +1,51 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import fs from 'node:fs';
+import os from 'node:os';
+import path from 'node:path';
+
+process.env.GGPOKER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'dangro-claims-'));
+const { db, bumpMission, claimReward, getClaim, missionPeriodKey } = await import('./db.js');
+const [u1, u2] = db.prepare('SELECT id FROM users ORDER BY id LIMIT 2').all();
+
+test('mission progress and claims are per user', () => {
+  bumpMission(u1.id, 'daily-hands', 20);
+  assert.equal(getClaim(u1.id, 'mission', missionPeriodKey('daily-hands')).progress, 20);
+  assert.equal(getClaim(u2.id, 'mission', missionPeriodKey('daily-hands')), undefined);
+
+  const first = claimReward(u1.id, 'mission', missionPeriodKey('daily-hands'), 5000, 'USD', 'hands');
+  assert.equal(first.claimed, true);
+  const second = claimReward(u1.id, 'mission', missionPeriodKey('daily-hands'), 5000, 'USD', 'hands');
+  assert.equal(second.claimed, false);
+  assert.equal(getClaim(u1.id, 'mission', missionPeriodKey('daily-hands')).claimed, 1);
+
+  bumpMission(u2.id, 'daily-hands', 20);
+  assert.equal(claimReward(u2.id, 'mission', missionPeriodKey('daily-hands'), 5000, 'USD', 'hands').claimed, true);
+});
+
+test('a crash between award and flag repairs from the ledger amount', () => {
+  claimReward(u1.id, 'mission', 'crash-check', 500, 'USD', 'crash');
+  db.prepare("UPDATE player_claims SET claimed = 0 WHERE user_id = ? AND kind = 'mission' AND period_key = 'crash-check'").run(u1.id);
+  const repaired = claimReward(u1.id, 'mission', 'crash-check', 999, 'USD', 'crash');
+  assert.equal(repaired.claimed, true);
+  assert.equal(repaired.amount, 500);
+  assert.equal(getClaim(u1.id, 'mission', 'crash-check').amount, 500);
+});
+
+test('daily claim is once per period and survives a retry', () => {
+  const a = claimReward(u1.id, 'daily', '2026-11-11', 500, 'USD', 'daily');
+  const b = claimReward(u1.id, 'daily', '2026-11-11', 500, 'USD', 'daily');
+  assert.equal(a.claimed, true);
+  assert.equal(b.claimed, false);
+  assert.equal(getClaim(u1.id, 'daily', '2026-11-11').claimed, 1);
+});
+
+
+test('mission period rolls over daily and weekly', () => {
+  const a = missionPeriodKey('daily-hands', Date.UTC(2026, 10, 11));
+  const b = missionPeriodKey('daily-hands', Date.UTC(2026, 10, 12));
+  const w1 = missionPeriodKey('weekly-vip', Date.UTC(2026, 10, 11));
+  const w2 = missionPeriodKey('weekly-vip', Date.UTC(2026, 10, 18));
+  assert.notEqual(a, b);
+  assert.notEqual(w1, w2);
+});
diff --git a/app/server/db.js b/app/server/db.js
index 51482ca..abfca5c 100644
--- a/app/server/db.js
+++ b/app/server/db.js
@@ -54,7 +54,7 @@ function init() {
   CREATE TABLE IF NOT EXISTS tables (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
-    game TEXT NOT NULL,             -- holdem | omaha | omaha5 | shortdeck | rush | aof | spingold | battleroyale | flipandgo
+    game TEXT NOT NULL,             -- holdem | omaha | omaha5 | omaha6 | shortdeck | rush | aof | spingold | battleroyale | flipandgo
     category TEXT NOT NULL,         -- Diamond | Platinum | Gold | Silver ...
     sb INTEGER NOT NULL,
     bb INTEGER NOT NULL,
@@ -95,6 +95,9 @@ function init() {
     starting_stack INTEGER NOT NULL DEFAULT 10000,
     blind_speed INTEGER NOT NULL DEFAULT 8,
     format TEXT DEFAULT 'NLH',
+    mode TEXT DEFAULT 'STANDARD',
+    bounty INTEGER DEFAULT 0,
+    ticket TEXT DEFAULT '',
     banner TEXT DEFAULT '',
     enabled INTEGER NOT NULL DEFAULT 1
   );
@@ -203,11 +206,61 @@ function init() {
 
   try { db.exec('ALTER TABLE hands ADD COLUMN actions TEXT'); } catch { /* already exists */ }
   try { db.exec("ALTER TABLE sessions ADD COLUMN device TEXT DEFAULT ''"); } catch { /* already exists */ }
+  try { db.exec('ALTER TABLE users ADD COLUMN deleted_at TEXT'); } catch { /* already exists */ }
+  try { db.exec("ALTER TABLE tournaments ADD COLUMN mode TEXT DEFAULT 'STANDARD'"); } catch { /* already exists */ }
+  try { db.exec('ALTER TABLE tournaments ADD COLUMN bounty INTEGER DEFAULT 0'); } catch { /* already exists */ }
+  try { db.exec("ALTER TABLE tournaments ADD COLUMN ticket TEXT DEFAULT ''"); } catch { /* already exists */ }
+  db.exec("UPDATE tournaments SET mode='FLIP' WHERE name LIKE 'Flip & Go%' AND (mode IS NULL OR mode='STANDARD')");
+  db.exec("UPDATE tournaments SET mode='BOUNTY', bounty=500 WHERE name LIKE 'Bounty Hunters%' AND (mode IS NULL OR mode='STANDARD')");
+  db.exec("UPDATE tournaments SET mode='MYSTERY', bounty=1000 WHERE name LIKE 'Mystery Bounty%' AND (mode IS NULL OR mode='STANDARD')");
+  try { db.exec('ALTER TABLE transactions ADD COLUMN session_id TEXT'); } catch { /* already exists */ }
+  try { db.exec('ALTER TABLE transactions ADD COLUMN reference TEXT'); } catch { /* already exists */ }
+  const refIndex = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_transactions_reference'").get();
+  if (refIndex && /WHERE/i.test(refIndex.sql || '')) db.exec('DROP INDEX idx_transactions_reference');
+  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(user_id, reference)");
+  db.exec("CREATE INDEX IF NOT EXISTS idx_transactions_session ON transactions(session_id)");
+  db.exec(`CREATE TABLE IF NOT EXISTS player_claims (
+    user_id INTEGER NOT NULL,
+    kind TEXT NOT NULL,
+    period_key TEXT NOT NULL,
+    progress INTEGER NOT NULL DEFAULT 0,
+    claimed INTEGER NOT NULL DEFAULT 0,
+    amount INTEGER NOT NULL DEFAULT 0,
+    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
+    PRIMARY KEY (user_id, kind, period_key)
+  )`);
+  db.prepare(`INSERT OR IGNORE INTO player_claims (user_id, kind, period_key, progress, claimed, amount)
+    SELECT user_id,
+      CASE WHEN day = 'honey-welcome' OR day LIKE 'honey-%' THEN 'honeymoon'
+           WHEN day LIKE 'care-%' THEN 'ggcare' ELSE 'daily' END,
+      CASE WHEN day = 'honey-welcome' THEN 'welcome'
+           WHEN day LIKE 'honey-%' THEN substr(day, 7)
+           WHEN day LIKE 'care-%' THEN substr(day, 6) ELSE day END,
+      0, 1, amount
+    FROM daily_claims`).run();
   const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
   if (!count) seed();
+  ensurePloVariants();
   ensureSeries();
 }
 
+function ensurePloVariants() {
+  const ins = db.prepare(`INSERT OR IGNORE INTO tables
+    (id,name,game,category,sb,bb,ante,min_buyin,max_buyin,seats,speed,featured,sort)
+    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
+  let sort = 900;
+  for (const [game, label] of [['omaha5', 'PLO5'], ['omaha6', 'PLO6']]) {
+    for (let i = 1; i <= 6; i++) {
+      ins.run(`${game}-platinum-${i}`, `${label} Platinum ${String(i).padStart(2, '0')}`, game, 'Platinum',
+        500, 1000, 0, 20000, 100000, 6, 'Normal', 0, sort++);
+    }
+  }
+  for (let i = 1; i <= 4; i++) {
+    ins.run(`spingold6-${i}`, `Spin & Gold 6-Max ${i}`, 'spingold', 'Spin',
+      500, 1000, 0, 30000, 30000, 6, 'Fast', 0, 950 + i);
+  }
+}
+
 function ensureSeries() {
   const tins = db.prepare(`INSERT INTO tournaments (id,name,buyin,fee,gtd,start_at,entrants,format) VALUES (?,?,?,?,?,?,?,?)`);
   for (const [id, name, buyin, fee, gtd, hours, fmt] of [
@@ -218,6 +271,13 @@ function ensureSeries() {
       tins.run(id, name, buyin, fee, gtd * 100, new Date(Date.now() + hours * 3600_000).toISOString(), 300 + (gtd % 400), fmt);
     }
   }
+  if (!db.prepare("SELECT 1 FROM tournaments WHERE id = 'sat-sunday'").get()) {
+    tins.run('sat-sunday', '$1 Step to Sunday Major', 1000, 100, 0, new Date(Date.now() + 8 * 3600_000).toISOString(), 240, 'NLH');
+    db.prepare("UPDATE tournaments SET mode='SATELLITE', ticket='Sunday Major $250K' WHERE id='sat-sunday'").run();
+  }
+  db.exec("UPDATE tournaments SET mode='FLIP' WHERE name LIKE 'Flip & Go%' AND mode='STANDARD'");
+  db.exec("UPDATE tournaments SET mode='BOUNTY', bounty=500 WHERE name LIKE 'Bounty Hunters%' AND mode='STANDARD'");
+  db.exec("UPDATE tournaments SET mode='MYSTERY', bounty=1000 WHERE name LIKE 'Mystery Bounty%' AND mode='STANDARD'");
 }
 
 function seed() {
@@ -346,22 +406,126 @@ export function setSetting(key, value) {
     .run(key, JSON.stringify(value));
 }
 
-export function addTransaction(userId, kind, amount, memo, currency = 'USD') {
+export function addTransactionEx(userId, kind, amount, memo, currency = 'USD', opts = {}) {
+  const { sessionId = null, reference = null, onDuplicate = 'throw' } = opts;
   const col = currency === 'PLAY' ? 'play_chips' : currency === 'TICKET' ? 'tickets' : currency === 'GEM' ? 'gems' : 'balance';
   db.exec('BEGIN IMMEDIATE');
   try {
+    const row = db.prepare(`SELECT ${col} v FROM users WHERE id = ?`).get(userId);
+    if (!row) throw new Error('user not found');
+    if (reference) {
+      const predicted = row.v + amount;
+      const sql = onDuplicate === 'skip'
+        ? `INSERT INTO transactions (user_id,kind,currency,amount,balance_after,memo,session_id,reference) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id,reference) DO NOTHING`
+        : `INSERT INTO transactions (user_id,kind,currency,amount,balance_after,memo,session_id,reference) VALUES (?,?,?,?,?,?,?,?)`;
+      const info = db.prepare(sql).run(userId, kind, currency, amount, predicted, memo || '', sessionId, reference);
+      if (info.changes === 0) {
+        db.exec('COMMIT');
+        return { applied: false, balance: row.v };
+      }
+      db.prepare(`UPDATE users SET ${col} = ? WHERE id = ?`).run(predicted, userId);
+      db.exec('COMMIT');
+      return { applied: true, balance: predicted };
+    }
     db.prepare(`UPDATE users SET ${col} = ${col} + ? WHERE id = ?`).run(amount, userId);
     const after = db.prepare(`SELECT ${col} v FROM users WHERE id = ?`).get(userId).v;
-    db.prepare('INSERT INTO transactions (user_id,kind,currency,amount,balance_after,memo) VALUES (?,?,?,?,?,?)')
-      .run(userId, kind, currency, amount, after, memo || '');
+    db.prepare('INSERT INTO transactions (user_id,kind,currency,amount,balance_after,memo,session_id) VALUES (?,?,?,?,?,?,?)')
+      .run(userId, kind, currency, amount, after, memo || '', sessionId);
     db.exec('COMMIT');
-    return after;
+    return { applied: true, balance: after };
   } catch (err) {
     try { db.exec('ROLLBACK'); } catch { /* ignore */ }
     throw err;
   }
 }
 
+export function addTransaction(userId, kind, amount, memo, currency = 'USD') {
+  return addTransactionEx(userId, kind, amount, memo, currency).balance;
+}
+
+export function openSessions() {
+  return db.prepare(`SELECT t.user_id, t.session_id,
+      -SUM(CASE WHEN t.kind IN ('buyin','rebuy') THEN t.amount ELSE 0 END) AS chips_in
+    FROM transactions t
+    WHERE t.session_id IS NOT NULL
+    GROUP BY t.user_id, t.session_id
+    HAVING SUM(CASE WHEN t.reference LIKE 'out:%' OR t.reference LIKE 'refund:%' THEN 1 ELSE 0 END) = 0
+       AND -SUM(CASE WHEN t.kind IN ('buyin','rebuy') THEN t.amount ELSE 0 END) > 0`).all();
+}
+
+export function refundOpenSessions(options = {}) {
+  const refund = options.refund || addTransactionEx;
+  let refunded = 0;
+  for (const s of openSessions()) {
+    try {
+      const tableId = String(s.session_id).split(':')[0] || 'table';
+      const award = refund(s.user_id, 'buyin_refund', s.chips_in, `Crash refund ${tableId}`, 'USD', {
+        sessionId: s.session_id, reference: `refund:${s.session_id}`, onDuplicate: 'skip',
+      });
+      if (award.applied) refunded++;
+    } catch (e) {
+      console.error('refund session failed', s.session_id, e && e.message);
+    }
+  }
+  return refunded;
+}
+
+export function getClaim(userId, kind, periodKey) {
+  return db.prepare('SELECT * FROM player_claims WHERE user_id = ? AND kind = ? AND period_key = ?').get(userId, kind, periodKey);
+}
+
+export function claimReward(userId, kind, periodKey, amount, currency = 'USD', memo = '') {
+  db.prepare(`INSERT INTO player_claims (user_id, kind, period_key, progress, claimed, amount)
+    VALUES (?,?,?,0,0,0) ON CONFLICT(user_id, kind, period_key) DO NOTHING`).run(userId, kind, periodKey);
+  const row = getClaim(userId, kind, periodKey);
+  if (row.claimed) return { claimed: false, amount: row.amount };
+  const reference = `claim:${kind}:${periodKey}`;
+  const award = addTransactionEx(userId, kind, amount, memo || `${kind} reward`, currency, {
+    reference, onDuplicate: 'skip',
+  });
+  let paid = amount;
+  if (!award.applied) {
+    const prior = db.prepare('SELECT amount FROM transactions WHERE user_id = ? AND reference = ?').get(userId, reference);
+    if (prior) paid = prior.amount;
+  }
+  db.prepare(`UPDATE player_claims SET claimed = 1, amount = ?, updated_at = datetime('now')
+    WHERE user_id = ? AND kind = ? AND period_key = ?`).run(paid, userId, kind, periodKey);
+  return { claimed: true, amount: paid, balance: award.balance, reapplied: !award.applied };
+}
+
+export function missionPeriodKey(missionId, now = Date.now()) {
+  const d = new Date(now);
+  if (String(missionId).startsWith('weekly-')) {
+    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
+    const dow = t.getUTCDay() || 7;
+    t.setUTCDate(t.getUTCDate() + 4 - dow);
+    const year = t.getUTCFullYear();
+    const yearStart = new Date(Date.UTC(year, 0, 1));
+    const week = Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
+    return `mission:${missionId}:week:${year}-W${String(week).padStart(2, '0')}`;
+  }
+  return `mission:${missionId}:day:${d.toISOString().slice(0, 10)}`;
+}
+
+export function bumpMission(userId, missionId, delta = 1) {
+  const m = db.prepare('SELECT goal FROM missions WHERE id = ?').get(missionId);
+  if (!m) return;
+  const period = missionPeriodKey(missionId);
+  db.prepare(`INSERT INTO player_claims (user_id, kind, period_key, progress, claimed, amount)
+    VALUES (?, 'mission', ?, 0, 0, 0) ON CONFLICT(user_id, kind, period_key) DO NOTHING`).run(userId, period);
+  db.prepare(`UPDATE player_claims SET progress = MIN(?, progress + ?), updated_at = datetime('now')
+    WHERE user_id = ? AND kind = 'mission' AND period_key = ?`).run(m.goal, delta, userId, period);
+}
+
+export function setMissionDone(userId, missionId) {
+  const m = db.prepare('SELECT goal FROM missions WHERE id = ?').get(missionId);
+  if (!m) return;
+  const period = missionPeriodKey(missionId);
+  db.prepare(`INSERT INTO player_claims (user_id, kind, period_key, progress, claimed, amount)
+    VALUES (?, 'mission', ?, ?, 0, 0)
+    ON CONFLICT(user_id, kind, period_key) DO UPDATE SET progress = excluded.progress, updated_at = datetime('now')`).run(userId, period, m.goal);
+}
+
 export function newSession(userId, device = '') {
   const token = randomUUID();
   const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
@@ -371,7 +535,8 @@ export function newSession(userId, device = '') {
 
 export function userByToken(token) {
   if (!token) return null;
-  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > datetime('now')`).get(token);
+  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
+    WHERE s.token = ? AND s.expires_at > datetime('now') AND u.deleted_at IS NULL`).get(token);
   return row || null;
 }
 
diff --git a/app/server/engine.test.js b/app/server/engine.test.js
index 0334242..e29b6a0 100644
--- a/app/server/engine.test.js
+++ b/app/server/engine.test.js
@@ -56,13 +56,17 @@ test('bestOmaha uses exactly two hole cards and three board cards', () => {
   assert.notEqual(noFalseRoyal.name, 'Royal Flush');
 });
 
-test('rake is floored at 5% and capped at 3 big blinds', () => {
+test('rake is floored at 5% and capped by rakeCap (default 300)', () => {
   const t = tableWith([player(1, 'A', 1000, 0, [])], { seats: 1 });
   assert.equal(t.computeRake(1000), 50);
   assert.equal(t.computeRake(1010), 50);
   assert.equal(t.computeRake(10000), 300);
   const capped = tableWith([player(1, 'A', 1000, 0, [])], { seats: 1, rakeCap: 120 });
   assert.equal(capped.computeRake(10000), 120);
+  const high = tableWith([player(1, 'A', 1000, 0, [])], { seats: 1, bb: 2000 });
+  assert.equal(high.computeRake(100000), 300);
+  const zero = tableWith([player(1, 'A', 1000, 0, [])], { seats: 1, rakeCap: 0 });
+  assert.equal(zero.computeRake(10000), 300);
 });
 
 test('showdown builds side pots and conserves chips', () => {
@@ -106,3 +110,150 @@ test('tournament winner receives half the prize pool exactly once and fires the
   assert.equal(paid, 1);
   assert.equal(ends, 1);
 });
+
+
+test('places 2 and 3 are paid 30% and 20%, then the winner takes 50%', () => {
+  const p1 = player(1, 'Winner', 1000, 0, []);
+  const p2 = player(2, 'Second', 0, 0, []);
+  const p3 = player(3, 'Third', 0, 0, []);
+  const t = tableWith([p1, p2, p3], { seats: 3, tournament: { prizePool: 3000 } });
+  t.street = 'ended';
+  t.nextHandAt = 1;
+  const payouts = [];
+  let endPrize = 0;
+  t.hooks = {
+    onTournamentPayout: (_table, p) => payouts.push(p),
+    onTournamentEnd: (_table, w) => { endPrize = w.prize; },
+  };
+  t.tick(2);
+  assert.deepEqual(payouts.map((p) => [p.place, p.payout]), [[2, 900], [3, 600]]);
+  assert.equal(endPrize, 1500);
+});
+
+
+test('elimination bust fires onSeatBusted before the seat is cleared', () => {
+  const p1 = player(1, 'Spin winner', 1000, 0, []);
+  const p2 = player(2, 'Busted A', 0, 0, []);
+  const p3 = player(3, 'Busted B', 0, 0, []);
+  const t = tableWith([p1, p2, p3], { seats: 3, game: 'spingold' });
+  t.street = 'ended';
+  t.nextHandAt = 1;
+  const busted = [];
+  t.hooks = { onSeatBusted: (_table, p) => busted.push(p.id), onHandComplete: () => {} };
+  t.tick(2);
+  assert.deepEqual(busted.sort(), [2, 3]);
+});
+
+
+test('a throwing onSeatBusted hook still clears the busted seat', () => {
+  const p1 = player(1, 'Winner', 1000, 0, []);
+  const p2 = player(2, 'Busted', 0, 0, []);
+  const p3 = player(3, 'Busted too', 0, 0, []);
+  const t = tableWith([p1, p2, p3], { seats: 3, game: 'spingold' });
+  t.street = 'ended';
+  t.nextHandAt = 1;
+  t.hooks = { onSeatBusted: () => { throw new Error('hook failed'); }, onHandComplete: () => {} };
+  t.tick(2);
+  assert.equal(t.seats[1].player, null);
+  assert.equal(t.seats[2].player, null);
+});
+
+
+test('spin award reports the minted prize', () => {
+  const p1 = player(1, 'Winner', 1000, 0, []);
+  const p2 = player(2, 'Busted', 0, 0, []);
+  const t = tableWith([p1, p2], { seats: 2, game: 'spingold' });
+  t.spinPrize = 250;
+  t.street = 'ended';
+  t.nextHandAt = 1;
+  let minted = 0;
+  t.hooks = { onMint: (_table, kind, amount) => { if (kind === 'spin') minted += amount; }, onHandComplete: () => {} };
+  t.tick(2);
+  assert.equal(minted, 250);
+});
+
+
+test('snapshots and events carry a table epoch and monotonic version', () => {
+  const p1 = player(1, 'A', 1000, 0, []);
+  const t = tableWith([p1], { seats: 1 });
+  const before = t.snapshotFor();
+  t.emit({ type: 'test' });
+  const after = t.snapshotFor();
+  assert.equal(before.tableEpoch, after.tableEpoch);
+  assert.equal(after.tableVersion, before.tableVersion + 1);
+});
+
+
+test('PLO5 and PLO6 deal five and six hole cards', () => {
+  const p1 = player(1, 'A', 1000, 0, []);
+  const p2 = player(2, 'B', 1000, 0, []);
+  const t5 = tableWith([p1, p2], { seats: 2, game: 'omaha5' });
+  assert.equal(t5.omahaHole, 5);
+  const t6 = tableWith([p1, p2], { seats: 2, game: 'omaha6' });
+  assert.equal(t6.omahaHole, 6);
+});
+
+
+test('Flip & Go marks its first hand all-in', () => {
+  const p1 = player(1, 'A', 10000, 0, []);
+  const p2 = player(2, 'B', 10000, 0, []);
+  const t = tableWith([p1, p2], { seats: 2, tournament: { prizePool: 100000, mode: 'FLIP' } });
+  t.street = 'idle';
+  t.handNo = 0;
+  t.startHand();
+  assert.equal(t.handNo, 1);
+  assert.ok(t.street === 'ended' || t.street === 'showdown' || t.street === 'river');
+});
+
+test('Bounty and satellite tournament modes are wired', () => {
+  const p1 = player(1, 'Winner', 5000, 0, []);
+  const p2 = player(2, 'Busted', 0, 0, []);
+  const p3 = player(3, 'Third', 0, 0, []);
+  const t = tableWith([p1, p2, p3], { seats: 3, tournament: { prizePool: 10000, mode: 'BOUNTY', bounty: 500 } });
+  t.lastAggressor = 1;
+  t.street = 'ended';
+  t.nextHandAt = 1;
+  let paid = 0;
+  t.hooks = { onBounty: (_t, info) => { paid += info.amount; }, onTournamentPayout: () => {}, onTournamentEnd: () => {} };
+  t.tick(2);
+  assert.equal(paid, 1000);
+
+  const sat = tableWith([player(1, 'Seat', 100, 0, [])], { seats: 1, tournament: { prizePool: 0, mode: 'SATELLITE', ticket: 'Sunday Major' } });
+  let ticket = null;
+  sat.hooks = { onTournamentEnd: (table, w) => { ticket = w.ticket; } };
+  sat.awardTournamentWinner();
+  assert.equal(ticket, 'Sunday Major');
+  assert.equal(sat.tournament.winner.prize, 0);
+});
+
+
+test('All-in or Fold asks each player and only accepts all-in or fold', () => {
+  const p1 = player(1, 'A', 1000, 0, []);
+  const p2 = player(2, 'B', 1000, 0, []);
+  const t = tableWith([p1, p2], { seats: 2, game: 'aof' });
+  t.street = 'idle';
+  t.handNo = 0;
+  t.startHand();
+  assert.ok(t.actor);
+  const first = t.actor;
+  assert.equal(t.act(first, 'check').ok, false);
+  assert.equal(t.act(first, 'allin').ok, true);
+  const second = t.actor;
+  if (second) t.act(second, 'fold');
+  assert.ok(['showdown', 'ended', 'river'].includes(t.street));
+});
+
+
+test('straddle posts a third blind and opens action after it', () => {
+  const p1 = player(1, 'A', 10000, 0, []);
+  const p2 = player(2, 'B', 10000, 0, []);
+  const p3 = player(3, 'C', 10000, 0, []);
+  const t = tableWith([p1, p2, p3], { seats: 3, straddle: true });
+  t.street = 'idle';
+  t.handNo = 0;
+  t.startHand();
+  const straddler = [p1, p2, p3].find((p) => p.lastAction?.action === 'Straddle');
+  assert.ok(straddler);
+  assert.equal(straddler.totalBet, 200);
+  assert.ok(t.actor);
+});
diff --git a/app/server/http.test.js b/app/server/http.test.js
new file mode 100644
index 0000000..2c27320
--- /dev/null
+++ b/app/server/http.test.js
@@ -0,0 +1,174 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import { spawn } from 'node:child_process';
+import { DatabaseSync } from 'node:sqlite';
+import WebSocket from 'ws';
+import fs from 'node:fs';
+import os from 'node:os';
+import path from 'node:path';
+
+const root = path.resolve(import.meta.dirname, '..');
+
+function startServer() {
+  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'dangro-http-'));
+  const child = spawn(process.execPath, ['server/index.js'], {
+    cwd: root,
+    env: { ...process.env, PORT: '0', GGPOKER_DATA: data },
+    stdio: ['ignore', 'pipe', 'pipe'],
+  });
+  return new Promise((resolve, reject) => {
+    let out = '';
+    const timer = setTimeout(() => { child.kill(); reject(new Error('timeout')); }, 15000);
+    child.stdout.on('data', (d) => {
+      out += String(d);
+      const m = out.match(/LISTENING (\d+)/);
+      if (m) { clearTimeout(timer); resolve({ child, port: Number(m[1]), data }); }
+    });
+    child.stderr.on('data', (d) => process.stderr.write(d));
+    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`exit ${code}`)); });
+  });
+}
+
+test('server binds an ephemeral port and serves the API', async () => {
+  const { child, port, data } = await startServer();
+  try {
+    const lobby = await fetch(`http://127.0.0.1:${port}/api/lobby`).then((r) => r.json());
+    assert.ok(Array.isArray(lobby.tables));
+    assert.equal(lobby.tables[0].synthetic, true);
+    const badOrigin = await fetch(`http://127.0.0.1:${port}/api/lobby`, { headers: { origin: 'http://evil.example' } });
+    assert.equal(badOrigin.status, 403);
+    const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
+      method: 'POST', headers: { 'content-type': 'application/json' },
+      body: JSON.stringify({ login: 'DansiDanutz', password: 'ggpoker' }),
+    }).then((r) => r.json());
+    assert.ok(login.token);
+    const deposit = await fetch(`http://127.0.0.1:${port}/api/cashier/deposit`, {
+      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}` },
+      body: JSON.stringify({ amount: 1000, method: 'card' }),
+    }).then((r) => r.json());
+    assert.equal(deposit.ok, true);
+    const first = await fetch(`http://127.0.0.1:${port}/api/cashier/deposit`, {
+      method: 'POST',
+      headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}`, 'idempotency-key': 'test-key-1' },
+      body: JSON.stringify({ amount: 700, method: 'card' }),
+    }).then((r) => r.json());
+    const second = await fetch(`http://127.0.0.1:${port}/api/cashier/deposit`, {
+      method: 'POST',
+      headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}`, 'idempotency-key': 'test-key-1' },
+      body: JSON.stringify({ amount: 700, method: 'card' }),
+    }).then((r) => r.json());
+    assert.equal(first.balance, second.balance);
+    assert.equal(second.replayed, true);
+    const conflict = await fetch(`http://127.0.0.1:${port}/api/cashier/deposit`, {
+      method: 'POST',
+      headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}`, 'idempotency-key': 'test-key-1' },
+      body: JSON.stringify({ amount: 800, method: 'card' }),
+    });
+    assert.equal(conflict.status, 409);
+    const w1 = await fetch(`http://127.0.0.1:${port}/api/cashier/withdraw`, {
+      method: 'POST',
+      headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}`, 'idempotency-key': 'wd-1' },
+      body: JSON.stringify({ amount: 100, method: 'bank' }),
+    }).then((r) => r.json());
+    const w2 = await fetch(`http://127.0.0.1:${port}/api/cashier/withdraw`, {
+      method: 'POST',
+      headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}`, 'idempotency-key': 'wd-1' },
+      body: JSON.stringify({ amount: 100, method: 'bank' }),
+    }).then((r) => r.json());
+    assert.equal(w1.balance, w2.balance);
+    assert.equal(w2.replayed, true);
+    const reg = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
+      method: 'POST', headers: { 'content-type': 'application/json' },
+      body: JSON.stringify({ login: 'freshuser', nick: 'Fresh', password: 'fresh' }),
+    }).then((r) => r.json());
+    assert.equal(reg.user.balance, 600000);
+    const regCash = await fetch(`http://127.0.0.1:${port}/api/cashier`, {
+      headers: { authorization: `Bearer ${reg.token}` },
+    }).then((r) => r.json());
+    assert.equal(regCash.user.balance, 600000);
+    assert.equal(regCash.transactions.find((t) => t.kind === 'welcome')?.amount, 600000);
+    const bad = await fetch(`http://127.0.0.1:${port}/api/admin/users/1`, {
+      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}` },
+      body: JSON.stringify({ action: 'credit', amount: 1 }),
+    });
+    assert.equal(bad.status, 403);
+    const admin = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
+      method: 'POST', headers: { 'content-type': 'application/json' },
+      body: JSON.stringify({ login: 'admin', password: 'admin123' }),
+    }).then((r) => r.json());
+    const del = await fetch(`http://127.0.0.1:${port}/api/admin/users/3`, {
+      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${admin.token}` },
+      body: JSON.stringify({ action: 'delete' }),
+    }).then((r) => r.json());
+    assert.equal(del.ok, true);
+    const guest = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
+      method: 'POST', headers: { 'content-type': 'application/json' },
+      body: JSON.stringify({ login: 'guest', password: 'guest' }),
+    });
+    assert.equal(guest.status, 400);
+    const db = new DatabaseSync(path.join(data, 'ggpoker.db'));
+    const deleted = db.prepare('SELECT deleted_at, login FROM users WHERE id = 3').get();
+    assert.ok(deleted.deleted_at);
+    assert.ok(deleted.login.startsWith('deleted:3:'));
+  } finally {
+    child.kill();
+  }
+});
+
+
+test('live join and leave write matching session markers', async () => {
+  const { child, port, data } = await startServer();
+  try {
+    const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
+      method: 'POST', headers: { 'content-type': 'application/json' },
+      body: JSON.stringify({ login: 'DansiDanutz', password: 'ggpoker' }),
+    }).then((r) => r.json());
+    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${login.token}`);
+    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
+    ws.send(JSON.stringify({ type: 'join_table', tableId: 'nlh-diamond-01', buyin: 50000 }));
+    await new Promise((r) => setTimeout(r, 1800));
+    ws.send(JSON.stringify({ type: 'leave_table', tableId: 'nlh-diamond-01' }));
+    await new Promise((r) => setTimeout(r, 600));
+    ws.close();
+    const db = new DatabaseSync(path.join(data, 'ggpoker.db'));
+    const rows = db.prepare("SELECT kind, amount, session_id, reference FROM transactions WHERE session_id IS NOT NULL ORDER BY id").all();
+    assert.equal(rows[0].kind, 'buyin');
+    assert.ok(rows[0].reference.startsWith('in:'));
+    const close = rows.find((r) => r.reference.startsWith('out:'));
+    assert.ok(close);
+    assert.equal(close.session_id, rows[0].session_id);
+    assert.equal(close.reference, `out:${rows[0].session_id}`);
+  } finally {
+    child.kill();
+  }
+});
+
+
+test('deleting a user closes the live socket and blocks a rejoin', async () => {
+  const { child, port, data } = await startServer();
+  try {
+    const user = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
+      method: 'POST', headers: { 'content-type': 'application/json' },
+      body: JSON.stringify({ login: 'DansiDanutz', password: 'ggpoker' }),
+    }).then((r) => r.json());
+    const admin = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
+      method: 'POST', headers: { 'content-type': 'application/json' },
+      body: JSON.stringify({ login: 'admin', password: 'admin123' }),
+    }).then((r) => r.json());
+    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${user.token}`);
+    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
+    ws.send(JSON.stringify({ type: 'join_table', tableId: 'nlh-diamond-01', buyin: 50000 }));
+    await new Promise((r) => setTimeout(r, 1200));
+    const closed = new Promise((resolve) => ws.once('close', (code) => resolve(code)));
+    await fetch(`http://127.0.0.1:${port}/api/admin/users/1`, {
+      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${admin.token}` },
+      body: JSON.stringify({ action: 'delete' }),
+    });
+    assert.equal(await closed, 4001);
+    const db = new DatabaseSync(path.join(data, 'ggpoker.db'));
+    const second = db.prepare("SELECT COUNT(*) c FROM transactions WHERE session_id LIKE 'nlh-diamond-02:%'").get().c;
+    assert.equal(second, 0);
+  } finally {
+    child.kill();
+  }
+});
diff --git a/app/server/index.js b/app/server/index.js
index c5c6cff..6783b95 100644
--- a/app/server/index.js
+++ b/app/server/index.js
@@ -2,10 +2,11 @@ import http from 'node:http';
 import fs from 'node:fs';
 import path from 'node:path';
 import { fileURLToPath } from 'node:url';
+import { randomUUID } from 'node:crypto';
 import { WebSocketServer } from 'ws';
 import {
-  db, DATA_DIR, hashPassword, checkPassword, addTransaction, newSession, userByToken,
-  publicUser, getSetting, setSetting,
+  db, DATA_DIR, hashPassword, checkPassword, addTransaction, addTransactionEx, newSession, userByToken,
+  publicUser, getSetting, setSetting, refundOpenSessions, getClaim, claimReward, bumpMission, setMissionDone, missionPeriodKey,
 } from './db.js';
 import { PokerTable, botName } from './table.js';
 import { makeDeck, shuffle, cardStr } from './poker.js';
@@ -13,6 +14,22 @@ import { makeDeck, shuffle, cardStr } from './poker.js';
 const __dirname = path.dirname(fileURLToPath(import.meta.url));
 const PORT = Number(process.env.PORT || 5198);
 const APP_DIR = path.join(__dirname, '..');
+
+function localPort() {
+  return server.address()?.port || PORT;
+}
+
+function originAllowed(req) {
+  const port = localPort();
+  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
+  if (process.env.GGPOKER_DEV === '1') hosts.push('127.0.0.1:5199', 'localhost:5199');
+  const host = String(req.headers.host || '').toLowerCase();
+  if (!hosts.includes(host)) return false;
+  const origin = req.headers.origin;
+  if (!origin) return true;
+  const origins = hosts.map((h) => `http://${h}`);
+  return origins.includes(String(origin).toLowerCase());
+}
 const DIST = path.join(APP_DIR, 'dist');
 const PUBLIC = path.join(APP_DIR, 'public');
 
@@ -43,6 +60,16 @@ async function readBody(req) {
   try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
 }
 
+function idempotentReference(req, body, prefix) {
+  const key = String(req.headers['idempotency-key'] || body?.idempotencyKey || body?.reference || '').trim();
+  return key ? `${prefix}:${key}` : null;
+}
+
+function transactionByReference(userId, reference) {
+  if (!reference) return null;
+  return db.prepare('SELECT * FROM transactions WHERE user_id = ? AND reference = ?').get(userId, reference);
+}
+
 function tokenFrom(req) {
   const h = req.headers.authorization;
   if (h && h.startsWith('Bearer ')) return h.slice(7);
@@ -106,6 +133,17 @@ function occupancyFor(t) {
   return TABLE_OCCUPANCY.get(t.id);
 }
 
+function lobbyMissions(user) {
+  const defs = db.prepare('SELECT * FROM missions WHERE active = 1 ORDER BY sort').all();
+  if (!user) return defs.map((m) => ({ ...m, progress: 0, claimed: 0 }));
+  const claims = db.prepare("SELECT * FROM player_claims WHERE user_id = ? AND kind = 'mission'").all(user.id);
+  const byId = new Map(claims.map((c) => [c.period_key, c]));
+  return defs.map((m) => {
+    const c = byId.get(missionPeriodKey(m.id));
+    return { ...m, progress: c?.progress || 0, claimed: c?.claimed || 0 };
+  });
+}
+
 function lobbyTables() {
   const rows = db.prepare('SELECT * FROM tables WHERE enabled = 1 ORDER BY sort ASC').all();
   return rows.map((t) => {
@@ -122,6 +160,8 @@ function lobbyTables() {
       vpip: players ? 18 + (seed % 45) : 0,
       handsPerHour: 55 + (seed % 80),
       running: LIVE_TABLES.has(t.id),
+      pro: t.game === 'rush',
+      synthetic: true,
     };
   });
 }
@@ -205,21 +245,43 @@ function getLiveTable(id) {
           db.prepare("UPDATE tournaments SET status = 'completed' WHERE id = ?").run(tid);
         }
         const u = db.prepare('SELECT * FROM users WHERE id = ?').get(winner.id);
-        if (u) addTransaction(u.id, 'tourney_win', winner.prize, `Tournament win: ${table.cfg.name}`);
-        db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run('system', 'tournament_end', `${table.cfg.name} winner ${winner.nick} ${winner.prize}`);
+        if (u && table.tournament?.mode === 'SATELLITE') {
+          addTransaction(u.id, 'satellite_win', 1, `Satellite ticket: ${table.tournament.ticket || table.cfg.name}`, 'TICKET');
+        } else if (u && winner.prize > 0) {
+          addTransaction(u.id, 'tourney_win', winner.prize, `Tournament win: ${table.cfg.name}`);
+        }
+        db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run('system', 'tournament_end', `${table.cfg.name} winner ${winner.nick} ${winner.prize || 0}`);
       } catch (e) { console.error('tournament end', e); }
     },
+    onMint: (table, kind, amount) => {
+      const key = kind === 'bot' ? 'mint_bot_total' : 'mint_spin_total';
+      setSetting(key, (Number(getSetting(key, 0)) || 0) + Number(amount || 0));
+    },
+    onBounty: (table, info) => {
+      const winner = db.prepare('SELECT * FROM users WHERE id = ?').get(info.winnerId);
+      if (winner) {
+        addTransaction(winner.id, info.mystery ? 'mystery_bounty' : 'bounty', info.amount,
+          `${info.mystery ? 'Mystery bounty' : 'Bounty'}: ${info.bustedNick}`);
+      }
+      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run('system', 'bounty',
+        `${table.cfg.name} ${info.winnerNick} ${info.amount} (${info.bustedNick})`);
+    },
+    onSeatBusted: (table, player) => {
+      if (!table.spin) return;
+      const seat = table.seatOf(player.id);
+      const sessionId = seat?.player?.sessionId;
+      if (!sessionId) return;
+      addTransactionEx(player.id, 'session_close', 0, 'Spin bust', 'USD', {
+        sessionId, reference: `out:${sessionId}`, onDuplicate: 'skip',
+      });
+    },
     onHandComplete: ({ table, winner }) => {
       // mission progress for humans
       for (const s of table.seats) {
         if (!s.player || s.player.isBot) continue;
-        db.prepare(`UPDATE missions SET progress = MIN(goal, progress + 1) WHERE id = 'daily-hands' AND claimed = 0`).run();
-        if (winner && winner.id === s.player.id) {
-          db.prepare(`UPDATE missions SET progress = MIN(goal, progress + 1) WHERE id = 'daily-win' AND claimed = 0`).run();
-        }
-        if (table.board.length >= 3) {
-          db.prepare(`UPDATE missions SET progress = MIN(goal, progress + 1) WHERE id = 'daily-flop' AND claimed = 0`).run();
-        }
+        bumpMission(s.player.id, 'daily-hands');
+        if (winner && winner.id === s.player.id) bumpMission(s.player.id, 'daily-win');
+        if (table.board.length >= 3) bumpMission(s.player.id, 'daily-flop');
       }
     },
   });
@@ -232,6 +294,7 @@ function getLiveTable(id) {
       if (entry.clients.size === 0) {
         if (!entry.emptySince) entry.emptySince = Date.now();
         else if (Date.now() - entry.emptySince > 45000) {
+          for (const p of table.humans()) cashOutSeat(table, p.id, 'Table idle close');
           clearInterval(entry.timer);
           LIVE_TABLES.delete(id);
         }
@@ -273,12 +336,35 @@ function seatHuman(table, user, buyin, seatIndex = null) {
   const stack = Number(buyin) || table.cfg.min_buyin;
   if (stack < table.cfg.min_buyin || stack > table.cfg.max_buyin) return { ok: false, error: 'invalid buy-in' };
   if (user.balance < stack) return { ok: false, error: 'not enough balance' };
-  addTransaction(user.id, 'buyin', -stack, `Buy-in ${table.cfg.name}`);
-  const res = table.sit({ id: user.id, nick: user.nick, avatar: user.avatar }, seatIndex ?? null, stack);
-  if (!res.ok) { addTransaction(user.id, 'refund', stack, 'Buy-in refund'); return res; }
+  const sessionId = `${table.cfg.id}:${randomUUID()}`;
+  addTransactionEx(user.id, 'buyin', -stack, `Buy-in ${table.cfg.name}`, 'USD', {
+    sessionId, reference: `in:${sessionId}:1`, onDuplicate: 'skip',
+  });
+  const res = table.sit({ id: user.id, nick: user.nick, avatar: user.avatar }, seatIndex ?? null, stack, sessionId);
+  if (!res.ok) {
+    addTransactionEx(user.id, 'refund', stack, 'Buy-in refund', 'USD', {
+      sessionId, reference: `refund:${sessionId}`, onDuplicate: 'skip',
+    });
+    return res;
+  }
+  const seat = table.seatOf(user.id);
+  if (seat && seat.player) seat.player.sessionId = sessionId;
   return res;
 }
 
+function cashOutSeat(table, userId, reason) {
+  const seat = table.seatOf(userId);
+  if (!seat || !seat.player) return;
+  const stack = seat.player.stack;
+  const sessionId = seat.player.sessionId;
+  table.stand(userId);
+  if (table.tournament) return;
+  const sid = sessionId || `${table.cfg.id}:${randomUUID()}`;
+  addTransactionEx(userId, stack > 0 ? 'cashout' : 'session_close', stack, reason, 'USD', {
+    sessionId: sid, reference: `out:${sid}`, onDuplicate: 'skip',
+  });
+}
+
 /* ------------------------------------------------------------------ */
 /* HTTP API                                                            */
 /* ------------------------------------------------------------------ */
@@ -288,10 +374,11 @@ const server = http.createServer(async (req, res) => {
   const p = url.pathname;
 
   try {
+    if (!originAllowed(req)) return json(res, 403, { error: 'bad origin' });
     // ---------- auth ----------
     if (p === '/api/auth/login' && req.method === 'POST') {
       const body = await readBody(req);
-      const user = db.prepare('SELECT * FROM users WHERE lower(login) = lower(?) OR lower(nick) = lower(?)').get(body.login || '', body.login || '');
+      const user = db.prepare('SELECT * FROM users WHERE (lower(login) = lower(?) OR lower(nick) = lower(?)) AND deleted_at IS NULL').get(body.login || '', body.login || '');
       if (!user || !checkPassword(body.password || '', user.password)) return json(res, 400, { error: 'Invalid account ID or password' });
       if (user.banned) return json(res, 403, { error: 'This account is locked. Contact support.' });
       db.prepare('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?').run(user.id);
@@ -308,9 +395,10 @@ const server = http.createServer(async (req, res) => {
       if (db.prepare('SELECT id FROM users WHERE lower(login)=lower(?)').get(login)) return json(res, 400, { error: 'Account already exists' });
       const start = getSetting('default_balance', 5000) + getSetting('welcome_bonus', 100000);
       db.prepare(`INSERT INTO users (login,nick,password,email,balance,tickets) VALUES (?,?,?,?,?,?)`)
-        .run(login, nick, hashPassword(body.password), body.email || '', start, 5);
-      const user = db.prepare('SELECT * FROM users WHERE login = ?').get(login);
-      addTransaction(user.id, 'welcome', start, 'Welcome bonus');
+        .run(login, nick, hashPassword(body.password), body.email || '', 0, 5);
+      const created = db.prepare('SELECT * FROM users WHERE login = ?').get(login);
+      addTransaction(created.id, 'welcome', start, 'Welcome bonus');
+      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(created.id);
       const token = newSession(user.id, req.headers['user-agent'] || '');
       return json(res, 200, { token, user: publicUser(user) });
     }
@@ -362,8 +450,12 @@ const server = http.createServer(async (req, res) => {
         banners,
         online: sitesStats().online,
         jackpot: getSetting('jackpot', 199026635),
+        recentWinners: Array.from({ length: 5 }, (_, i) => ({
+          nick: botName((hashStr('winner' + i) + i) % 100),
+          amount: 500 + ((hashStr('amount' + i) + i * 733) % 9000),
+        })),
         user: publicUser(u),
-        missions: db.prepare('SELECT * FROM missions WHERE active = 1 ORDER BY sort').all(),
+        missions: lobbyMissions(u),
         settings: { site_name: getSetting('site_name', 'GGPoker'), maintenance: getSetting('maintenance', false) },
       });
     }
@@ -392,7 +484,7 @@ const server = http.createServer(async (req, res) => {
       addTransaction(u.id, 'tourney_buyin', -total, `Registration ${t.name}`);
       db.prepare('INSERT INTO tourney_regs (tournament_id,user_id) VALUES (?,?)').run(id, u.id);
       db.prepare('UPDATE tournaments SET entrants = entrants + 1 WHERE id = ?').run(id);
-      db.prepare(`UPDATE missions SET progress = goal WHERE id = 'daily-tourney' AND claimed = 0`).run();
+      setMissionDone(u.id, 'daily-tourney');
       return json(res, 200, { ok: true });
     }
 
@@ -419,6 +511,8 @@ const server = http.createServer(async (req, res) => {
           tournament: {
             prizePool: Math.max(t.gtd, t.entrants * (t.buyin + t.fee)),
             level: 1, blindEvery: Math.max(5, t.blind_speed),
+            mode: t.mode || 'STANDARD', bounty: t.bounty || 0, ticket: t.ticket || '',
+            name: t.name,
           },
         });
       }
@@ -459,17 +553,29 @@ const server = http.createServer(async (req, res) => {
       const body = await readBody(req);
       const amount = Math.round(Number(body.amount || 0));
       if (amount <= 0 || amount > 100000000) return json(res, 400, { error: 'Invalid amount' });
-      const after = addTransaction(u.id, 'deposit', amount, body.method || 'Instant bank transfer');
-      return json(res, 200, { ok: true, balance: after });
+      const reference = idempotentReference(req, body, 'cashier:deposit');
+      const existing = transactionByReference(u.id, reference);
+      if (existing) {
+        if (existing.amount !== amount) return json(res, 409, { error: 'Idempotency key reused with a different amount' });
+        return json(res, 200, { ok: true, balance: u.balance, replayed: true });
+      }
+      const award = addTransactionEx(u.id, 'deposit', amount, body.method || 'Instant bank transfer', 'USD', reference ? { reference, onDuplicate: 'skip' } : {});
+      return json(res, 200, { ok: true, balance: award.balance, replayed: !award.applied });
     }
 
     if (p === '/api/cashier/withdraw' && req.method === 'POST') {
       const u = requireUser(req, res); if (!u) return;
       const body = await readBody(req);
       const amount = Math.round(Number(body.amount || 0));
+      const reference = idempotentReference(req, body, 'cashier:withdraw');
+      const existing = transactionByReference(u.id, reference);
+      if (existing) {
+        if (existing.amount !== -amount) return json(res, 409, { error: 'Idempotency key reused with a different amount' });
+        return json(res, 200, { ok: true, balance: u.balance, replayed: true });
+      }
       if (amount <= 0 || amount > u.balance) return json(res, 400, { error: 'Invalid amount' });
-      const after = addTransaction(u.id, 'withdraw', -amount, body.method || 'Bank transfer');
-      return json(res, 200, { ok: true, balance: after });
+      const award = addTransactionEx(u.id, 'withdraw', -amount, body.method || 'Bank transfer', 'USD', reference ? { reference, onDuplicate: 'skip' } : {});
+      return json(res, 200, { ok: true, balance: award.balance, replayed: !award.applied });
     }
 
     // ---------- hand history ----------
@@ -488,7 +594,13 @@ const server = http.createServer(async (req, res) => {
     // ---------- missions / rewards ----------
     if (p === '/api/missions') {
       const u = requireUser(req, res); if (!u) return;
-      return json(res, 200, { missions: db.prepare('SELECT * FROM missions WHERE active = 1 ORDER BY sort').all() });
+      const defs = db.prepare('SELECT * FROM missions WHERE active = 1 ORDER BY sort').all();
+      const claims = db.prepare("SELECT * FROM player_claims WHERE user_id = ? AND kind = 'mission'").all(u.id);
+      const byId = new Map(claims.map((c) => [c.period_key, c]));
+      return json(res, 200, { missions: defs.map((m) => {
+        const c = byId.get(missionPeriodKey(m.id));
+        return { ...m, progress: c?.progress || 0, claimed: c?.claimed || 0 };
+      }) });
     }
 
     if (p.startsWith('/api/missions/') && p.endsWith('/claim') && req.method === 'POST') {
@@ -496,11 +608,13 @@ const server = http.createServer(async (req, res) => {
       const id = p.split('/')[3];
       const m = db.prepare('SELECT * FROM missions WHERE id = ?').get(id);
       if (!m) return json(res, 404, { error: 'not found' });
-      if (m.claimed) return json(res, 400, { error: 'Already claimed' });
-      if (m.progress < m.goal) return json(res, 400, { error: 'Mission not complete' });
-      db.prepare('UPDATE missions SET claimed = 1 WHERE id = ?').run(id);
-      const after = addTransaction(u.id, 'claim', m.reward, `Mission: ${m.title}`, m.reward_kind);
-      return json(res, 200, { ok: true, balance: after, reward: m.reward, kind: m.reward_kind });
+      const period = missionPeriodKey(id);
+      const c = getClaim(u.id, 'mission', period);
+      if (c?.claimed) return json(res, 400, { error: 'Already claimed' });
+      if (!c || c.progress < m.goal) return json(res, 400, { error: 'Mission not complete' });
+      const award = claimReward(u.id, 'mission', period, m.reward, m.reward_kind, `Mission: ${m.title}`);
+      if (!award.claimed) return json(res, 400, { error: 'Already claimed' });
+      return json(res, 200, { ok: true, balance: award.balance, reward: m.reward, kind: m.reward_kind });
     }
 
     if (p === '/api/leaderboard') {
@@ -511,19 +625,19 @@ const server = http.createServer(async (req, res) => {
     if (p === '/api/rewards/daily' && req.method === 'POST') {
       const u = requireUser(req, res); if (!u) return;
       const day = new Date().toISOString().slice(0, 10);
-      const already = db.prepare('SELECT * FROM daily_claims WHERE user_id = ? AND day = ?').get(u.id, day);
-      if (already) return json(res, 400, { error: 'Daily freebie already claimed today', amount: already.amount });
+      const already = getClaim(u.id, 'daily', day);
+      if (already?.claimed) return json(res, 400, { error: 'Daily freebie already claimed today', amount: already.amount });
       const amount = 500 + Math.floor(Math.random() * 20) * 250;
-      db.prepare('INSERT INTO daily_claims (user_id,day,amount) VALUES (?,?,?)').run(u.id, day, amount);
-      const after = addTransaction(u.id, 'daily', amount, 'Daily freebie');
-      return json(res, 200, { ok: true, amount, balance: after });
+      const award = claimReward(u.id, 'daily', day, amount, 'USD', 'Daily freebie');
+      if (!award.claimed) return json(res, 400, { error: 'Daily freebie already claimed today', amount: award.amount });
+      return json(res, 200, { ok: true, amount: award.amount, balance: award.balance });
     }
 
     if (p === '/api/rewards/daily') {
       const u = requireUser(req, res); if (!u) return;
       const day = new Date().toISOString().slice(0, 10);
-      const already = db.prepare('SELECT * FROM daily_claims WHERE user_id = ? AND day = ?').get(u.id, day);
-      return json(res, 200, { claimed: !!already, amount: already?.amount || 0 });
+      const already = getClaim(u.id, 'daily', day);
+      return json(res, 200, { claimed: !!already?.claimed, amount: already?.amount || 0 });
     }
 
     if (p === '/api/rewards/spin' && req.method === 'POST') {
@@ -613,16 +727,17 @@ const server = http.createServer(async (req, res) => {
         return sum;
       };
       if (action === 'deal') {
+        if (BJ_HANDS.has(u.id)) return json(res, 400, { error: 'Finish the current hand first' });
         const bet = Math.max(10, Math.min(1000000, Math.round(Number(body.bet) || 100)));
         if (u.balance < bet) return json(res, 400, { error: 'Insufficient balance' });
-        addTransaction(u.id, 'blackjack', -bet, 'Blackjack bet');
+        const after = addTransaction(u.id, 'blackjack', -bet, 'Blackjack bet');
         const deck = shuffle(makeDeck(false));
         const player = [deck.pop(), deck.pop()];
         const dealer = [deck.pop(), deck.pop()];
         BJ_HANDS.set(u.id, { deck, player, dealer, bet });
         return json(res, 200, {
           player: player.map(cardStr), dealer: [cardStr(dealer[0]), '??'], dealerHidden: dealer.map(cardStr),
-          playerTotal: bjValue(player), balance: u.balance - bet, bet, blackjack: bjValue(player) === 21,
+          playerTotal: bjValue(player), balance: after, bet, blackjack: bjValue(player) === 21,
         });
       }
       const hand = BJ_HANDS.get(u.id);
@@ -632,7 +747,8 @@ const server = http.createServer(async (req, res) => {
         const pv = bjValue(hand.player), dv = bjValue(hand.dealer);
         if (pv > 21) {
           BJ_HANDS.delete(u.id);
-          return json(res, 200, { player: hand.player.map(cardStr), dealer: hand.dealer.map(cardStr), playerTotal: pv, bust: true, payout: 0, balance: u.balance, done: true });
+          const fresh = db.prepare('SELECT balance FROM users WHERE id = ?').get(u.id).balance;
+          return json(res, 200, { player: hand.player.map(cardStr), dealer: hand.dealer.map(cardStr), playerTotal: pv, bust: true, payout: 0, balance: fresh, done: true });
         }
         return json(res, 200, { player: hand.player.map(cardStr), playerTotal: pv, dealer: [cardStr(hand.dealer[0]), '??'], done: false });
       }
@@ -645,9 +761,9 @@ const server = http.createServer(async (req, res) => {
         if (pv > 21) { payout = 0; result = 'bust'; }
         else if (dv > 21 || pv > dv) { payout = natural ? Math.floor(hand.bet * 2.5) : hand.bet * 2; result = 'win'; }
         else if (pv === dv) { payout = hand.bet; result = 'push'; }
-        if (payout > 0) addTransaction(u.id, 'blackjack', payout, `Blackjack ${result}`);
+        const after = payout > 0 ? addTransaction(u.id, 'blackjack', payout, `Blackjack ${result}`) : db.prepare('SELECT balance FROM users WHERE id = ?').get(u.id).balance;
         BJ_HANDS.delete(u.id);
-        return json(res, 200, { player: hand.player.map(cardStr), dealer: hand.dealer.map(cardStr), playerTotal: pv, dealerTotal: dv, payout, result, done: true, balance: u.balance - hand.bet + payout });
+        return json(res, 200, { player: hand.player.map(cardStr), dealer: hand.dealer.map(cardStr), playerTotal: pv, dealerTotal: dv, payout, result, done: true, balance: after });
       }
       return json(res, 400, { error: 'unknown action' });
     }
@@ -844,12 +960,12 @@ const server = http.createServer(async (req, res) => {
     // ---------- honeymoon ----------
     if (p === '/api/honeymoon' && req.method === 'GET') {
       const u = requireUser(req, res); if (!u) return;
-      const day = 'honey-' + new Date().toISOString().slice(0, 10);
-      const welcome = db.prepare("SELECT 1 FROM daily_claims WHERE user_id = ? AND day = 'honey-welcome'").get(u.id);
-      const daily = db.prepare('SELECT 1 FROM daily_claims WHERE user_id = ? AND day = ?').get(u.id, day);
+      const day = new Date().toISOString().slice(0, 10);
+      const welcome = getClaim(u.id, 'honeymoon', 'welcome');
+      const daily = getClaim(u.id, 'honeymoon', day);
       return json(res, 200, {
-        welcome: { claimed: !!welcome, amount: 500 },
-        daily: { claimed: !!daily, amount: 100 },
+        welcome: { claimed: !!welcome?.claimed, amount: 500 },
+        daily: { claimed: !!daily?.claimed, amount: 100 },
         missions: true,
       });
     }
@@ -857,32 +973,27 @@ const server = http.createServer(async (req, res) => {
       const u = requireUser(req, res); if (!u) return;
       const b = await readBody(req);
       const step = String(b.step || '');
-      const day = step === 'welcome' ? 'honey-welcome' : 'honey-' + new Date().toISOString().slice(0, 10);
       if (!['welcome', 'daily'].includes(step)) return json(res, 400, { error: 'unknown step' });
-      const already = db.prepare('SELECT 1 FROM daily_claims WHERE user_id = ? AND day = ?').get(u.id, day);
-      if (already) return json(res, 400, { error: 'Already claimed' });
+      const period = step === 'welcome' ? 'welcome' : new Date().toISOString().slice(0, 10);
       const amount = step === 'welcome' ? 500 : 100;
-      db.prepare('INSERT INTO daily_claims (user_id,day,amount) VALUES (?,?,?)').run(u.id, day, amount);
-      const after = addTransaction(u.id, 'honeymoon', amount, step === 'welcome' ? 'Honeymoon welcome bonus' : 'Honeymoon daily gift');
-      return json(res, 200, { ok: true, amount, balance: after });
+      const award = claimReward(u.id, 'honeymoon', period, amount, 'USD', step === 'welcome' ? 'Honeymoon welcome bonus' : 'Honeymoon daily gift');
+      if (!award.claimed) return json(res, 400, { error: 'Already claimed' });
+      return json(res, 200, { ok: true, amount, balance: award.balance });
     }
 
     // ---------- gg care ----------
     if (p === '/api/ggcare' && req.method === 'GET') {
       const u = requireUser(req, res); if (!u) return;
-      const day = 'care-' + new Date().toISOString().slice(0, 10);
-      const claimed = db.prepare('SELECT amount FROM daily_claims WHERE user_id = ? AND day = ?').get(u.id, day);
-      return json(res, 200, { jackpot: getSetting('jackpot', 199026635), claimed: !!claimed, amount: claimed?.amount || 0 });
+      const day = new Date().toISOString().slice(0, 10);
+      const claimed = getClaim(u.id, 'ggcare', day);
+      return json(res, 200, { jackpot: getSetting('jackpot', 199026635), claimed: !!claimed?.claimed, amount: claimed?.amount || 0 });
     }
     if (p === '/api/ggcare/claim' && req.method === 'POST') {
       const u = requireUser(req, res); if (!u) return;
-      const day = 'care-' + new Date().toISOString().slice(0, 10);
-      const already = db.prepare('SELECT 1 FROM daily_claims WHERE user_id = ? AND day = ?').get(u.id, day);
-      if (already) return json(res, 400, { error: 'Already claimed today' });
-      const amount = 500;
-      db.prepare('INSERT INTO daily_claims (user_id,day,amount) VALUES (?,?,?)').run(u.id, day, amount);
-      const after = addTransaction(u.id, 'ggcare', amount, 'GG Care daily bonus');
-      return json(res, 200, { ok: true, amount, balance: after });
+      const day = new Date().toISOString().slice(0, 10);
+      const award = claimReward(u.id, 'ggcare', day, 500, 'USD', 'GG Care daily bonus');
+      if (!award.claimed) return json(res, 400, { error: 'Already claimed today' });
+      return json(res, 200, { ok: true, amount: award.amount, balance: award.balance });
     }
 
     // ---------- brand assets ----------
@@ -1012,19 +1123,19 @@ const server = http.createServer(async (req, res) => {
 
     if (p === '/api/admin/stats') {
       const a = requireAdmin(req, res); if (!a) return;
-      const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
+      const users = db.prepare('SELECT COUNT(*) c FROM users WHERE deleted_at IS NULL').get().c;
       const hands = db.prepare('SELECT COUNT(*) c FROM hands').get().c;
       const tables = db.prepare('SELECT COUNT(*) c FROM tables').get().c;
       const tourneys = db.prepare('SELECT COUNT(*) c FROM tournaments').get().c;
       const turnover = db.prepare(`SELECT COALESCE(SUM(ABS(amount)),0) s FROM transactions`).get().s;
       const live = [...LIVE_TABLES.values()].map((e) => ({ id: e.table.cfg.id, name: e.table.cfg.name, players: e.table.occupiedSeats().length, hand: e.table.handNo, street: e.table.street }));
-      return json(res, 200, { users, hands, tables, tourneys, turnover, live, online: sitesStats().online, jackpot: getSetting('jackpot') });
+      return json(res, 200, { users, hands, tables, tourneys, turnover, live, online: sitesStats().online, jackpot: getSetting('jackpot'), mint_bot: getSetting('mint_bot_total', 0), mint_spin: getSetting('mint_spin_total', 0) });
     }
 
     if (p === '/api/admin/users') {
       const a = requireAdmin(req, res); if (!a) return;
       const q = (url.searchParams.get('q') || '').toLowerCase();
-      const rows = db.prepare('SELECT * FROM users ORDER BY id').all()
+      const rows = db.prepare('SELECT * FROM users WHERE deleted_at IS NULL ORDER BY id').all()
         .filter((u) => !q || u.login.toLowerCase().includes(q) || u.nick.toLowerCase().includes(q));
       return json(res, 200, { users: rows.map(publicUser) });
     }
@@ -1036,9 +1147,17 @@ const server = http.createServer(async (req, res) => {
       const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
       if (!target) return json(res, 404, { error: 'not found' });
       if (body.action === 'credit') {
-        const after = addTransaction(id, 'admin', Math.round(body.amount || 0), `Admin credit by ${a.login}`);
+        if (!body.reference) return json(res, 400, { error: 'reference required' });
+        const reference = `admin:credit:${body.reference}`;
+        const existing = transactionByReference(id, reference);
+        if (existing) {
+          if (existing.amount !== Math.round(body.amount || 0)) return json(res, 409, { error: 'Idempotency key reused with a different amount' });
+          const current = db.prepare('SELECT balance FROM users WHERE id = ?').get(id)?.balance;
+          return json(res, 200, { ok: true, balance: current, replayed: true });
+        }
+        const award = addTransactionEx(id, 'admin', Math.round(body.amount || 0), `Admin credit by ${a.login}`, 'USD', reference ? { reference, onDuplicate: 'skip' } : {});
         db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(a.login, 'credit', `user ${id} ${body.amount}`);
-        return json(res, 200, { ok: true, balance: after });
+        return json(res, 200, { ok: true, balance: award.balance, replayed: !award.applied });
       }
       if (body.action === 'set') {
         const currency = { balance: 'USD', play_chips: 'PLAY', tickets: 'TICKET', gems: 'GEM' };
@@ -1061,11 +1180,23 @@ const server = http.createServer(async (req, res) => {
       }
       if (body.action === 'resetpw') {
         db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(String(body.password || 'ggpoker')), id);
+        db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(a.login, 'resetpw', `user ${id}`);
         return json(res, 200, { ok: true });
       }
       if (body.action === 'delete' && !target.is_admin) {
-        db.prepare('DELETE FROM users WHERE id = ?').run(id);
-        return json(res, 200, { ok: true });
+        for (const entry of LIVE_TABLES.values()) {
+          if (entry.table.seatOf(id)) cashOutSeat(entry.table, id, 'Account deleted by admin');
+        }
+        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
+        db.prepare(`UPDATE users SET banned = 1, deleted_at = datetime('now'),
+          login = ?, nick = ?, email = '' WHERE id = ?`).run(`deleted:${id}:${target.login}`, `Deleted ${id}`, id);
+        for (const client of wss.clients) {
+          if (client.userId === id) {
+            try { client.close(4001, 'account deleted'); } catch { /* ignore */ }
+          }
+        }
+        db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(a.login, 'delete_user', `user ${id}`);
+        return json(res, 200, { ok: true, deleted: true });
       }
       return json(res, 400, { error: 'unknown action' });
     }
@@ -1138,18 +1269,27 @@ const server = http.createServer(async (req, res) => {
       const a = requireAdmin(req, res); if (!a) return;
       const b = await readBody(req);
       if (b.delete) { db.prepare('DELETE FROM missions WHERE id = ?').run(b.id); return json(res, 200, { ok: true }); }
-      db.prepare(`INSERT INTO missions (id,title,description,goal,progress,reward,reward_kind,active,sort,claimed)
-        VALUES (?,?,?,?,?,?,?,?,?,0)
+      if (b.reset) {
+        db.prepare("DELETE FROM player_claims WHERE kind = 'mission' AND period_key LIKE ?").run(`mission:${b.id}:%`);
+        return json(res, 200, { ok: true });
+      }
+      db.prepare(`INSERT INTO missions (id,title,description,goal,reward,reward_kind,active,sort)
+        VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, goal=excluded.goal,
         reward=excluded.reward, reward_kind=excluded.reward_kind, active=excluded.active, sort=excluded.sort`)
         .run(b.id || `m${Date.now()}`, b.title || 'Mission', b.description || '', Number(b.goal) || 1,
-          Number(b.progress) || 0, Number(b.reward) || 100, b.reward_kind || 'USD', b.active === false ? 0 : 1, Number(b.sort) || 0);
+          Number(b.reward) || 100, b.reward_kind || 'USD', b.active === false ? 0 : 1, Number(b.sort) || 0);
       return json(res, 200, { ok: true });
     }
 
     if (p === '/api/admin/missions') {
       const a = requireAdmin(req, res); if (!a) return;
-      return json(res, 200, { missions: db.prepare('SELECT * FROM missions ORDER BY sort').all() });
+      const defs = db.prepare('SELECT * FROM missions ORDER BY sort').all();
+      return json(res, 200, { missions: defs.map((m) => ({
+        ...m,
+        progress: db.prepare("SELECT COUNT(*) c FROM player_claims WHERE kind = 'mission' AND period_key LIKE ? AND claimed = 1").get(`mission:${m.id}:%`).c,
+        claimed: db.prepare("SELECT COUNT(*) c FROM player_claims WHERE kind = 'mission' AND period_key LIKE ? AND claimed = 1").get(`mission:${m.id}:%`).c > 0,
+      })) });
     }
 
     if (p.startsWith('/api/admin/live/') && p.endsWith('/close') && req.method === 'POST') {
@@ -1158,12 +1298,7 @@ const server = http.createServer(async (req, res) => {
       const entry = LIVE_TABLES.get(id);
       if (!entry) return json(res, 404, { error: 'not running' });
       for (const s of [...entry.table.seats]) {
-        if (s.player && !s.player.isBot) {
-          const stack = s.player.stack;
-          const uid = s.player.id;
-          entry.table.stand(uid);
-          if (stack > 0 && !entry.table.tournament) addTransaction(uid, 'cashout', stack, `Table closed by admin`);
-        }
+        if (s.player && !s.player.isBot) cashOutSeat(entry.table, s.player.id, `Table closed by admin`);
       }
       clearInterval(entry.timer);
       LIVE_TABLES.delete(id);
@@ -1235,7 +1370,14 @@ const server = http.createServer(async (req, res) => {
 /* WebSocket                                                           */
 /* ------------------------------------------------------------------ */
 
-const wss = new WebSocketServer({ server, path: '/ws' });
+const wss = new WebSocketServer({
+  server,
+  path: '/ws',
+  verifyClient: (info, cb) => {
+    if (originAllowed(info.req)) cb(true);
+    else cb(false, 403, 'Forbidden');
+  },
+});
 
 wss.on('connection', (ws, req) => {
   const url = new URL(req.url, 'http://localhost');
@@ -1256,12 +1398,19 @@ wss.on('connection', (ws, req) => {
   function handleWsMessage(ws, raw) {
     let msg;
     try { msg = JSON.parse(raw.toString()); } catch { return; }
+    if (ws.userId) {
+      const active = db.prepare('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL AND banned = 0').get(ws.userId);
+      if (!active) {
+        try { ws.close(4001, 'account unavailable'); } catch { /* ignore */ }
+        return;
+      }
+    }
     if (msg.type === 'join_table') {
       const table = getLiveTable(msg.tableId);
       if (!table) return ws.send(JSON.stringify({ type: 'error', error: 'table not found' }));
       const entry = LIVE_TABLES.get(msg.tableId);
       // ensure there is a seat for the human
-      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(ws.userId);
+      const u = db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL AND banned = 0').get(ws.userId);
       if (!u) return ws.send(JSON.stringify({ type: 'error', error: 'login required' }));
       if (msg.observe) {
         table.fillBots(Math.max(3, table.cfg.seats - 1));
@@ -1303,17 +1452,26 @@ wss.on('connection', (ws, req) => {
       broadcastState(table);
       return;
     }
+    if (msg.type === 'option') {
+      const entry = LIVE_TABLES.get(msg.tableId);
+      if (!entry) return;
+      if (msg.straddle != null) {
+        const res = entry.table.setStraddle(!!msg.straddle);
+        if (!res.ok) ws.send(JSON.stringify({ type: 'error', error: res.error }));
+      }
+      if (msg.autoMuck != null) entry.table.setAutoMuck(ws.userId, !!msg.autoMuck);
+      broadcastState(entry.table);
+      return;
+    }
     if (msg.type === 'leave_table') {
       const entry = LIVE_TABLES.get(msg.tableId);
       if (entry) {
         entry.clients.delete(ws);
         ws.tables.delete(msg.tableId);
         const table = entry.table;
-        const seat = table.seatOf(ws.userId);
-        if (seat) {
-          const stack = seat.player.stack;
-          const res = table.stand(ws.userId);
-          if (stack > 0 && !table.tournament) addTransaction(ws.userId, 'cashout', stack, `Cash-out ${table.cfg.name}`);
+        const hadSeat = !!table.seatOf(ws.userId);
+        if (hadSeat) {
+          cashOutSeat(table, ws.userId, `Cash-out ${table.cfg.name}`);
           notifyWaitlist(msg.tableId);
         } else {
           waitlistLeave(msg.tableId, ws.userId);
@@ -1345,11 +1503,19 @@ wss.on('connection', (ws, req) => {
       const seat = table.seatOf(ws.userId);
       if (!seat) return ws.send(JSON.stringify({ type: 'error', error: 'not seated' }));
       if (seat.player.inHand) return ws.send(JSON.stringify({ type: 'error', error: 'Finish the hand first' }));
+      if (table.tournament) return ws.send(JSON.stringify({ type: 'error', error: 'No rebuys in tournaments' }));
       const amount = Math.round(Number(msg.amount) || 0);
       if (amount < table.cfg.min_buyin || amount > table.cfg.max_buyin) return ws.send(JSON.stringify({ type: 'error', error: 'invalid amount' }));
-      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(ws.userId);
+      const u = db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL AND banned = 0').get(ws.userId);
       if (!u || u.balance < amount) return ws.send(JSON.stringify({ type: 'error', error: 'not enough balance' }));
-      addTransaction(u.id, 'rebuy', -amount, `Rebuy ${table.cfg.name}`);
+      if (!seat.player.sessionId) seat.player.sessionId = `${table.cfg.id}:${randomUUID()}`;
+      const sessionId = seat.player.sessionId;
+      const rebuyNo = (seat.player.rebuyCount || 0) + 1;
+      const award = addTransactionEx(u.id, 'rebuy', -amount, `Rebuy ${table.cfg.name}`, 'USD', {
+        sessionId, reference: `in:${sessionId}:r${rebuyNo}`, onDuplicate: 'skip',
+      });
+      if (!award.applied) return ws.send(JSON.stringify({ type: 'error', error: 'Rebuy already applied' }));
+      seat.player.rebuyCount = rebuyNo;
       seat.player.stack += amount;
       broadcastState(table);
       return;
@@ -1406,9 +1572,7 @@ wss.on('connection', (ws, req) => {
       const seat = table.seatOf(ws.userId);
       if (seat) {
         seat.player.disconnected = true;
-        const stack = seat.player.stack;
-        table.stand(ws.userId);
-        if (stack > 0 && !table.tournament) addTransaction(ws.userId, 'cashout', stack, `Cash-out ${table.cfg.name}`);
+        cashOutSeat(table, ws.userId, `Cash-out ${table.cfg.name}`);
         notifyWaitlist(id);
       } else {
         waitlistLeave(id, ws.userId);
@@ -1418,6 +1582,10 @@ wss.on('connection', (ws, req) => {
   });
 });
 
+const refunded = refundOpenSessions();
+if (refunded) console.log(`refunded ${refunded} open table session(s)`);
 server.listen(PORT, '127.0.0.1', () => {
-  console.log(`GGPoker clone server: http://127.0.0.1:${PORT}`);
+  const port = server.address().port;
+  console.log(`LISTENING ${port}`);
+  console.log(`GGPoker clone server: http://127.0.0.1:${port}`);
 });
diff --git a/app/server/ledger-session.test.js b/app/server/ledger-session.test.js
new file mode 100644
index 0000000..6442b39
--- /dev/null
+++ b/app/server/ledger-session.test.js
@@ -0,0 +1,67 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import fs from 'node:fs';
+import os from 'node:os';
+import path from 'node:path';
+
+process.env.GGPOKER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'dangro-session-'));
+const {
+  db, addTransactionEx, openSessions, refundOpenSessions,
+} = await import('./db.js');
+
+const user = db.prepare('SELECT * FROM users ORDER BY id LIMIT 1').get();
+
+function balance() {
+  return db.prepare('SELECT balance FROM users WHERE id = ?').get(user.id).balance;
+}
+
+test('crash refunds the sum of buy-in and rebuy exactly once', () => {
+  const start = balance();
+  addTransactionEx(user.id, 'buyin', -5000, 'buy-in', 'USD', { sessionId: 't1:s1', reference: 'in:t1:s1:1' });
+  addTransactionEx(user.id, 'rebuy', -5000, 'rebuy', 'USD', { sessionId: 't1:s1', reference: 'in:t1:s1:r1' });
+  assert.equal(openSessions().filter((s) => s.session_id === 't1:s1').length, 1);
+  assert.equal(refundOpenSessions(), 1);
+  assert.equal(balance(), start);
+  assert.equal(refundOpenSessions(), 0);
+  const refund = db.prepare("SELECT * FROM transactions WHERE user_id = ? AND reference = 'refund:t1:s1'").get(user.id);
+  assert.equal(refund.amount, 10000);
+  assert.equal(refund.kind, 'buyin_refund');
+});
+
+test('a busted session with a zero cash-out is not refunded', () => {
+  const before = balance();
+  addTransactionEx(user.id, 'buyin', -5000, 'buy-in', 'USD', { sessionId: 't2:s1', reference: 'in:t2:s1:1' });
+  addTransactionEx(user.id, 'session_close', 0, 'bust', 'USD', { sessionId: 't2:s1', reference: 'out:t2:s1' });
+  assert.equal(refundOpenSessions(), 0);
+  assert.equal(balance(), before - 5000);
+});
+
+test('a failed seat refund is not refunded again', () => {
+  const before = balance();
+  addTransactionEx(user.id, 'buyin', -5000, 'buy-in', 'USD', { sessionId: 't3:s1', reference: 'in:t3:s1:1' });
+  addTransactionEx(user.id, 'refund', 5000, 'seat failed', 'USD', { sessionId: 't3:s1', reference: 'refund:t3:s1' });
+  assert.equal(refundOpenSessions(), 0);
+  assert.equal(balance(), before);
+});
+
+test('duplicate reference is skipped, not credited', () => {
+  const before = balance();
+  const first = addTransactionEx(user.id, 'test_credit', 1000, 'once', 'USD', { reference: 'dup:1', onDuplicate: 'skip' });
+  const second = addTransactionEx(user.id, 'test_credit', 1000, 'twice', 'USD', { reference: 'dup:1', onDuplicate: 'skip' });
+  assert.equal(first.applied, true);
+  assert.equal(second.applied, false);
+  assert.equal(balance(), before + 1000);
+});
+
+
+test('a failing session does not abort the sweep', () => {
+  const before = balance();
+  addTransactionEx(user.id, 'buyin', -2000, 'buy-in', 'USD', { sessionId: 't4:s1', reference: 'in:t4:s1:1' });
+  db.prepare(`INSERT INTO transactions (user_id,kind,currency,amount,balance_after,memo,session_id,reference)
+    VALUES (999999,'buyin','USD',-1000,0,'bad session','bad:s','in:bad:s:1')`).run();
+  assert.equal(refundOpenSessions(), 1);
+  assert.equal(balance(), before);
+  assert.equal(db.prepare("SELECT COUNT(*) c FROM transactions WHERE reference = 'refund:t4:s1'").get().c, 1);
+  assert.equal(db.prepare("SELECT COUNT(*) c FROM transactions WHERE reference = 'refund:bad:s'").get().c, 0);
+});
+
diff --git a/app/server/ledger.test.js b/app/server/ledger.test.js
index 93fd58b..ea26c94 100644
--- a/app/server/ledger.test.js
+++ b/app/server/ledger.test.js
@@ -37,3 +37,21 @@ test('a failed ledger write does not change the balance', () => {
   assert.equal(after, before);
   assert.equal(db.prepare('SELECT COUNT(*) c FROM transactions WHERE user_id = 999999').get().c, 0);
 });
+
+
+test('each currency reconciles balance to the sum of its ledger rows', () => {
+  const u = db.prepare('SELECT * FROM users ORDER BY id LIMIT 1').get();
+  const before = db.prepare('SELECT balance, play_chips, tickets, gems FROM users WHERE id = ?').get(u.id);
+  addTransaction(u.id, 'recon_usd', 1000, 'usd');
+  addTransaction(u.id, 'recon_play', 500, 'play', 'PLAY');
+  addTransaction(u.id, 'recon_ticket', 2, 'ticket', 'TICKET');
+  addTransaction(u.id, 'recon_gem', 3, 'gem', 'GEM');
+  const sums = db.prepare(`SELECT currency, SUM(amount) total FROM transactions
+    WHERE user_id = ? AND kind LIKE 'recon_%' GROUP BY currency`).all(u.id);
+  const by = Object.fromEntries(sums.map((r) => [r.currency, r.total]));
+  const after = db.prepare('SELECT balance, play_chips, tickets, gems FROM users WHERE id = ?').get(u.id);
+  assert.equal(after.balance - before.balance, by.USD);
+  assert.equal(after.play_chips - before.play_chips, by.PLAY);
+  assert.equal(after.tickets - before.tickets, by.TICKET);
+  assert.equal(after.gems - before.gems, by.GEM);
+});
diff --git a/app/server/refund-fault.test.js b/app/server/refund-fault.test.js
new file mode 100644
index 0000000..a776859
--- /dev/null
+++ b/app/server/refund-fault.test.js
@@ -0,0 +1,23 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import fs from 'node:fs';
+import os from 'node:os';
+import path from 'node:path';
+
+process.env.GGPOKER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'dangro-fault-'));
+const { db, addTransactionEx, openSessions, refundOpenSessions } = await import('./db.js');
+const user = db.prepare('SELECT * FROM users ORDER BY id LIMIT 1').get();
+
+test('a database failure mid-sweep leaves later sessions open and does not abort', () => {
+  addTransactionEx(user.id, 'buyin', -1000, 'buyin', 'USD', { sessionId: 'fault:s1', reference: 'in:fault:s1:1' });
+  addTransactionEx(user.id, 'buyin', -1000, 'buyin', 'USD', { sessionId: 'fault:s2', reference: 'in:fault:s2:1' });
+  let calls = 0;
+  const injected = (...args) => {
+    calls++;
+    if (calls === 2) throw new Error('injected database failure');
+    return addTransactionEx(...args);
+  };
+  assert.equal(refundOpenSessions({ refund: injected }), 1);
+  assert.equal(openSessions().filter((s) => s.session_id.startsWith('fault:')).length, 1);
+  assert.equal(db.prepare("SELECT COUNT(*) c FROM transactions WHERE reference LIKE 'refund:fault:%'").get().c, 1);
+});
diff --git a/app/server/table.js b/app/server/table.js
index fa07090..6cfb710 100644
--- a/app/server/table.js
+++ b/app/server/table.js
@@ -57,14 +57,19 @@ export class PokerTable {
     this.showdownDelay = 5000;
     this.botSpeed = Number(cfg.botSpeed || 900);
     this.aof = cfg.game === 'aof';
+    this.straddle = !!cfg.straddle;
     this.spin = cfg.game === 'spingold';
     this.spinMultiplier = null;
     this.spinPrize = 0;
     this.spinWinner = null;
     this.tournament = cfg.tournament || null;
     this.elimination = this.spin || !!this.tournament;
+    this.flip = this.tournament?.mode === 'FLIP';
+    this.bounty = Number(this.tournament?.bounty || 0);
+    this.mystery = this.tournament?.mode === 'MYSTERY';
+    this.satellite = this.tournament?.mode === 'SATELLITE';
     this.rakePercent = cfg.rakePercent ?? 5;
-    this.rakeCap = cfg.rakeCap ?? 0;
+    this.rakeCap = Number(cfg.rakeCap) > 0 ? Number(cfg.rakeCap) : 300;
     this.rake = 0;
     this.finished = [];
     if (this.spin) {
@@ -72,8 +77,11 @@ export class PokerTable {
       this.spinMultiplier = options[Math.floor(Math.random() * options.length)];
       this.spinPrize = Math.round(cfg.min_buyin * this.spinMultiplier);
     }
-    this.omaha = cfg.game === 'omaha' || cfg.game === 'omaha5';
+    this.omahaHole = cfg.game === 'omaha5' ? 5 : cfg.game === 'omaha6' ? 6 : 4;
+    this.omaha = cfg.game === 'omaha' || cfg.game === 'omaha5' || cfg.game === 'omaha6';
     this.messageSeq = 0;
+    this.tableEpoch = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
+    this.tableVersion = 0;
   }
 
   /* ------------------------------ seating ------------------------------ */
@@ -90,7 +98,7 @@ export class PokerTable {
     return this.seats.find((s) => s.player && s.player.id === playerId);
   }
 
-  sit(player, seatIndex = null, buyin = null) {
+  sit(player, seatIndex = null, buyin = null, sessionId = null) {
     if (this.seatOf(player.id)) return { ok: false, error: 'already seated' };
     let seat = seatIndex != null ? this.seats[seatIndex] : this.seats.find((s) => !s.player);
     if (!seat) return { ok: false, error: 'table full' };
@@ -119,6 +127,8 @@ export class PokerTable {
       joinedAt: Date.now(),
       handsPlayed: 0,
       won: 0,
+      autoMuck: false,
+      sessionId,
     };
     this.emit({ type: 'sit', seat: seat.index, nick: player.nick });
     this.maybeStart();
@@ -173,6 +183,7 @@ export class PokerTable {
     const w = this.occupiedSeats().find((s) => s.player && s.player.stack > 0);
     if (!w || !w.player) return;
     w.player.stack += this.spinPrize;
+    if (this.hooks.onMint) this.hooks.onMint(this, 'spin', this.spinPrize);
     this.spinWinner = { nick: w.player.nick, id: w.player.id, prize: this.spinPrize };
     this.emit({ type: 'spin_win', ...this.spinWinner, multiplier: this.spinMultiplier });
     this.street = 'ended';
@@ -183,6 +194,14 @@ export class PokerTable {
   awardTournamentWinner() {
     const w = this.occupiedSeats().find((s) => s.player && s.player.stack > 0);
     if (!w || !w.player) return;
+    if (this.satellite) {
+      this.tournament.winner = { nick: w.player.nick, id: w.player.id, prize: 0, ticket: this.tournament.ticket };
+      this.emit({ type: 'tourney_win', nick: w.player.nick, id: w.player.id, prize: 0, ticket: this.tournament.ticket, tableName: this.cfg.name });
+      this.street = 'ended';
+      this.nextHandAt = 0;
+      if (this.hooks.onTournamentEnd) this.hooks.onTournamentEnd(this, this.tournament.winner);
+      return;
+    }
     const prize = Math.round((this.tournament.prizePool || 0) * 0.5);
     w.player.stack += prize;
     this.tournament.winner = { nick: w.player.nick, id: w.player.id, prize };
@@ -285,8 +304,16 @@ export class PokerTable {
     }
     this.postBlind(sbSeat, this.sb, 'SB');
     this.postBlind(bbSeat, this.bb, 'BB');
-    this.currentBet = this.bb;
-    this.minRaise = this.bb;
+    let straddleSeat = null;
+    if (this.straddle) {
+      const candidate = this.seats[(bbSeat.index + 1) % this.seats.length];
+      if (candidate?.player && candidate.player.inHand && candidate.player.stack > 0) {
+        straddleSeat = candidate;
+        this.postBlind(straddleSeat, this.bb * 2, 'Straddle');
+      }
+    }
+    this.currentBet = straddleSeat ? this.bb * 2 : this.bb;
+    this.minRaise = straddleSeat ? this.bb * 2 : this.bb;
 
     // deal
     const dealOrder = postOrder;
@@ -300,26 +327,28 @@ export class PokerTable {
     if (this.omaha) {
       for (const s of dealOrder) {
         if (s.player && s.player.inHand) {
-          s.player.cards.push(this.deck.pop());
-          s.player.cards.push(this.deck.pop());
+          for (let i = 0; i < this.omahaHole - 2; i++) s.player.cards.push(this.deck.pop());
         }
       }
     }
 
     this.emit({ type: 'hand_start', handNo: this.handNo, button: this.button, sbSeat: sbSeat.index, bbSeat: bbSeat.index });
 
-    if (this.aof) {
-      // Every player is all-in or folds, no action rounds
-      for (const s of inHand) {
-        s.player.allIn = true;
-      }
-      this.pot = this.pot; // blinds already committed
+    if (this.flip && this.handNo === 1) {
+      for (const s of inHand) s.player.allIn = true;
       this.setActor(null);
       this.runout();
       return;
     }
 
-    const firstToAct = this.nextActionSeat(this.button);
+    if (this.aof) {
+      // Each player chooses all-in or fold; no postflop betting rounds.
+      const first = this.nextActionSeat(this.button);
+      this.setActor(first ? first.player.id : null);
+      return;
+    }
+
+    const firstToAct = this.nextActionSeat(straddleSeat ? straddleSeat.index : this.button);
     this.setActor(firstToAct ? firstToAct.player.id : null);
   }
 
@@ -356,6 +385,18 @@ export class PokerTable {
     return null;
   }
 
+  setAutoMuck(userId, value) {
+    const seat = this.seatOf(userId);
+    if (seat?.player) seat.player.autoMuck = !!value;
+    return { ok: true };
+  }
+
+  setStraddle(value) {
+    if (this.street !== 'idle' && this.street !== 'ended') return { ok: false, error: 'between hands only' };
+    this.straddle = !!value;
+    return { ok: true };
+  }
+
   setActor(playerId) {
     this.actor = playerId;
     if (!playerId) return;
@@ -393,6 +434,36 @@ export class PokerTable {
     if (this.actor !== playerId) return { ok: false, error: 'not your turn' };
     if (p.folded || p.allIn) return { ok: false, error: 'cannot act' };
 
+    if (this.aof) {
+      if (action === 'fold') {
+        p.folded = true;
+        p.acted = true;
+        p.lastAction = { action: 'Fold', amount: 0 };
+        this.emit({ type: 'action', seat: seat.index, playerId, action: 'fold' });
+      } else if (action === 'allin') {
+        const paid = this.commit(p, p.stack);
+        p.allIn = true;
+        p.acted = true;
+        p.lastAction = { action: 'All-in', amount: p.bet };
+        this.lastAggressor = p.id;
+        this.emit({ type: 'action', seat: seat.index, playerId, action: 'allin', amount: p.bet, paid, allIn: true });
+      } else {
+        return { ok: false, error: 'all-in or fold only' };
+      }
+      const pending = this.seats.filter((x) => x.player && x.player.inHand && !x.player.folded && !x.player.allIn && !x.player.acted);
+      const live = this.seats.filter((x) => x.player && x.player.inHand && !x.player.folded);
+      if (live.length <= 1) {
+        this.setActor(null);
+        this.finishByFold();
+      } else if (!pending.length) {
+        this.setActor(null);
+        this.runout();
+      } else {
+        this.setActor(pending[0].player.id);
+      }
+      return { ok: true };
+    }
+
     const call = this.toCall(p);
     if (action === 'fold') {
       p.folded = true;
@@ -546,8 +617,7 @@ export class PokerTable {
   computeRake(pot) {
     if (this.tournament || this.spin) return 0;
     const raw = Math.floor((pot * this.rakePercent) / 100);
-    const cap = this.rakeCap || Math.round(this.bb * 3);
-    return Math.min(raw, cap);
+    return Math.min(raw, this.rakeCap);
   }
 
   finishByFold(winnerSeat) {
@@ -579,7 +649,6 @@ export class PokerTable {
   doShowdown() {
     this.collectBets();
     const alive = this.activePlayers().filter((s) => !s.player.folded);
-    for (const s of alive) s.player.reveal = true;
     const scored = alive.map((s) => {
       const p = s.player;
       const best = this.omaha ? bestOmaha(p.cards, this.board) : bestHoldem(p.cards, this.board);
@@ -689,7 +758,10 @@ export class PokerTable {
         this.nextHandAt = 0;
         // remove busted bots, rebuy bots so the table stays alive
         for (const s of this.seats) {
-          if (s.player && s.player.isBot && s.player.stack <= 0 && !this.elimination) s.player.stack = this.cfg.max_buyin;
+          if (s.player && s.player.isBot && s.player.stack <= 0 && !this.elimination) {
+            s.player.stack = this.cfg.max_buyin;
+            if (this.hooks.onMint) this.hooks.onMint(this, 'bot', this.cfg.max_buyin);
+          }
         }
         if (this.elimination) {
           const aliveCount = this.occupiedSeats().filter((x) => x.player && x.player.stack > 0).length;
@@ -707,6 +779,28 @@ export class PokerTable {
                 this.finished.push({ nick: busted.nick, id: busted.id, place, payout });
                 if (payout > 0 && this.hooks.onTournamentPayout) this.hooks.onTournamentPayout(this, { id: busted.id, nick: busted.nick, place, payout });
               }
+              if (this.bounty > 0 && (this.mystery || this.tournament.mode === 'BOUNTY')) {
+                const killerSeat = this.lastAggressor ? this.seatOf(this.lastAggressor) : null;
+                const killer = killerSeat?.player && killerSeat.player.stack > 0
+                  ? killerSeat.player
+                  : this.occupiedSeats().find((x) => x.player && x.player.stack > 0)?.player;
+                if (killer && killer.id !== busted.id) {
+                  const tiers = [0.1, 0.25, 0.5, 1, 2, 5, 10];
+                  const amount = this.mystery
+                    ? Math.round(this.bounty * tiers[Math.floor(Math.random() * tiers.length)])
+                    : this.bounty;
+                  this.hooks.onBounty?.(this, {
+                    winnerId: killer.id, winnerNick: killer.nick,
+                    bustedId: busted.id, bustedNick: busted.nick,
+                    amount, mystery: this.mystery,
+                  });
+                  this.emit({
+                    type: 'bounty', seat: s.index, winnerId: killer.id, winnerNick: killer.nick,
+                    bustedNick: busted.nick, amount, mystery: this.mystery,
+                  });
+                }
+              }
+              try { if (this.hooks.onSeatBusted) this.hooks.onSeatBusted(this, busted); } catch (e) { console.error('seat busted hook', e); }
               s.player = null;
               this.emit({ type: 'stand', seat: s.index });
             }
@@ -803,6 +897,8 @@ export class PokerTable {
     const now = Date.now();
     return {
       id: this.cfg.id,
+      tableEpoch: this.tableEpoch,
+      tableVersion: this.tableVersion,
       name: this.cfg.name,
       game: this.game,
       sb: this.sb,
@@ -855,13 +951,17 @@ export class PokerTable {
       lastAction: this.lastAction,
       canStart: this.street === 'idle',
       spin: this.spin ? { multiplier: this.spinMultiplier, prize: this.spinPrize, winner: this.spinWinner } : null,
-      tournament: this.tournament ? { name: this.cfg.name, prizePool: this.tournament.prizePool, level: this.tournament.level || 1, winner: this.tournament.winner || null } : null,
+      straddle: this.straddle,
+      tournament: this.tournament ? { name: this.cfg.name, prizePool: this.tournament.prizePool, level: this.tournament.level || 1, mode: this.tournament.mode || 'STANDARD', bounty: this.tournament.bounty || 0, ticket: this.tournament.ticket || '', winner: this.tournament.winner || null } : null,
     };
   }
 
   emit(evt) {
     evt.tableId = this.cfg.id;
+    this.tableVersion += 1;
     evt.seq = ++this.messageSeq;
+    evt.tableEpoch = this.tableEpoch;
+    evt.tableVersion = this.tableVersion;
     evt.at = Date.now();
     if (evt.type === 'win') this.lastResult = evt;
     for (const fn of this.listeners) {
diff --git a/app/src/lib/api.ts b/app/src/lib/api.ts
index 34cae72..dd11061 100644
--- a/app/src/lib/api.ts
+++ b/app/src/lib/api.ts
@@ -34,6 +34,8 @@ export type LobbyTable = {
   wait: number;
   avgPot: number;
   vpip: number;
+  synthetic?: boolean;
+  pro?: boolean;
   handsPerHour: number;
   running: boolean;
 };
@@ -82,8 +84,8 @@ export const api = {
   registerTourney: (id: string) => request(`/api/tournaments/${id}/register`, { method: 'POST' }),
   unregisterTourney: (id: string) => request(`/api/tournaments/${id}/unregister`, { method: 'POST' }),
   cashier: () => request<any>('/api/cashier'),
-  deposit: (amount: number, method?: string) => request<any>('/api/cashier/deposit', { method: 'POST', body: JSON.stringify({ amount, method }) }),
-  withdraw: (amount: number, method?: string) => request<any>('/api/cashier/withdraw', { method: 'POST', body: JSON.stringify({ amount, method }) }),
+  deposit: (amount: number, method?: string, key?: string) => request<any>('/api/cashier/deposit', { method: 'POST', headers: key ? { 'idempotency-key': key } : {}, body: JSON.stringify({ amount, method }) }),
+  withdraw: (amount: number, method?: string, key?: string) => request<any>('/api/cashier/withdraw', { method: 'POST', headers: key ? { 'idempotency-key': key } : {}, body: JSON.stringify({ amount, method }) }),
   hands: () => request<{ hands: any[] }>('/api/hands'),
   missions: () => request<{ missions: any[] }>('/api/missions'),
   claimMission: (id: string) => request<any>(`/api/missions/${id}/claim`, { method: 'POST' }),
@@ -157,6 +159,7 @@ export const GAME_LABEL: Record<string, string> = {
   holdem: "Hold'em",
   omaha: 'PLO',
   omaha5: 'PLO5',
+  omaha6: 'PLO6',
   shortdeck: 'Short Deck',
   rush: 'Rush & Cash',
   aof: 'All-in or Fold',
diff --git a/app/src/pages/Admin.tsx b/app/src/pages/Admin.tsx
index 3487a64..6975250 100644
--- a/app/src/pages/Admin.tsx
+++ b/app/src/pages/Admin.tsx
@@ -1,4 +1,4 @@
-import React, { useEffect, useMemo, useState } from 'react';
+import React, { useEffect, useMemo, useRef, useState } from 'react';
 import { api, money, User } from '../lib/api';
 import { useApp } from '../lib/store';
 import { sound } from '../lib/sound';
@@ -91,7 +91,13 @@ export function Admin() {
     catch (e: any) { toast({ kind: 'error', title: 'Failed', body: e.message }); }
   };
 
-  const quickCredit = (u: User, amount: number) => userAction(u.id, { action: 'credit', amount });
+  const creditBusy = useRef(new Set<string>());
+  const quickCredit = (u: User, amount: number) => {
+    const key = `${u.id}:${amount}`;
+    if (creditBusy.current.has(key)) return;
+    creditBusy.current.add(key);
+    userAction(u.id, { action: 'credit', amount, reference: crypto.randomUUID() }).finally(() => creditBusy.current.delete(key));
+  };
 
   if (!isAdmin) {
     return (
@@ -139,6 +145,8 @@ export function Admin() {
                 <div className="stat"><span>Hands played</span><b>{stats?.hands ?? '—'}</b></div>
                 <div className="stat"><span>Cash tables</span><b>{stats?.tables ?? '—'}</b></div>
                 <div className="stat"><span>Tournaments</span><b>{stats?.tourneys ?? '—'}</b></div>
+                <div className="stat"><span>Bot mint</span><b>{money(stats?.mint_bot || 0)}</b></div>
+                <div className="stat"><span>Spin mint</span><b>{money(stats?.mint_spin || 0)}</b></div>
               </div>
               <div className="grid g2">
                 <div className="admin-card">
@@ -334,7 +342,7 @@ export function Admin() {
                         <td>
                           <div className="row" style={{ gap: 3 }}>
                             <button className="btn btn-ghost btn-sm" onClick={() => { setEditing({ kind: 'mission' }); setLocal({ ...m, active: !!m.active }); }}>Edit</button>
-                            <button className="btn btn-ghost btn-sm" onClick={async () => { await api.admin.saveMission({ ...m, progress: 0, claimed: false }); loadAll(); }}>Reset</button>
+                            <button className="btn btn-ghost btn-sm" onClick={async () => { await api.admin.saveMission({ id: m.id, reset: true }); loadAll(); }}>Reset</button>
                           </div>
                         </td>
                       </tr>
diff --git a/app/src/pages/Cashier.tsx b/app/src/pages/Cashier.tsx
index 68ba28e..7e130ed 100644
--- a/app/src/pages/Cashier.tsx
+++ b/app/src/pages/Cashier.tsx
@@ -1,4 +1,4 @@
-import React, { useEffect, useState } from 'react';
+import React, { useEffect, useRef, useState } from 'react';
 import { api, money } from '../lib/api';
 import { useApp } from '../lib/store';
 import { sound } from '../lib/sound';
@@ -14,26 +14,33 @@ export function Cashier() {
   const [method, setMethod] = useState(METHODS[0]);
   const [busy, setBusy] = useState(false);
   const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
+  const requestKey = useRef<string | null>(null);
+  const inFlight = useRef(false);
 
   const load = async () => {
     if (!user) return;
     try { setData(await api.cashier()); } catch (e: any) { toast({ kind: 'error', title: 'Cashier', body: e.message }); }
   };
   useEffect(() => { load(); }, [user]);
+  useEffect(() => { requestKey.current = null; }, [amount, method, mode]);
 
   const submit = async () => {
     if (!user) { navigate('/login'); return; }
+    if (inFlight.current) return;
+    inFlight.current = true;
     setBusy(true);
     try {
-      if (mode === 'deposit') await api.deposit(amount, method);
-      else await api.withdraw(amount, method);
+      if (!requestKey.current) requestKey.current = crypto.randomUUID();
+      if (mode === 'deposit') await api.deposit(amount, method, requestKey.current || undefined);
+      else await api.withdraw(amount, method, requestKey.current || undefined);
       sound.play('coin');
       toast({ kind: 'success', title: mode === 'deposit' ? 'Deposit complete' : 'Withdrawal requested', body: money(amount) });
       await load();
       await refreshUser();
+      requestKey.current = null;
     } catch (e: any) {
       toast({ kind: 'error', title: 'Transaction failed', body: e.message });
-    } finally { setBusy(false); }
+    } finally { inFlight.current = false; setBusy(false); }
   };
 
   const tx = data?.transactions || [];
diff --git a/app/src/pages/Lobby.tsx b/app/src/pages/Lobby.tsx
index b565b06..af0bd41 100644
--- a/app/src/pages/Lobby.tsx
+++ b/app/src/pages/Lobby.tsx
@@ -11,7 +11,7 @@ const TAB_GAME: Record<string, string[]> = {
   aof: ['aof'],
   rush: ['rush'],
   holdem: ['holdem'],
-  plo: ['omaha', 'omaha5'],
+  plo: ['omaha', 'omaha5', 'omaha6'],
   short: ['shortdeck'],
   spin: ['spingold'],
   battle: ['battleroyale'],
@@ -54,9 +54,7 @@ function MiniTable({ table, players }: { table: LobbyTable | null; players: { na
 }
 
 function fmtStakes(t: LobbyTable) {
-  const sb = (t.sb / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });
-  const bb = (t.bb / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });
-  return `$${sb} / $${bb}`;
+  return `${money(t.sb, true)} / ${money(t.bb, true)}`;
 }
 
 export function Lobby() {
@@ -243,10 +241,10 @@ export function Lobby() {
               <div onClick={() => { setSortKey('name'); setSortDir(sortKey === 'name' ? (sortDir === 1 ? -1 : 1) : 1); }} style={{ cursor: 'pointer' }}>Table Name</div>
               <div onClick={() => { setSortKey('bb'); setSortDir(sortKey === 'bb' ? (sortDir === 1 ? -1 : 1) : 1); }} style={{ cursor: 'pointer' }}>Stakes</div>
               <div>Buy-in</div>
-              <div onClick={() => { setSortKey('players'); setSortDir(sortKey === 'players' ? (sortDir === 1 ? -1 : 1) : 1); }} style={{ cursor: 'pointer' }}>Players</div>
+              <div onClick={() => { setSortKey('players'); setSortDir(sortKey === 'players' ? (sortDir === 1 ? -1 : 1) : 1); }} style={{ cursor: 'pointer' }}>Players <i className="est-dot" title="Estimated demo value; not live" /></div>
               <div>Wait</div>
-              <div onClick={() => { setSortKey('avgPot'); setSortDir(sortKey === 'avgPot' ? (sortDir === 1 ? -1 : 1) : 1); }} style={{ cursor: 'pointer' }}>AvgPot</div>
-              <div>VPIP%</div><div>H/hr</div>
+              <div onClick={() => { setSortKey('avgPot'); setSortDir(sortKey === 'avgPot' ? (sortDir === 1 ? -1 : 1) : 1); }} style={{ cursor: 'pointer' }}>AvgPot <i className="est-dot" title="Estimated demo value; not live" /></div>
+              <div>VPIP% <i className="est-dot" title="Estimated demo value; not live" /></div><div>H/hr <i className="est-dot" title="Estimated demo value; not live" /></div>
             </div>
             <div className="list-scroll">
               {viewMode === 'group' ? (
@@ -272,6 +270,7 @@ export function Lobby() {
                     <button className={'fav-star' + (favs.includes(t.id) ? ' on' : '')} onClick={(e) => { e.stopPropagation(); toggleFav(t.id); }} title="Favourite">★</button>
                     <span className={'chip-dot ' + t.category.toLowerCase()} />
                     <span>{t.name}</span>
+                    {t.pro && <span className="tag pro">PRO</span>}
                   </div>
                   <div>{fmtStakes(t)}</div>
                   <div>{money(t.min_buyin, true)}</div>
@@ -303,6 +302,12 @@ export function Lobby() {
             <button className="btn btn-dark btn-block" onClick={() => { if (table) navigate(`/table/${table.id}?observe=1`); }}>Open</button>
             <button className="btn btn-red btn-block" onClick={() => { if (table) openJoin(table); }}>Join</button>
           </div>
+          <div className="mini-stats">
+            <div className="between"><span className="muted small">Last jackpot</span><b className="gold">{money(data?.jackpot || 0)}</b></div>
+            {(data?.recentWinners || []).slice(0, 3).map((w: any, i: number) => (
+              <div key={i} className="between"><span className="muted small">{w.nick}</span><span className="small">{money(w.amount)}</span></div>
+            ))}
+          </div>
           <div style={{ flex: 1 }} />
           <div style={{ padding: '6px 8px', fontSize: 11, color: '#777', borderTop: '1px solid #222' }}>
             {table ? GAME_LABEL[table.game] : ''} · {table ? table.speed : ''}
diff --git a/app/src/pages/Rewards.tsx b/app/src/pages/Rewards.tsx
index 9ba833e..ecf04c6 100644
--- a/app/src/pages/Rewards.tsx
+++ b/app/src/pages/Rewards.tsx
@@ -53,7 +53,7 @@ export function Rewards({ initialTab = 'ggpass' }: { initialTab?: string } = {})
     try {
       const res = await api.claimMission(m.id);
       sound.play('mission');
-      toast({ kind: 'reward', title: 'Reward claimed', body: `+${m.reward_kind === 'TICKET' ? 'T$' : '$'}${(m.reward / 100).toFixed(2)}` });
+      toast({ kind: 'reward', title: 'Reward claimed', body: `+${m.reward_kind === 'TICKET' ? `T$${m.reward}` : money(m.reward)}` });
       await load(); await refreshUser();
     } catch (e: any) { toast({ kind: 'error', title: 'Cannot claim', body: e.message }); }
   };
@@ -162,7 +162,7 @@ export function Rewards({ initialTab = 'ggpass' }: { initialTab?: string } = {})
                 <div className="progress"><i style={{ width: `${Math.min(100, (m.progress / m.goal) * 100)}%` }} /></div>
                 <div className="between" style={{ marginTop: 6 }}>
                   <span className="muted small">{m.progress} / {m.goal}</span>
-                  <span className="gold small">{m.reward_kind === 'TICKET' ? `T$${m.reward / 100}` : money(m.reward)}</span>
+                  <span className="gold small">{m.reward_kind === 'TICKET' ? `T$${m.reward}` : money(m.reward)}</span>
                 </div>
                 <button
                   className={'btn btn-sm ' + (m.claimed ? 'btn-ghost' : 'btn-gold')}
diff --git a/app/src/pages/TablePage.tsx b/app/src/pages/TablePage.tsx
index 825e4e5..c8ff8bf 100644
--- a/app/src/pages/TablePage.tsx
+++ b/app/src/pages/TablePage.tsx
@@ -15,13 +15,14 @@ type PlayerState = {
 };
 
 type TableState = {
-  id: string; name: string; game: string; sb: number; bb: number; ante: number; seats: number;
+  id: string; tableEpoch?: string; tableVersion?: number; name: string; game: string; sb: number; bb: number; ante: number; seats: number;
   button: number; handNo: number; street: string; board: string[]; pot: number; currentBet: number;
   minRaise: number; actor: string | null; actionEndsAt: number; now: number; result: any;
   timeBankUsed?: number[];
   players: PlayerState[]; log: any[]; minBuyin?: number; maxBuyin?: number;
   spin?: { multiplier: number; prize: number; winner: any } | null;
-  tournament?: { name: string; prizePool: number; level: number; winner: any } | null;
+  tournament?: { name: string; prizePool: number; level: number; winner: any; mode?: string; bounty?: number; ticket?: string } | null;
+  straddle?: boolean;
 };
 
 const POS6 = [[50, 80], [12, 71], [16, 32], [50, 17], [84, 32], [88, 71]];
@@ -62,6 +63,7 @@ export function TablePage({ tableId }: { tableId: string }) {
   const [noteText, setNoteText] = useState('');
   const [noteColor, setNoteColor] = useState('yellow');
   const [autoRebuy, setAutoRebuy] = useState(() => localStorage.getItem('ggpoker.autorebuy') === '1');
+  const [autoMuck, setAutoMuck] = useState(() => localStorage.getItem('ggpoker.automuck') === '1');
   const autoRebuyPending = useRef(false);
   const spinSeen = useRef(false);
   const [now, setNow] = useState(Date.now());
@@ -72,6 +74,8 @@ export function TablePage({ tableId }: { tableId: string }) {
   const fxId = useRef(1);
   const retry = useRef<number | null>(null);
   const everJoined = useRef(false);
+  const tableEpoch = useRef<string | null>(null);
+  const lastSeq = useRef(0);
 
   const [theme] = useState(() => localStorage.getItem('ggpoker.theme') || 'Green');
   const query = new URLSearchParams(window.location.hash.split('?')[1] || '');
@@ -97,6 +101,8 @@ export function TablePage({ tableId }: { tableId: string }) {
       try { msg = JSON.parse(ev.data); } catch { return; }
       if (msg.type === 'state') {
         const s: TableState = msg.state;
+        tableEpoch.current = s.tableEpoch || null;
+        lastSeq.current = s.tableVersion || 0;
         stateRef.current = s;
         setState(s);
         const mine = s.players.find((p) => p.isMe);
@@ -123,7 +129,11 @@ export function TablePage({ tableId }: { tableId: string }) {
         setObserving(true);
         toast({ kind: 'info', title: 'Waitlist', body: `You are #${msg.position || 1} in line. We will hold the next seat for you.` });
       } else if (msg.type === 'event') {
-        handleEvent(msg.event);
+        const e = msg.event;
+        if (tableEpoch.current && e.tableEpoch && e.tableEpoch !== tableEpoch.current) { ws.close(); return; }
+        if (e.seq && lastSeq.current && e.seq > lastSeq.current + 1) { ws.close(); return; }
+        if (e.seq) lastSeq.current = e.seq;
+        handleEvent(e);
       } else if (msg.type === 'error') {
         toast({ kind: 'error', title: 'Table', body: msg.error });
       }
@@ -220,6 +230,9 @@ export function TablePage({ tableId }: { tableId: string }) {
         window.setTimeout(() => setWinFx(null), 2600);
       }
       if (Array.isArray(evt.cards)) sound.play('show', { volume: .5 });
+    } else if (evt.type === 'bounty') {
+      toast({ kind: 'reward', title: evt.mystery ? 'Mystery bounty' : 'Bounty', body: `${evt.winnerNick} wins ${money(evt.amount)} (${evt.bustedNick})` });
+      sound.play('coin');
     } else if (evt.type === 'tourney_payout') {
       toast({ kind: 'reward', title: `Finished #${evt.place}`, body: `${evt.nick} wins ${money(evt.payout)}` });
       sound.play('coin');
@@ -447,6 +460,8 @@ export function TablePage({ tableId }: { tableId: string }) {
           <button onClick={() => { setRebuyAmount(state?.minBuyin || 0); setRebuyOpen(true); setMenuOpen(false); }}>Rebuy / add chips</button>
           <button onClick={() => { const v = !autoRebuy; setAutoRebuy(v); localStorage.setItem('ggpoker.autorebuy', v ? '1' : '0'); }}>{autoRebuy ? '✓ ' : ''}Auto rebuy</button>
           <button onClick={() => { send({ type: 'rabbit' }); sound.play('rabbit'); }}>Rabbit hunt</button>
+          <button onClick={() => send({ type: 'option', tableId, straddle: !state?.straddle })}>{state?.straddle ? '✓ ' : ''}Straddle</button>
+          <button onClick={() => { const v = !autoMuck; setAutoMuck(v); localStorage.setItem('ggpoker.automuck', v ? '1' : '0'); send({ type: 'option', tableId, autoMuck: v }); }}>{autoMuck ? '✓ ' : ''}Auto-muck losing hand</button>
           <button onClick={() => { const v = !fourColor; setFourColor(v); localStorage.setItem('ggpoker.fourcolor', v ? '1' : '0'); }}>{fourColor ? '✓ ' : ''}Four-colour deck</button>
           <button onClick={() => { const v = !animOff; setAnimOff(v); localStorage.setItem('ggpoker.animations', v ? '0' : '1'); }}>{animOff ? 'Enable animations' : 'Disable animations'}</button>
           <button onClick={() => navigate('/hand-history')}>Hand history</button>
@@ -696,7 +711,7 @@ export function TablePage({ tableId }: { tableId: string }) {
         <div className="spin-overlay win">
           <div className="spin-title">TOURNAMENT WINNER</div>
           <div style={{ fontSize: 60, margin: '10px 0' }}>🏆</div>
-          <div className="spin-prize">{tourneyWin.nick} wins <b>{money(tourneyWin.prize)}</b></div>
+          <div className="spin-prize">{tourneyWin.nick} wins {tourneyWin.ticket ? <b>{tourneyWin.ticket} ticket</b> : <b>{money(tourneyWin.prize)}</b>}</div>
           <div className="spin-sub">{tourneyWin.tableName}</div>
           <button className="btn btn-gold" style={{ marginTop: 18 }} onClick={() => navigate('/')}>Back to lobby</button>
         </div>
diff --git a/app/src/pages/Tournaments.tsx b/app/src/pages/Tournaments.tsx
index af10738..fbb7294 100644
--- a/app/src/pages/Tournaments.tsx
+++ b/app/src/pages/Tournaments.tsx
@@ -11,6 +11,8 @@ const SERIES = [
   { key: 'mystery', label: 'Mystery Bounty' },
   { key: 'spin', label: 'Spin & Gold' },
   { key: 'flip', label: 'Flip & Go' },
+  { key: 'bounty', label: 'Bounty Hunters' },
+  { key: 'sat', label: 'Satellites' },
 ];
 
 const SERIES_ART: Record<string, string> = {
@@ -51,7 +53,7 @@ export function Tournaments() {
     else if (filter === 'plo') l = l.filter((t: any) => t.format === 'PLO');
     else if (filter === 'holdem') l = l.filter((t: any) => t.format === 'NLH');
     if (series !== 'all') {
-      const needle: Record<string, string> = { wsop: 'WSOP', ggmasters: 'GGMasters', mystery: 'Mystery', spin: 'Spin', flip: 'Flip & Go' };
+      const needle: Record<string, string> = { wsop: 'WSOP', ggmasters: 'GGMasters', mystery: 'Mystery', spin: 'Spin', flip: 'Flip & Go', bounty: 'Bounty', sat: 'Satellite' };
       l = l.filter((t: any) => t.name.toLowerCase().includes(needle[series].toLowerCase()));
     }
     return l;
@@ -162,7 +164,7 @@ export function Tournaments() {
                   <span className={'chip-dot ' + (t.buyin >= 10000 ? 'diamond' : t.buyin >= 3000 ? 'platinum' : 'gold')} />
                   <div>
                     <b>{t.name}</b>
-                    <small>{t.format} · {t.starting_stack.toLocaleString()} chips · {t.blind_speed} min blinds</small>
+                    <small>{t.mode && t.mode !== 'STANDARD' ? `${t.mode} · ` : ''}{t.format} · {t.starting_stack.toLocaleString()} chips · {t.blind_speed} min blinds</small>
                   </div>
                 </div>
                 <div className="t-buyin">{t.buyin === 0 ? 'Freeroll' : money(t.buyin + t.fee)}</div>
@@ -212,6 +214,10 @@ export function Tournaments() {
                     <div className="kv"><span>Game</span><b>{detail.format}</b></div>
                     <div className="kv"><span>Start</span><b>{new Date(detail.start_at).toLocaleString('en-GB')}</b></div>
                     <div className="kv"><span>Late registration</span><b>Until level 12</b></div>
+                    {detail.mode && detail.mode !== 'STANDARD' && <div className="kv"><span>Format</span><b>{detail.mode}</b></div>}
+                    {detail.mode === 'BOUNTY' && <div className="kv"><span>Bounty</span><b className="gold">{money(detail.bounty || 0)}</b></div>}
+                    {detail.mode === 'MYSTERY' && <div className="kv"><span>Mystery bounty</span><b className="gold">up to {money((detail.bounty || 0) * 10)}</b></div>}
+                    {detail.mode === 'SATELLITE' && <div className="kv"><span>Ticket</span><b>{detail.ticket || 'Target event'}</b></div>}
                   </div>
                   <p className="muted small" style={{ marginTop: 14 }}>
                     Play-money tournament. Prizes are credited to your play balance. Blind levels increase every {detail.blind_speed} minutes;
diff --git a/app/src/styles.css b/app/src/styles.css
index 8fc54b5..cba793f 100644
--- a/app/src/styles.css
+++ b/app/src/styles.css
@@ -818,3 +818,6 @@ body.electron .app-window { transform: none !important; border-radius: 11px; }
 .series-chip { height: 28px; padding: 0 14px; border-radius: 14px; background: #191919; border: 1px solid #303030; color: #b9b9b9; font-size: 11.5px; white-space: nowrap; }
 .series-chip:hover { border-color: #5a4a22; color: #e8d5a0; }
 .series-chip.on { background: #2b2110; border-color: #8a6a2a; color: #ffe1a0; }
+.est-dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: #6d5a2a; margin-left: 3px; vertical-align: middle; cursor: help; }
+.tag.pro { background: #2b3b2e; color: #9fe0a8; border: 1px solid #3e5a42; font-size: 9px; padding: 1px 4px; margin-left: 6px; }
+.mini-stats { padding: 8px 12px; border-top: 1px solid #2b2b2b; display: flex; flex-direction: column; gap: 4px; }
```
