// Settings draft (Apply/OK vs Cancel/Escape) and the server settings merge on login.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_DRAFT, draftReducer, draftValue, isDirty, pendingWrites } from '../src/lib/settingsDraft.ts';
import { buildSettingsPayload, mergeServerSettings, parseServerSettings, SYNCED_SETTING_KEYS } from '../src/lib/settingsSync.ts';

const store = (entries) => (key) => (key in entries ? entries[key] : null);

test('staging builds a new draft without touching the old state', () => {
  const s1 = draftReducer(EMPTY_DRAFT, { type: 'stage', key: 'ggpoker.theme', value: 'Red' });
  const s2 = draftReducer(s1, { type: 'stage', key: 'ggpoker.theme', value: 'Navy' });
  assert.deepEqual(EMPTY_DRAFT.draft, {});
  assert.deepEqual(s1.draft, { 'ggpoker.theme': 'Red' });
  assert.deepEqual(s2.draft, { 'ggpoker.theme': 'Navy' }, 'the last edit of a key wins');
});

test('cancel discards the draft; apply clears it and counts the apply', () => {
  const staged = draftReducer(EMPTY_DRAFT, { type: 'stage', key: 'ggpoker.volume', value: '20' });
  const cancelled = draftReducer(staged, { type: 'cancel' });
  assert.deepEqual(cancelled.draft, {});
  assert.equal(cancelled.appliedCount, 0);
  const applied = draftReducer(staged, { type: 'apply' });
  assert.deepEqual(applied.draft, {});
  assert.equal(applied.appliedCount, 1);
});

test('pendingWrites skips edits that match the saved value', () => {
  const saved = store({ 'ggpoker.theme': 'Green', 'ggpoker.volume': '70' });
  const draft = { 'ggpoker.theme': 'Green', 'ggpoker.volume': '40', 'ggpoker.hotkeysMap': null };
  assert.deepEqual(pendingWrites(draft, saved), { 'ggpoker.volume': '40' });
  assert.equal(isDirty({ 'ggpoker.theme': 'Green' }, saved), false);
  assert.equal(isDirty(draft, saved), true);
  assert.equal(isDirty({ 'ggpoker.theme': null }, saved), true, 'removing a saved key is a change');
});

test('draftValue prefers the staged value, including a staged removal', () => {
  const saved = store({ 'ggpoker.theme': 'Green' });
  assert.equal(draftValue({}, 'ggpoker.theme', saved), 'Green');
  assert.equal(draftValue({ 'ggpoker.theme': 'Red' }, 'ggpoker.theme', saved), 'Red');
  assert.equal(draftValue({ 'ggpoker.theme': null }, 'ggpoker.theme', saved), null);
});

test('payload carries every synced key and the stamp', () => {
  const p = buildSettingsPayload(store({ 'ggpoker.theme': 'Red' }), 1234);
  assert.equal(p.updatedAt, 1234);
  assert.equal(p.values['ggpoker.theme'], 'Red');
  assert.equal(Object.keys(p.values).length, SYNCED_SETTING_KEYS.length);
  assert.deepEqual(parseServerSettings(JSON.parse(JSON.stringify(p))).values, p.values, 'round-trips');
});

test('parseServerSettings drops unknown keys, bad values and handles legacy blobs', () => {
  const p = parseServerSettings({ version: 2, updatedAt: 9, values: { 'ggpoker.theme': 'Red', 'ggpoker.token': 'x', 'ggpoker.volume': 5 } });
  assert.deepEqual(p.values, { 'ggpoker.theme': 'Red' });
  assert.equal(p.updatedAt, 9);
  const legacy = parseServerSettings({ theme: 'Navy', volume: '30', lang: null, junk: 'x' });
  assert.equal(legacy.updatedAt, 0);
  assert.deepEqual(legacy.values, { 'ggpoker.theme': 'Navy', 'ggpoker.volume': '30' });
  assert.deepEqual(parseServerSettings(null).values, {});
  assert.deepEqual(parseServerSettings([1]).values, {});
});

test('a newer server copy wins key by key', () => {
  const server = parseServerSettings({ version: 2, updatedAt: 200, values: { 'ggpoker.theme': 'Red', 'ggpoker.volume': '70', 'ggpoker.stackMode': null } });
  const local = { updatedAt: 100, read: store({ 'ggpoker.theme': 'Green', 'ggpoker.volume': '70', 'ggpoker.stackMode': 'bb' }) };
  const { writes, updatedAt } = mergeServerSettings(server, local);
  assert.deepEqual(writes, { 'ggpoker.theme': 'Red', 'ggpoker.stackMode': null });
  assert.equal(updatedAt, 200);
});

test('an older or unstamped server copy only fills keys never set locally', () => {
  const server = parseServerSettings({ theme: 'Red', dealSpeed: '5' });
  const local = { updatedAt: 0, read: store({ 'ggpoker.theme': 'Green' }) };
  const { writes, updatedAt } = mergeServerSettings(server, local);
  assert.deepEqual(writes, { 'ggpoker.dealSpeed': '5' });
  assert.equal(updatedAt, 0);
  const older = parseServerSettings({ version: 2, updatedAt: 50, values: { 'ggpoker.theme': 'Red' } });
  assert.deepEqual(mergeServerSettings(older, { updatedAt: 100, read: store({ 'ggpoker.theme': 'Green' }) }).writes, {});
});
