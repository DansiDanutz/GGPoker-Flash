// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(SERVER_DIR, '..');
const REPO_ROOT = path.resolve(APP_DIR, '..');

// SHA-256 digests of the legacy cropped GGPoker preset avatars removed in C5 cleanup.
const LEGACY_AVATAR_HASHES = new Set([
  '0c4f0f1ef20ef663ecf7f822b354bd829057f59440954d9d56603d094497807b',
  '76626c295e724d1c2db0341cd290477333f20c5ce8ac1df784a26350dc4bf026',
  '6af32c7a54feb64bada5e2d1479a536d0629688253eb16c1758bceafd42c400b',
  'f0cba6078d5846a880533f6748d23eb9a8df9c2257b5aeb281e9e16097047c69',
  'a36d04463f8a81363cfa41714f2e17268f101d907c890f7ad91d4bac1c730c49',
  '4c1ced8e1fe576e227064470a7dc0f4f394ccfd9dd479f7ddd08dbb9aa9a3610',
  'b01722d4e721469d5d80a2b5ecae0ff3b384390ec627863e5478b48cab97d8ad',
  '4935da603465fd8956df7a1c6562fcbbb4776941e14004cfea66ac540a185fde',
  '67c099c2a6ce96ee8a2f32efb279615181fdc6e5053606a70808833bb4018f98',
  '0b97254f00568e0215b96cb571a7ec16ed223a441d02b50cfc324cfeb3552bf3',
  'bcc199b077ab1a575671b8209040c49b5dab8cc211c99f6a87e9f8f08dc4c09e',
  'f9aed2a52ef87c342687f409c601e1e36b43927254018a11ac2d1456cede2889',
  '8bc5163cda5e03254cdef18132241d90a73dc4d02eb0f69acb2d9763c9282aea',
  '3d92d0d63417bfb26e14439919d415d319588ce21bf1126dc645785d32a0c647',
  '266e72d303f52badd09266c36f144bb92e7687f10b78b116eab15b40194af935',
  '516a9685c6709a4e673d6448d4d9f43b8f12b38bf092223a4e31ea663d1122c4',
  'e72549593a3bbf6c5a3afaaac82f1fb7153109f01745fa5836bc067fdf98e21c',
  'e76b0d593d2491168f80a83e68a8886bd260e2b212d5eac4929db5ebfef65f3e',
  '82a59c53b822561b748811e57b60ca8ebe28d8f9f34b10e50f88e7278660691e',
  '3ca1f4a712d8054a7b8b32c5df82cbeb1b6c7155cd022507365bec9770f39c84',
]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

test('reverse-engineering dossiers, extracted i18n builder and stray binaries are absent', () => {
  for (const rel of [
    'research/REVERSE_ENGINEERING.md',
    'research/brand/gg-mark.png',
    'docs/rea/bad-beat-jackpot.json',
    'docs/rea/straddle-sitout.json',
    'tools/build_i18n.py',
    'tools/person_mask',
    '.ghcache',
  ]) {
    assert.equal(fs.existsSync(path.join(REPO_ROOT, rel)), false, `${rel} must remain removed`);
  }
});

test('no third-party reference screenshots or macOS duplicate files remain tracked', () => {
  const shotFiles = walk(path.join(REPO_ROOT, 'docs', 'screenshots'));
  const refShots = shotFiles.filter((f) => path.basename(f).startsWith('reference-'));
  assert.deepEqual(refShots, [], 'no reference-* screenshots should remain');

  const appAndDocs = [...walk(path.join(REPO_ROOT, 'app', 'src')), ...walk(path.join(REPO_ROOT, 'app', 'tools')), ...walk(path.join(REPO_ROOT, 'docs'))];
  const macDupes = appAndDocs.filter((f) => / 2(\.[^.]+)?$/.test(path.basename(f)));
  assert.deepEqual(macDupes, [], 'no macOS " 2" duplicate files should remain');
});

test('all 20 preset avatars are valid original JPEGs distinct from legacy crops', () => {
  const dir = path.join(APP_DIR, 'public', 'assets', 'avatars');
  for (let i = 1; i <= 20; i += 1) {
    const file = path.join(dir, `gg-${String(i).padStart(2, '0')}.jpg`);
    assert.equal(fs.existsSync(file), true, `missing avatar ${file}`);
    const bytes = fs.readFileSync(file);
    assert.ok(bytes.length > 2000, `avatar ${file} unexpectedly small`);
    assert.equal(bytes[0], 0xff, `avatar ${file} must start with JPEG SOI`);
    assert.equal(bytes[1], 0xd8, `avatar ${file} must start with JPEG SOI`);
    assert.equal(bytes[2], 0xff, `avatar ${file} must be a valid JPEG`);
    const digest = createHash('sha256').update(bytes).digest('hex');
    assert.equal(LEGACY_AVATAR_HASHES.has(digest), false, `avatar ${file} still matches legacy cropped hash`);
  }
});

const SUPPORTED_LANGS = [
  'en', 'ro', 'de', 'fr', 'es', 'pt-br', 'ru', 'zh-cn', 'ja', 'ko',
  'tr', 'pl', 'zh-tw', 'vi', 'id', 'th', 'sv', 'et', 'lv', 'da',
  'fi', 'cs', 'nl', 'hu', 'uk-ua', 'lt', 'ar', 'bs-ba', 'bg', 'el',
];

test('i18n dictionary is original, compact, valid JSON and covers all 30 supported locales', () => {
  const file = path.join(APP_DIR, 'src', 'lib', 'i18n-dict.json');
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(Buffer.byteLength(raw, 'utf8') < 262144, 'original i18n dictionary should stay smaller than legacy extracted table');
  assert.equal(/com\.nsus|string_table|GGPoker/i.test(raw), false, 'i18n dictionary must not contain third-party client strings');
  const parsed = JSON.parse(raw);
  const keys = Object.keys(parsed);
  assert.ok(keys.length >= 300, 'i18n dictionary should cover core UI labels');
  for (const key of keys) {
    for (const lang of SUPPORTED_LANGS) {
      assert.ok(typeof parsed[key]?.[lang] === 'string' && parsed[key][lang].length > 0, `missing ${lang} translation for ${key}`);
    }
  }
  for (const key of ['Settings', 'Tournaments', 'Cashier', 'Transactions', 'Currency', 'Amount', 'Player', 'Delete']) {
    assert.ok(parsed[key]?.ro && parsed[key]?.ar && parsed[key]?.vi && parsed[key]?.['zh-tw'], `expected multi-locale translations for ${key}`);
  }
});
