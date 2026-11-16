// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { renderSiteHtml, resolveSiteProfile, siteManifest, siteProfileEnv, SITE_ENV_KEYS } from '../config/site-profile.js';
import { loadSiteProfile } from './site-profile.js';

const appRoot = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, 'public/manifest.webmanifest'), 'utf8'));

test('no portable profile keeps the existing DanGG identity and installed app name', () => {
  const site = resolveSiteProfile({});
  assert.equal(site.profile, 'dangg');
  assert.equal(site.name, 'DanGG');
  assert.equal(site.origin, 'https://dangg.live');
  assert.equal(site.logo, '/assets/brand/logo-animated.gif');
  assert.equal(site.bootLogo, '/assets/brand/logo.png');
  assert.equal(site.supportEmail, 'support@dangg.live');
  assert.deepEqual(siteManifest(manifest, site), manifest);
});

test('portable profile agrees across the shell, social metadata and installable manifest', () => {
  const site = resolveSiteProfile({ OPENPOKER_PROFILE: 'portable' });
  const output = renderSiteHtml(html, site);
  const pwa = siteManifest(manifest, site);
  assert.equal(site.name, 'OpenPoker');
  assert.equal(site.origin, 'http://localhost:5198');
  assert.equal(site.supportEmail, '');
  assert.ok(output.includes('<title>OpenPoker</title>'));
  assert.ok(output.includes('property="og:url" content="http://localhost:5198/"'));
  assert.ok(output.includes('property="og:image" content="http://localhost:5198/openpoker/social.png"'));
  assert.ok(output.includes('name="twitter:image" content="http://localhost:5198/openpoker/social.png"'));
  assert.ok(output.includes('property="og:image:type" content="image/png"'));
  assert.ok(output.includes('src="/openpoker/logo.svg" alt="OpenPoker"'));
  assert.ok(output.includes('rel="apple-touch-icon" href="/openpoker/apple-touch-icon.png"'));
  assert.equal(pwa.name, 'OpenPoker');
  assert.equal(pwa.short_name, 'OpenPoker');
  assert.equal(pwa.id, manifest.id, 'the origin-scoped app identity remains stable for existing installations');
  assert.deepEqual(pwa.icons.map((icon) => [icon.sizes, icon.purpose]), [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]);
  for (const asset of [site.logo, site.icon, site.image, site.touchIcon, ...pwa.icons.map((icon) => icon.src)]) {
    assert.ok(fs.existsSync(path.join(appRoot, 'public', asset)), `shipped portable asset ${asset}`);
  }
});

test('custom identity is escaped as literal text and never exposes private environment values', () => {
  const site = resolveSiteProfile({
    OPENPOKER_PROFILE: 'portable', OPENPOKER_SITE_NAME: 'River $& <Club>',
    OPENPOKER_SITE_ORIGIN: 'https://poker.example/', OPENPOKER_SITE_LOGO: '/brand/river.svg',
    OPENPOKER_SITE_ICON: '/brand/icon.svg', OPENPOKER_SITE_IMAGE: '/brand/social.webp',
    OPENPOKER_SUPPORT_EMAIL: 'help@poker.example', GGPOKER_ADMIN_PASSWORD: 'private-not-for-the-client',
  });
  const output = renderSiteHtml(html, site);
  assert.ok(output.includes('<title>River $&amp; &lt;Club&gt;</title>'));
  assert.ok(output.includes('src="/brand/river.svg" alt="River $&amp; &lt;Club&gt;"'));
  assert.ok(output.includes('property="og:site_name" content="River $&amp; &lt;Club&gt;"'));
  assert.ok(output.includes('property="og:image" content="https://poker.example/brand/social.webp"'));
  assert.ok(!output.includes('property="og:image:width"'), 'custom images do not inherit unverified dimensions');
  assert.ok(!JSON.stringify(site).includes('private-not-for-the-client'));
  assert.deepEqual(siteManifest(manifest, site).icons, [{ src: '/brand/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]);
  assert.deepEqual(Object.keys(siteProfileEnv(site)), SITE_ENV_KEYS);
});

test('identity configuration rejects invalid origins, unsafe assets and unsupported profiles', () => {
  for (const origin of ['javascript:alert(1)', 'https://user:pass@example.com', 'https://example.com/poker', 'https://example.com/?key=secret', 'https://example.com/#room']) {
    assert.throws(() => resolveSiteProfile({ OPENPOKER_SITE_ORIGIN: origin }), /OPENPOKER_SITE_ORIGIN/);
  }
  for (const asset of ['https://example.com/logo.svg', '//example.com/logo.svg', '/a/../logo.svg', '/a/./logo.svg', '/logo.svg?key=secret', '/logo.svg#part', '/logo.txt']) {
    assert.throws(() => resolveSiteProfile({ OPENPOKER_SITE_LOGO: asset }), /OPENPOKER_SITE_LOGO/);
  }
  assert.throws(() => resolveSiteProfile({ OPENPOKER_PROFILE: 'unknown' }), /OPENPOKER_PROFILE/);
  assert.throws(() => resolveSiteProfile({ OPENPOKER_SITE_NAME: 'a\nb' }), /OPENPOKER_SITE_NAME/);
  assert.throws(() => resolveSiteProfile({ OPENPOKER_SITE_ICON: '/animated.gif' }), /OPENPOKER_SITE_ICON/);
  assert.throws(() => resolveSiteProfile({ OPENPOKER_SUPPORT_EMAIL: 'bad@example' }), /OPENPOKER_SUPPORT_EMAIL/);
});

test('production uses the built profile and rejects every conflicting public runtime field', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpoker-profile-'));
  const builtFile = path.join(dir, 'site.json');
  const site = resolveSiteProfile({ OPENPOKER_PROFILE: 'portable', OPENPOKER_SITE_NAME: 'River Club' });
  try {
    fs.writeFileSync(builtFile, JSON.stringify(site));
    assert.deepEqual(loadSiteProfile({ env: {}, builtFile }), site);
    assert.deepEqual(loadSiteProfile({ env: siteProfileEnv(site), builtFile }), site);
    for (const [key, value] of Object.entries({
      OPENPOKER_PROFILE: 'dangg', OPENPOKER_SITE_NAME: 'Other Club', OPENPOKER_SITE_ORIGIN: 'https://other.example',
      OPENPOKER_SITE_LOGO: '/other.svg', OPENPOKER_SITE_ICON: '/other.png', OPENPOKER_SITE_IMAGE: '/other.jpg',
      OPENPOKER_SUPPORT_EMAIL: 'help@other.example',
    })) assert.throws(() => loadSiteProfile({ env: { [key]: value }, builtFile }), /differs from the built client/, key);
    assert.equal(loadSiteProfile({ env: { GGPOKER_DEV: '1' }, builtFile }).name, 'DanGG', 'source/dev mode explicitly ignores a previous build');
    fs.writeFileSync(builtFile, '{}');
    assert.throws(() => loadSiteProfile({ env: {}, builtFile }), /Built site identity has an invalid/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a fresh portable database receives local identity and no hosted offers; a restart preserves operator data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpoker-profile-db-'));
  const cleanEnv = { ...process.env };
  for (const key of SITE_ENV_KEYS) delete cleanEnv[key];
  const run = (name, body) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    const { db, getSetting, setSetting } = await import('./db.js');
    const { ensureMarketplaceSchema } = await import('./marketplace.js');
    ensureMarketplaceSchema(db);
    ${body}
    db.close();
  `], {
    cwd: import.meta.dirname,
    env: { ...cleanEnv, GGPOKER_DEV: '1', GGPOKER_DATA: dir, OPENPOKER_PROFILE: 'portable', OPENPOKER_SITE_NAME: name, GGPOKER_SEED_DEMO: '0', GGPOKER_ADMIN_PASSWORD: 'test-only-profile-password' },
    encoding: 'utf8',
  }));
  const read = `({ name: getSetting('site_name'), club: getSetting('club_name'), offers: db.prepare('SELECT COUNT(*) n FROM marketplace_products').get().n,
    market: db.prepare('SELECT title, requests_enabled FROM marketplace_settings').get(),
    banner: db.prepare("SELECT image FROM banners WHERE slot = 'slots'").get().image })`;
  try {
    const fresh = run('River Club', `process.stdout.write(JSON.stringify(${read}));
      setSetting('site_name', 'Saved Site'); setSetting('club_name', 'Saved Club');
      db.prepare("UPDATE marketplace_settings SET title = 'Saved catalog', requests_enabled = 1").run();
      db.prepare("UPDATE banners SET image = '/assets/chrome/spin.png' WHERE slot = 'slots'").run();
      db.prepare("INSERT INTO brand_assets (slot,mime,data) VALUES ('logo','image/png','saved-logo-data')").run();`);
    assert.equal(fresh.name, 'River Club');
    assert.equal(fresh.club, 'River Club');
    assert.equal(fresh.offers, 0);
    assert.equal(fresh.market.requests_enabled, 0);
    assert.match(fresh.market.title, /River Club/);
    assert.equal(fresh.banner, '/assets/slots/olympus-gold.svg');
    const saved = run('Different Profile Name', `process.stdout.write(JSON.stringify({ ...${read}, logo: db.prepare("SELECT data FROM brand_assets WHERE slot = 'logo'").get().data }));`);
    assert.equal(saved.name, 'Saved Site');
    assert.equal(saved.club, 'Saved Club');
    assert.equal(saved.market.title, 'Saved catalog');
    assert.equal(saved.market.requests_enabled, 1);
    assert.equal(saved.offers, 0);
    assert.equal(saved.logo, 'saved-logo-data');
    assert.equal(saved.banner, '/assets/slots/olympus-gold.svg', 'only the known missing legacy asset is repaired');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
