import test from 'node:test';
import assert from 'node:assert/strict';
import { layout, placement, peel, revealProgress, toFrame } from '../../tools/original-assets/squeeze-geometry.mjs';

test('Holdem squeeze keeps an oblique overlapping pair and a diagonal corner reveal', () => {
  const lay = layout({ cards: 2, width: 347, minHeight: 260, cardWidth: 145, bandRatio: .4 });
  const first = placement(lay, 0, 60);
  const second = placement(lay, 1, 60);
  assert.ok(first.deg < -15 && second.deg < -15, 'Both cards lie obliquely like the phone recording');
  assert.ok(second.cx - first.cx < lay.w / 3, 'Cards remain overlapped instead of spreading side by side');
  assert.ok(peel(lay, 1).fold.d.y > .2, 'The revealed corner stays diagonal at full peel');
  for (let f = 0; f <= 60; f++) for (let i = 0; i < 2; i++) {
    const st = peel(lay, revealProgress(2, i, f));
    const map = toFrame(lay, placement(lay, i, f));
    for (const p of st.outline.map(map)) assert.ok(p.x >= 0 && p.x <= 347 && p.y >= 0 && p.y <= 260, `frame ${f} clips card ${i}`);
  }
});

test('the upper card peels first, and face glyphs belong to the lifted surface', async () => {
  const { readFile } = await import('node:fs/promises');
  const data = JSON.parse(await readFile(new URL('../public/assets/squeeze/native-squeeze-holdem.json', import.meta.url), 'utf8'));
  assert.equal(data.slots[0].transforms[30].visible, false, 'The lower rank stays hidden until the pair separates');
  assert.equal(data.slots[1].transforms[30].visible, true);
  assert.ok(data.slots[0].masks[60].occluders?.length);
  assert.equal(data.slots[1].masks[30].occluders, undefined);
  const lay = layout({ cards: 2, width: 347, minHeight: 260, cardWidth: 145, bandRatio: .4 });
  lay.band = data.glyphs[0].h * lay.w / data.glyphs[0].w;
  const st = peel(lay, 1);
  const map = toFrame(lay, placement(lay, 1, 60));
  assert.deepEqual(data.slots[1].masks[60].array, st.flap.map(map).map(p => ({x:Math.round(p.x*100)/100,y:Math.round(p.y*100)/100})), 'Ranks must be painted on the curved-up card, not a separate face beneath it');
});
