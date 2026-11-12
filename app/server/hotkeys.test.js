// Grouped, conflict-free table hotkeys (ported from the Codex clone's hotkey-bindings.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOTKEY_ACTIONS, DEFAULT_HOTKEYS, comboFromEvent, parseHotkeys, assignHotkey, actionForCombo,
} from '../src/lib/hotkeys.ts';

const ev = (key, mods = {}) => ({ key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, isComposing: false, ...mods });

test('native defaults: F1-F4 and Ctrl+1..4 for the four amount presets', () => {
  assert.equal(DEFAULT_HOTKEYS.fold, 'F1');
  assert.equal(DEFAULT_HOTKEYS.check, 'F2');
  assert.equal(DEFAULT_HOTKEYS.raise, 'F3');
  assert.equal(DEFAULT_HOTKEYS.allin, 'F4');
  for (let i = 1; i <= 4; i++) assert.equal(DEFAULT_HOTKEYS[`preset${i}`], `Ctrl+${i}`);
  assert.equal(DEFAULT_HOTKEYS.timebank, '');
  const groups = new Set(HOTKEY_ACTIONS.map((a) => a.group));
  assert.deepEqual([...groups], ['Table actions', 'Bet sizing', 'Functions', 'Options']);
});

test('comboFromEvent orders modifiers and ignores bare modifiers and IME input', () => {
  assert.equal(comboFromEvent(ev('f1')), null, 'lower-case f1 is not a key name');
  assert.equal(comboFromEvent(ev('F1')), 'F1');
  assert.equal(comboFromEvent(ev('1', { ctrlKey: true })), 'Ctrl+1');
  assert.equal(comboFromEvent(ev('k', { shiftKey: true, ctrlKey: true })), 'Ctrl+Shift+K');
  assert.equal(comboFromEvent(ev(' ')), 'Space');
  assert.equal(comboFromEvent(ev('ArrowUp', { altKey: true })), 'Alt+Up');
  assert.equal(comboFromEvent(ev('Control', { ctrlKey: true })), null);
  assert.equal(comboFromEvent(ev('a', { isComposing: true })), null);
});

test('assigning a used key moves it and reports the displaced action', () => {
  const { map, displaced } = assignHotkey(DEFAULT_HOTKEYS, 'timebank', 'F1');
  assert.equal(map.timebank, 'F1');
  assert.equal(map.fold, '', 'fold is now unassigned');
  assert.equal(displaced, 'fold');
  assert.equal(DEFAULT_HOTKEYS.fold, 'F1', 'defaults are not mutated');
  const same = assignHotkey(map, 'timebank', 'F1');
  assert.equal(same.displaced, null);
  assert.equal(assignHotkey(map, 'timebank', '').map.timebank, '', 'clearing is allowed');
});

test('parseHotkeys keeps valid saved keys, migrates the old four, and drops duplicates', () => {
  assert.deepEqual(parseHotkeys(null), DEFAULT_HOTKEYS);
  assert.deepEqual(parseHotkeys('{bad'), DEFAULT_HOTKEYS);
  const old = parseHotkeys(JSON.stringify({ fold: 'Q', check: 'W', raise: 'E', allin: 'R' }));
  assert.equal(old.fold, 'Q');
  assert.equal(old.preset1, 'Ctrl+1', 'new actions take their defaults');
  const dup = parseHotkeys(JSON.stringify({ fold: 'Q', check: 'Q' }));
  assert.equal(dup.fold, 'Q');
  assert.equal(dup.check, '', 'a later duplicate is cleared, never double-bound');
  const junk = parseHotkeys(JSON.stringify({ fold: 'x'.repeat(40), nope: 'Z' }));
  assert.equal(junk.fold, 'F1');
  assert.equal('nope' in junk, false);
});

test('actionForCombo finds the bound action', () => {
  assert.equal(actionForCombo(DEFAULT_HOTKEYS, 'Ctrl+3'), 'preset3');
  assert.equal(actionForCombo(DEFAULT_HOTKEYS, 'F9'), null);
  assert.equal(actionForCombo(DEFAULT_HOTKEYS, ''), null);
});
