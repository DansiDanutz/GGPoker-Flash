// Art 8a–8j: the Promotions cards and the pages that reuse them show the new wordless art.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PROMO_ART } from '../src/lib/promoArt.ts';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('every promo art path points at a file that exists', () => {
  assert.ok(Object.isFrozen(PROMO_ART));
  for (const [key, url] of Object.entries(PROMO_ART)) {
    assert.ok(fs.existsSync(path.join(root, 'public', url)), key);
  }
});

test('pages that showed the old reference art now use the promo art', () => {
  const OLD = /Bg_Discover_(Fishbuffet|GGcare|Honeymoon|Leaderboard_|DailyFreebie|AoF|MysteryBattleRoyal|CasinoBonus_EN)|Bg_Discove_WeeklyFreeroll|D_Discover_OceanRewards/;
  for (const f of ['src/pages/Promotions.tsx', 'src/pages/MyPage.tsx', 'src/pages/Ocean.tsx', 'src/pages/Honeymoon.tsx', 'src/components/BattleLobby.tsx', 'src/components/mobile/MobileCasino.tsx']) {
    const src = read(f);
    assert.doesNotMatch(src, OLD, f);
    assert.match(src, /PROMO_ART/, f);
  }
});

test('the Fast Fold hero uses the new speed art', () => {
  const lobby = read('src/pages/Lobby.tsx');
  assert.doesNotMatch(lobby, /Bg_Discover_RushNCash_Holdem/);
  assert.match(lobby, /PROMO_ART\.fastfold/);
});
