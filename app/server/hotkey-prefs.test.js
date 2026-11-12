// Hotkey master switch, per-group switches and the show-one-card actions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HOTKEYS, DEFAULT_HOTKEY_GROUPS, HOTKEY_GROUPS, assignHotkey, groupOf,
  parseHotkeyGroups, parseHotkeyPrefs, resolveHotkey, showCardIndices,
} from '../src/lib/hotkeys.ts';

const allOn = parseHotkeyPrefs(null, null);

test('prefs default to enabled with every group on', () => {
  assert.equal(allOn.enabled, true);
  for (const g of HOTKEY_GROUPS) assert.equal(allOn.groups[g], true);
  assert.equal(parseHotkeyPrefs('1', null).enabled, true);
  assert.equal(parseHotkeyPrefs('0', null).enabled, false);
});

test('parseHotkeyGroups keeps saved booleans and ignores junk', () => {
  assert.deepEqual(parseHotkeyGroups('{bad'), DEFAULT_HOTKEY_GROUPS);
  assert.deepEqual(parseHotkeyGroups('[1,2]'), DEFAULT_HOTKEY_GROUPS);
  const g = parseHotkeyGroups(JSON.stringify({ 'Bet sizing': false, Functions: 'no', Nope: false }));
  assert.equal(g['Bet sizing'], false);
  assert.equal(g.Functions, true, 'a non-boolean keeps the default');
  assert.equal('Nope' in g, false);
});

test('presets live in their own Bet sizing group', () => {
  for (let i = 1; i <= 4; i++) assert.equal(groupOf(`preset${i}`), 'Bet sizing');
  assert.equal(groupOf('fold'), 'Table actions');
  assert.equal(groupOf('showLeft'), 'Options');
});

test('resolveHotkey returns the bound action when everything is on', () => {
  assert.equal(resolveHotkey(DEFAULT_HOTKEYS, allOn, 'F1'), 'fold');
  assert.equal(resolveHotkey(DEFAULT_HOTKEYS, allOn, 'Ctrl+2'), 'preset2');
  assert.equal(resolveHotkey(DEFAULT_HOTKEYS, allOn, 'F9'), null);
  assert.equal(resolveHotkey(DEFAULT_HOTKEYS, allOn, null), null);
});

test('the master switch blocks every hotkey', () => {
  const off = parseHotkeyPrefs('0', null);
  assert.equal(resolveHotkey(DEFAULT_HOTKEYS, off, 'F1'), null);
  assert.equal(resolveHotkey(DEFAULT_HOTKEYS, off, 'Ctrl+1'), null);
});

test('a group switch blocks only that group', () => {
  const noSizing = parseHotkeyPrefs('1', JSON.stringify({ 'Bet sizing': false }));
  assert.equal(resolveHotkey(DEFAULT_HOTKEYS, noSizing, 'Ctrl+1'), null);
  assert.equal(resolveHotkey(DEFAULT_HOTKEYS, noSizing, 'F1'), 'fold');
  const { map } = assignHotkey(DEFAULT_HOTKEYS, 'showLeft', 'L');
  const noOptions = parseHotkeyPrefs('1', JSON.stringify({ Options: false }));
  assert.equal(resolveHotkey(map, allOn, 'L'), 'showLeft');
  assert.equal(resolveHotkey(map, noOptions, 'L'), null);
});

test('show-one-card hotkeys default to unassigned and pick the edge cards', () => {
  assert.equal(DEFAULT_HOTKEYS.showLeft, '');
  assert.equal(DEFAULT_HOTKEYS.showRight, '');
  assert.deepEqual(showCardIndices('showLeft', 2), [0]);
  assert.deepEqual(showCardIndices('showRight', 2), [1]);
  assert.deepEqual(showCardIndices('showRight', 4), [3], 'Omaha: the rightmost of four');
  assert.deepEqual(showCardIndices('showLeft', 0), []);
});
