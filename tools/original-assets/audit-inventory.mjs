#!/usr/bin/env node
// Inventory integrity and bounded local-reference check. It does not infer legal ownership.
// --refresh records new bytes as UNKNOWN; it never promotes them from filename or commit subject.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const INVENTORY = path.join(ROOT, 'tools/original-assets/inventory.json');
const LEGACY = path.join(ROOT, 'tools/original-assets/manifest.json');
const REPORT = path.join(ROOT, 'tools/original-assets/audit-report.json');
const MEDIA = /\.(?:png|jpe?g|gif|svg|webp|avif|mp3|m4a|ogg|wav|icns|ico|ttf|otf|woff2?|json)$/i;
const STATUSES = new Set(['generated', 'source-authored', 'supplied-input', 'reference-derived', 'unknown', 'documented-permission']);
const ACCEPTED = new Set(['generated', 'source-authored', 'documented-permission']);
const SCOPES = [
  ['app/public/assets', 'web'], ['app/public/pwa', 'web'], ['app/public/openpoker', 'web'],
  ['research/brand', 'desktop'], ['tools/original-assets/voice', 'generator-input'],
];
const walk = (dir) => !fs.existsSync(dir) ? [] : fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(dir, e.name);
  return e.isDirectory() ? walk(full) : e.isFile() ? [full] : [];
});
const relative = (file) => path.relative(ROOT, file).split(path.sep).join('/');
const hash = (data) => createHash('sha256').update(data).digest('hex');
const read = (file) => fs.existsSync(path.join(ROOT, file)) ? fs.readFileSync(path.join(ROOT, file), 'utf8') : '';
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, data) => fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
const currentAssets = () => SCOPES.flatMap(([dir, scope]) => walk(path.join(ROOT, dir))
  .filter((p) => MEDIA.test(p)).map((p) => {
    const bytes = fs.readFileSync(p);
    return { path: relative(p), scope, bytes: bytes.length, sha256: hash(bytes) };
  })).sort((a, b) => a.path.localeCompare(b.path, 'en'));

function runtimeReferences() {
  const refs = new Map();
  const unresolved = [];
  const historicalInputs = [];
  const sourceFiles = [
    ...walk(path.join(ROOT, 'app/src')), ...walk(path.join(ROOT, 'app/server')),
    ...walk(path.join(ROOT, 'app/config')), path.join(ROOT, 'app/index.html'),
    path.join(ROOT, 'app/public/manifest.webmanifest'),
    path.join(ROOT, 'app/public/sw.js'),
    ...walk(path.join(ROOT, 'app/public/assets/squeeze')).filter((p) => p.endsWith('.json')),
  ].filter((p) => fs.existsSync(p) && /\.(?:[cm]?js|tsx?|css|html|json|webmanifest)$/.test(p) && !/\.(?:test|spec)\./.test(p));
  const add = (url, from, method) => {
    if (!/^\/(?:assets|pwa|openpoker)\//.test(url) || url.includes('..')) return;
    const key = url.split(/[?#]/)[0];
    if (!MEDIA.test(key)) return;
    const list = refs.get(key) || [];
    if (!list.some((x) => x.file === from && x.method === method)) list.push({ file: from, method });
    refs.set(key, list);
  };
  const sourceByPath = new Map();
  for (const file of sourceFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const name = relative(file);
    sourceByPath.set(name, source);
    let expanded = source;
    // Resolve only literal local constants, never evaluate application code.
    for (const m of source.matchAll(/\bconst\s+(\w+)\s*=\s*['"](\/(?:assets|pwa|openpoker)\/[^'"\r\n]*)['"]/g)) {
      expanded = expanded.split('${' + m[1] + '}').join(m[2]);
    }
    for (const m of expanded.matchAll(/\/(?:assets|pwa|openpoker)\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|gif|svg|webp|avif|mp3|m4a|ogg|wav|ico|json)\b/g)) {
      const line = expanded.slice(expanded.lastIndexOf('\n', m.index) + 1, expanded.indexOf('\n', m.index) < 0 ? undefined : expanded.indexOf('\n', m.index));
      // A legacy database value being replaced is an input, not an asset to load.
      // Match only this explicit SQL shape; the same URL elsewhere remains checked.
      const migration = name === 'app/server/db.js' && line.match(/UPDATE banners SET image\s*=\s*'([^']+)' WHERE image\s*=\s*'([^']+)'/);
      if (migration && m[0] === migration[2]) {
        historicalInputs.push({ file: name, oldUrl: m[0], replacement: migration[1], reason: 'Exact historical value in a banner-image migration WHERE clause.' });
      } else add(m[0], name, 'literal-or-local-constant');
    }
    for (const line of expanded.split('\n')) {
      if (/\/(?:assets|pwa|openpoker)\/[^\n]*\$\{/.test(line)) unresolved.push({ file: name, expression: line.trim() });
    }
  }
  // Bounded catalog checks supplement literals for known computed filenames.
  for (const [file, prefix] of [
    ['app/src/lib/sound.ts', '/assets/sounds/'],
    ['app/src/components/CashHero.tsx', '/assets/ui/creatives/'],
    ['app/src/components/home/HomeFeed.tsx', '/assets/ui/creatives/'],
    ['app/src/pages/Promotions.tsx', '/assets/tables/'],
  ]) {
    for (const m of read(file).matchAll(/['"]([A-Za-z0-9_-]+\.(?:mp3|webp|png))['"]/g)) add(prefix + m[1], file, 'catalog-basename');
  }
  const families = [
    ['app/src/pages/TablePage.tsx', '/assets/table/clock/', Array.from({ length: 11 }, (_, n) => [`${n}.png`, `${n}-hot.png`]).flat()],
    ['app/src/pages/Ocean.tsx', '/assets/ocean/', Array.from({ length: 8 }, (_, n) => `Ocean_Rewards_Rank_${n}.png`)],
    ['app/src/components/table/ReactionPicker.tsx', '/assets/reactions/', Array.from({ length: 12 }, (_, n) => `${n + 1}.webp`)],
    ['app/src/lib/menuIcons.ts', '/assets/menu/', ['aof', 'holdem', 'plo', 'short', 'rush', 'spin', 'tournaments', 'slots', 'roulette', 'blackjack', 'crash', 'baccarat', 'dragontiger', 'sicbo'].map((n) => `${n}.webp`)],
  ];
  for (const [file, prefix, names] of families) if (sourceByPath.has(file)) for (const name of names) add(prefix + name, file, 'bounded-dynamic-catalog');
  const avatarRegistry = 'app/config/avatar-presets.js';
  const avatarCount = Number(read(avatarRegistry).match(/\bAVATAR_COUNT\s*=\s*(\d+)/)?.[1] || 0);
  if (avatarCount > 0 && avatarCount <= 1000) {
    for (let n = 1; n <= avatarCount; n += 1) add(`/assets/avatars/openpoker-${String(n).padStart(2, '0')}.svg`, avatarRegistry, 'bounded-avatar-registry');
  }
  for (const [file, source] of sourceByPath) {
    for (const m of source.matchAll(/\bemblem\s*:\s*['"]([a-z-]+)['"]/g)) add(`/assets/ui/emblems/emblem-${m[1]}.webp`, file, 'emblem-catalog');
  }
  for (const m of read('app/src/lib/menuArt.ts').matchAll(/emblem\(['"]([a-z-]+)['"]\)/g)) add(`/assets/ui/emblems/emblem-${m[1]}.webp`, 'app/src/lib/menuArt.ts', 'emblem-call');
  for (const m of read('app/server/slots.js').matchAll(/\bid:\s*['"]([a-z-]+)['"]/g)) add(`/assets/slots/${m[1]}.svg`, 'app/server/slots.js', 'slot-catalog');
  const references = [...refs].map(([url, sources]) => ({ url, sources })).sort((a, b) => a.url.localeCompare(b.url, 'en'));
  return {
    scope: 'Local literal URLs, literal constants, declared bounded catalogs, and squeeze JSON. Not a browser crawl or arbitrary template/database URL evaluation.',
    references,
    missing: references.filter(({ url }) => !fs.existsSync(path.join(ROOT, 'app/public', url.slice(1)))),
    historicalInputs,
    dynamicExpressionsRequiringReview: unresolved,
  };
}

function audit(inventory, actual) {
  const errors = [];
  const stored = new Map();
  for (const entry of inventory.assets) {
    if (stored.has(entry.path)) errors.push(`Duplicate inventory path: ${entry.path}`);
    if (!STATUSES.has(entry.status)) errors.push(`Unrecognized provenance status: ${entry.path}`);
    if (!inventory.evidence[entry.evidence]) errors.push(`Unknown evidence record: ${entry.path}`);
    stored.set(entry.path, entry);
  }
  for (const entry of actual) {
    const expected = stored.get(entry.path);
    if (!expected) errors.push(`Not inventoried: ${entry.path}`);
    else if (expected.sha256 !== entry.sha256 || expected.bytes !== entry.bytes || expected.scope !== entry.scope) errors.push(`Changed bytes/scope require review: ${entry.path}`);
    stored.delete(entry.path);
  }
  for (const p of stored.keys()) errors.push(`Inventoried asset is absent: ${p}`);
  const runtime = runtimeReferences();
  for (const { url } of runtime.missing) errors.push(`Missing local runtime asset: ${url}`);
  const files = new Set(actual.map((e) => e.path));
  const legacy = json(LEGACY);
  const legacyPaths = new Set(legacy.map((e) => `app/public/assets/${e.path}`));
  const counts = {};
  for (const { status, scope } of inventory.assets) counts[`${scope}:${status}`] = (counts[`${scope}:${status}`] || 0) + 1;
  const unresolved = inventory.assets.filter((e) => !ACCEPTED.has(e.status));
  return {
    schemaVersion: 1,
    auditBaseCommit: inventory.auditBaseCommit,
    inventorySha256: hash(fs.readFileSync(INVENTORY)),
    counts,
    integrityErrors: errors,
    releaseGate: {
      passed: errors.length === 0 && unresolved.length === 0,
      meaning: 'A provenance gate, not a legal determination. Source-linked drawings/recipes are recorded evidence, not proof of exclusive rights or visual non-infringement.',
      unresolved: unresolved.map(({ path: p, status, evidence, scope }) => ({ path: p, status, evidence, scope })),
    },
    legacyDimensionManifest: {
      entries: legacy.length,
      existing: legacy.filter((e) => files.has(`app/public/assets/${e.path}`)).length,
      missing: legacy.filter((e) => !files.has(`app/public/assets/${e.path}`)).map((e) => e.path),
      currentAssetsNotListed: actual.filter((e) => e.path.startsWith('app/public/assets/') && !legacyPaths.has(e.path)).map((e) => e.path.slice('app/public/assets/'.length)),
      note: 'Legacy manifest records replacement target dimensions/durations and historical byte counts. It is not a complete current inventory or permission record.',
    },
    runtime,
  };
}

const args = process.argv.slice(2);
if (args.some((arg) => !['--check', '--refresh', '--release', '--write-report'].includes(arg))) throw new Error('Usage: node audit-inventory.mjs [--check|--refresh] [--write-report] [--release]');
const inventory = json(INVENTORY);
const actual = currentAssets();
if (args.includes('--refresh')) {
  const old = new Map(inventory.assets.map((e) => [e.path, e]));
  inventory.assets = actual.map((e) => {
    const previous = old.get(e.path);
    old.delete(e.path);
    return previous?.sha256 === e.sha256 ? { ...previous, ...e } : {
      ...e, status: 'unknown', evidence: 'unreviewed',
      review: previous ? `Changed from SHA-256 ${previous.sha256}; previous evidence must be reassessed.` : 'New asset requires a provenance record.',
    };
  });
  if (old.size) inventory.retiredAssets = [...(inventory.retiredAssets || []), ...old.values()];
  write(INVENTORY, inventory);
}
const report = audit(inventory, actual);
if (args.includes('--write-report')) write(REPORT, report);
console.log(`Inventoried ${actual.length} assets; ${report.runtime.references.length} checked local references; ${report.integrityErrors.length} integrity/reference errors.`);
console.log(`Provenance release gate: ${report.releaseGate.passed ? 'PASS' : `BLOCKED (${report.releaseGate.unresolved.length} unresolved inputs)`}.`);
if (report.integrityErrors.length) console.error(report.integrityErrors.join('\n'));
if (report.integrityErrors.length || args.includes('--release') && !report.releaseGate.passed) process.exitCode = 1;
