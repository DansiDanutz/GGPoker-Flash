// DanGG rebrand: stored GGPoker display names are renamed on boot, and a second pass changes nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const serverDir = import.meta.dirname;

// Runs `body` after importing db.js in a fresh process on `dataDir` (a server boot) and returns its JSON output.
function runOnDb(dataDir, body) {
  const script = `const m = await import('./db.js'); const { db } = m; ${body}`;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: serverDir, env: { ...process.env, GGPOKER_DATA: dataDir }, encoding: 'utf8',
  });
  return JSON.parse(out);
}

const READ_ROWS = `
  const table = db.prepare("SELECT name FROM tables WHERE id = 'legacy-rush'").get().name;
  const spin = db.prepare("SELECT name FROM tables WHERE id = 'legacy-spin'").get().name;
  const flip = db.prepare("SELECT name, mode FROM tournaments WHERE id = 'legacy-flip'").get();
  const wsop = db.prepare("SELECT name FROM tournaments WHERE id = 'legacy-wsop'").get().name;
  const banner = db.prepare("SELECT title, subtitle FROM banners WHERE link = '/legacy'").get();
  const site = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'site_name'").get().value);`;

test('brand rename migration renames old GGPoker display names and is idempotent', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-brand-rename-'));
  try {
    // A database written by an older build: insert rows with the old names, bypassing the migration.
    runOnDb(dataDir, `
      const ins = db.prepare("INSERT INTO tables (id,name,game,category,sb,bb,ante,min_buyin,max_buyin,seats,speed,featured,sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
      ins.run('legacy-rush', 'Rush & Cash Gold 250/500 01', 'rush', 'Gold', 250, 500, 0, 10000, 50000, 6, 'Fast', 0, 5000);
      ins.run('legacy-spin', 'Spin & Gold 5,000 01', 'spingold', 'Spin', 10, 20, 0, 5000, 5000, 3, 'Fast', 0, 5001);
      const tins = db.prepare("INSERT INTO tournaments (id,name,buyin,fee,gtd,start_at,entrants,format,mode) VALUES (?,?,?,?,?,?,?,?,?)");
      tins.run('legacy-flip', 'Flip & Go $5K', 500, 50, 500000, new Date().toISOString(), 10, 'NLH', 'STANDARD');
      tins.run('legacy-wsop', 'WSOP Express $10K', 1000, 100, 1000000, new Date().toISOString(), 10, 'NLH', 'STANDARD');
      db.prepare("INSERT INTO banners (slot,title,subtitle,image,link,sort) VALUES ('home','WSOP EXPRESS','#ThanksGG · GGCheers','/x.png','/legacy',9)").run();
      db.prepare("UPDATE settings SET value = ? WHERE key = 'site_name'").run(JSON.stringify('GGPoker'));
      process.stdout.write('{}');`);

    // The next boot runs the migration; an explicit second pass then finds nothing to change.
    const booted = runOnDb(dataDir, `${READ_ROWS}
      const again = m.renameBrandNames();
      process.stdout.write(JSON.stringify({ table, spin, flip, wsop, banner, site, again }));`);
    assert.equal(booted.table, 'Fast Fold Gold 250/500 01');
    assert.equal(booted.spin, 'Jackpot SNG 5,000 01');
    assert.deepEqual(booted.flip, { name: 'Quick Flip $5K', mode: 'FLIP' }, 'renamed before the FLIP mode backfill');
    assert.equal(booted.wsop, 'Live Series $10K');
    assert.deepEqual(booted.banner, { title: 'LIVE SERIES', subtitle: '#ThanksDanGG · DanGG Cheers' });
    assert.equal(booted.site, 'DanGG');
    assert.equal(booted.again, 0, 'a second pass changes no rows');

    const rebooted = runOnDb(dataDir, `${READ_ROWS}
      process.stdout.write(JSON.stringify({ table, spin, flip, wsop, banner, site }));`);
    const { again: _again, ...expected } = booted;
    assert.deepEqual(rebooted, expected, 'another boot leaves the renamed rows unchanged');
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('brand rename leaves an admin-chosen site name alone', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-brand-rename-'));
  try {
    runOnDb(dataDir, `db.prepare("UPDATE settings SET value = ? WHERE key = 'site_name'").run(JSON.stringify('My Club')); process.stdout.write('{}');`);
    const out = runOnDb(dataDir, `process.stdout.write(JSON.stringify({ site: m.getSetting('site_name') }));`);
    assert.equal(out.site, 'My Club');
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('seed repair renames Battle Royale tiers, caps them above their entrants and deals game-named events in their game', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-brand-rename-'));
  try {
    // An older seed: tier names with the old product name, the default 1,000 cap and NLH for every event.
    runOnDb(dataDir, `
      db.prepare("UPDATE tournaments SET name = replace(name, 'Battle Royale', 'Mystery Battle Royale'), max_players = 1000 WHERE id LIKE 'mbr-%'").run();
      db.prepare("UPDATE tournaments SET format = 'NLH' WHERE id IN ('t6', 't7')").run();
      process.stdout.write('{}');`);
    const read = `
      const tiers = db.prepare("SELECT name, entrants, max_players FROM tournaments WHERE id LIKE 'mbr-%' ORDER BY id").all();
      const formats = db.prepare("SELECT id, name, format FROM tournaments WHERE id IN ('t6', 't7') ORDER BY id").all();`;
    const booted = runOnDb(dataDir, `${read} process.stdout.write(JSON.stringify({ tiers, formats }));`);
    assert.equal(booted.tiers.length, 5);
    for (const tier of booted.tiers) {
      assert.match(tier.name, /^Battle Royale \$/);
      assert.ok(tier.entrants <= tier.max_players, `${tier.name}: ${tier.entrants} entrants fit a ${tier.max_players} cap`);
    }
    assert.deepEqual(booted.formats, [
      { id: 't6', name: 'Omaha Weekly $25K', format: 'PLO' },
      { id: 't7', name: 'Short Deck $10K', format: 'Short Deck' },
    ]);
    const rebooted = runOnDb(dataDir, `${read} process.stdout.write(JSON.stringify({ tiers, formats }));`);
    assert.deepEqual(rebooted, booted, 'a second boot changes nothing');
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
