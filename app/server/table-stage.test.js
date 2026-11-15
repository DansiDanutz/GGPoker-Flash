// Table layout: one fixed-ratio stage (the rail) that fits the screen, with seats placed on the rail.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RAIL_RATIO, stageMode, stageBox, seatLayout, SKIN_RAIL, inward } from '../src/game/tableStage.ts';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('the rail ratio matches the measured skin rail (836 x 454)', () => {
  assert.equal(RAIL_RATIO, 836 / 454);
  assert.deepEqual(SKIN_RAIL, { left: 94, top: 132, width: 836, height: 454, size: 1024 });
});

test('stageMode: tall narrow screens get a portrait table, everything else a wide one', () => {
  assert.equal(stageMode(390, 844), 'portrait');
  assert.equal(stageMode(1440, 900), 'wide');
  assert.equal(stageMode(844, 390), 'wide');
  assert.equal(stageMode(768, 1024), 'wide');
});

const fits = (box, screen, top, bottom) => {
  assert.ok(box.left >= 0 && box.left + box.width <= screen.width, 'inside the screen horizontally');
  assert.ok(box.top > top, 'the rail starts below the top bar');
  assert.ok(box.top + box.height < screen.height - bottom, 'the rail ends above the action bar');
};

for (const [w, h] of [[1440, 900], [1920, 1080], [1280, 720], [2560, 1440]]) {
  test(`wide ${w}x${h}: the whole rail is visible, centred, with room for seats`, () => {
    const box = stageBox({ width: w, height: h, topBar: 44, actionBar: 110 });
    fits(box, { width: w, height: h }, 44, 110);
    assert.ok(Math.abs(box.width / box.height - RAIL_RATIO) < 0.01);
    assert.ok(Math.abs(box.left + box.width / 2 - w / 2) <= 1, 'centred');
    assert.ok(box.top - 44 >= 80, 'headroom for the top seat');
    assert.ok(h - 110 - (box.top + box.height) >= 80, 'room for the hero seat');
    assert.ok(box.width >= 0.5 * w || box.width >= 1300, 'uses the space');
  });
}

test('portrait phone 390x844: the rail fills the width and runs from the top bar to behind the action bar', () => {
  const box = stageBox({ width: 390, height: 844, topBar: 44, actionBar: 170 });
  assert.ok(Math.abs(box.height / box.width - RAIL_RATIO) < 0.01);
  assert.ok(box.width >= 370, 'edge to edge');
  assert.ok(box.left >= -12 && box.left + box.width <= 402, 'bleeds at most a few px');
  assert.ok(box.top >= 44 && box.top <= 60, 'starts right under the top bar');
  const bottom = box.top + box.height;
  assert.ok(bottom > 844 - 170 && bottom <= 844 - 170 * 0.5, 'runs a little behind the action bar');
});

test('landscape phone 844x390: still a wide rail inside the bars', () => {
  const box = stageBox({ width: 844, height: 390, topBar: 36, actionBar: 76 });
  fits(box, { width: 844, height: 390 }, 36, 76);
});

test('stageBox never returns a negative size on tiny screens', () => {
  const box = stageBox({ width: 200, height: 200, topBar: 44, actionBar: 170 });
  assert.ok(box.width > 0 && box.height > 0);
});

for (const mode of ['wide', 'portrait']) {
  test(`${mode} seat layouts: one spot per seat, hero bottom centre, mirrored left and right`, () => {
    for (let n = 2; n <= 9; n++) {
      const lay = seatLayout(n, mode);
      assert.equal(lay.length, n, `${n} seats`);
      assert.equal(lay[0][0], 50, 'hero is centred');
      assert.ok(lay[0][1] >= (mode === 'portrait' ? 80 : 95), 'hero sits at the bottom');
      const key = (p) => `${p[0]},${p[1]}`;
      const spots = new Set(lay.map(key));
      assert.equal(spots.size, n, 'no two seats share a spot');
      for (const [x, y] of lay) {
        assert.ok(spots.has(key([100 - x, y])), `${n}-max ${mode}: ${x},${y} has a mirror`);
        assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100);
      }
    }
  });
}

test('portrait seats stay on the felt, clear of the screen edge', () => {
  for (let n = 2; n <= 9; n++) for (const [x] of seatLayout(n, 'portrait')) assert.ok(x >= 10 && x <= 90);
});

test('heads-up puts the opponent straight across the table', () => {
  assert.deepEqual(seatLayout(2, 'wide')[1], [50, 0]);
  assert.equal(seatLayout(2, 'portrait')[1][0], 50);
});

test('the table page draws every table piece inside the stage', () => {
  const src = read('src/pages/TablePage.tsx');
  assert.match(src, /className=\{`table-stage stage-\$\{stage\.mode\}\$\{stage\.short \? ' stage-short' : ''\}`\}/);
  assert.match(src, /seatLayout\(/);
  assert.match(src, /className="table-watermark stage-mark"/, 'live brand mark: the skins carry no baked text');
  assert.doesNotMatch(src, /const POS6 =/, 'old screen-percent seat tables are gone');
  const css = read('src/table-stage.css');
  assert.match(css, /\.table-stage::before/);
  assert.match(css, /mask-image: url\('\/assets\/tables\/felt-mask\.png'\)/);
  assert.match(read('src/main.tsx'), /import '\.\/table-stage\.css';\s*$/m);
});

test('inward moves a spot toward the centre by pixels, and sideways on request', () => {
  const box = { width: 1000, height: 500 };
  assert.deepEqual(inward([50, 100], box, 100), [50, 80], 'hero: 100px up');
  assert.deepEqual(inward([50, 0], box, 50), [50, 10], 'top seat: 50px down');
  assert.deepEqual(inward([50, 100], box, 0, 40), [54, 100], 'facing up from the hero, the right is screen-right');
  const [x, y] = inward([0, 50], box, 100);
  assert.deepEqual([x, y], [10, 50]);
});

test('the phone Events page rule does not paint the hero seat (class "me") or "me" table rows', () => {
  const css = read('src/phone-shell.css');
  assert.doesNotMatch(css, /\.me, \.mc \{\s*flex: 1 1 auto; min-height: 0; overflow-y: auto/, 'the scroll-page rule must not match .seat.me or tr.me');
  assert.match(css, /div\.me:not\(\.seat\)/);
});

test('landscape phone 844x390: the rail takes most of the height between the bars', () => {
  const box = stageBox({ width: 844, height: 390, topBar: 36, actionBar: 76 });
  assert.ok(box.height >= 220, `rail height ${box.height}`);
});
