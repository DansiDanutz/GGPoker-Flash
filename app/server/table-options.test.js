// Phone "Table options" sheet: straddle, auto-post blinds, run it 1-3 times, bet presets.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runSetting, runSettingMessage, RUN_SETTINGS, autoPostBlinds, straddleSetting } from '../src/game/tableOptions.ts';
import { DEFAULT_BETS, withPreset } from '../src/lib/tablePrefs.ts';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('run setting reads the remembered choice, and "never offer" reads as once', () => {
  assert.equal(runSetting(undefined), 'ask');
  assert.equal(runSetting({ runItAsk: true, runPref: null }), 'ask');
  assert.equal(runSetting({ runItAsk: true, runPref: 2 }), 2);
  assert.equal(runSetting({ runItAsk: false, runPref: 3 }), 1);
});

test('choosing a run setting sends the remembered choice and keeps the offer on unless it is once', () => {
  assert.deepEqual(runSettingMessage('ask'), { runPref: null, runItAsk: true });
  assert.deepEqual(runSettingMessage(1), { runPref: 1, runItAsk: false });
  assert.deepEqual(runSettingMessage(3), { runPref: 3, runItAsk: true });
  assert.deepEqual(RUN_SETTINGS.map((r) => r.label), ['Ask', 'Once', 'Twice', '3 times']);
});

test('auto-post blinds is the opposite of waiting for the big blind', () => {
  assert.equal(autoPostBlinds({ waitForBlinds: false }), true);
  assert.equal(autoPostBlinds({ waitForBlinds: true }), false);
  assert.equal(autoPostBlinds(undefined), true);
});

test('the straddle switch is the player auto-straddle, usable only where the table allows straddles', () => {
  assert.deepEqual(straddleSetting({ straddle: false }, { autoStraddle: true }), { allowed: false, on: false });
  assert.deepEqual(straddleSetting({ straddle: true }, { autoStraddle: true }), { allowed: true, on: true });
  assert.deepEqual(straddleSetting({ straddle: true }, undefined), { allowed: false, on: false });
});

test('editing a bet preset returns new presets and ignores values outside the allowed choices', () => {
  const before = { opening: [...DEFAULT_BETS.opening], normal: [...DEFAULT_BETS.normal] };
  const after = withPreset(before, 'normal', 1, 66);
  assert.deepEqual(after.normal, [33, 66, 75, 100]);
  assert.deepEqual(before.normal, [33, 50, 75, 100], 'the original is not changed');
  assert.equal(withPreset(before, 'normal', 1, 42), before, 'a value not on the list is refused');
  assert.equal(withPreset(before, 'opening', 7, 3), before, 'an index past the four chips is refused');
});

test('the table has a gear that opens the options sheet', () => {
  const src = read('src/pages/TablePage.tsx');
  assert.match(src, /<TableOptionsSheet/);
  assert.match(src, /className="table-gear"/);
  const sheet = read('src/components/table/TableOptionsSheet.tsx');
  assert.match(sheet, /runSettingMessage/);
  assert.match(sheet, /role="dialog"/);
});

test('the bet confirmation can be switched on and off and is saved', async () => {
  const { withConfirmBets, DEFAULT_BETTING_OPTIONS } = await import('../src/lib/tablePrefs.ts');
  const off = withConfirmBets(DEFAULT_BETTING_OPTIONS, false);
  assert.equal(off.confirm, 'never');
  assert.equal(DEFAULT_BETTING_OPTIONS.confirm, 'always', 'the default is not changed');
  assert.equal(withConfirmBets(off, true).confirm, 'always');
  const sheet = read('src/components/table/TableOptionsSheet.tsx');
  assert.match(sheet, /label="Confirm bets"/);
  const page = read('src/pages/TablePage.tsx');
  assert.match(page, />Don't ask again</);
  assert.match(page, /localStorage\.setItem\(BETTING_OPTIONS_KEY/);
});
