// Each reaction has its own art, motion and sound when it lands on a seat.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REACTION_FX, reactionFx } from '../src/game/reactionFx.ts';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const IDS = Array.from({ length: 12 }, (_, i) => i + 1);

test('all twelve reaction stickers ship', () => {
  for (const id of IDS) {
    assert.ok(fs.existsSync(path.join(root, `public/assets/reactions/${id}.webp`)), `reaction ${id} art`);
  }
});

test('every reaction has its own animation and a short existing sound', () => {
  const sound = read('src/lib/sound.ts');
  const anims = new Set();
  for (const id of IDS) {
    const fx = reactionFx(id);
    assert.ok(fx, `reaction ${id} fx`);
    anims.add(fx.anim);
    assert.match(sound, new RegExp(`\\b${fx.sound}: '`), `sound key ${fx.sound} exists`);
    assert.ok(fx.volume > 0 && fx.volume <= 0.7, `reaction ${id} volume stays soft`);
  }
  assert.equal(anims.size, 12, 'no two reactions share a motion');
  assert.ok(Object.isFrozen(REACTION_FX));
});

test('no reaction borrows a betting or win sound that could mislead a player', () => {
  const game = new Set(['check', 'call', 'bet', 'raise', 'fold', 'allin', 'win', 'turn', 'timebank', 'winding', 'deal', 'flop']);
  for (const id of IDS) assert.ok(!game.has(reactionFx(id).sound), `reaction ${id}`);
});

test('the chat store plays the reaction its own sound', () => {
  const store = read('src/lib/useTableChat.ts');
  assert.match(store, /reactionFx\(line\.reactionId \?\? 0\)/);
  assert.doesNotMatch(store, /sound\.play\('bubble', \{ volume: \.55 \}\)/);
});

test('the seat overlay names the motion and every motion has keyframes', () => {
  const seat = read('src/components/table/SeatReaction.tsx');
  assert.match(seat, /reaction-fx-\$\{/);
  const css = read('src/table-reactions.css');
  for (const id of IDS) {
    const { anim } = reactionFx(id);
    assert.match(css, new RegExp(`\\.reaction-fx-${anim}\\b`), `${anim} class`);
  }
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(read('src/main.tsx'), /import '\.\/table-reactions\.css';/);
});
