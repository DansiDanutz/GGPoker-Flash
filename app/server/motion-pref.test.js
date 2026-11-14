// "Enable table & lobby animations": turning it off must stop the lobby's motion too, not only the table.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MOTION_OFF_CLASS, shouldFreezeMotion } from '../src/lib/motion.ts';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('motion freezes when the setting is off or the system asks for reduced motion', () => {
  assert.equal(shouldFreezeMotion({ enabled: true, reducedMotion: false }), false);
  assert.equal(shouldFreezeMotion({ enabled: false, reducedMotion: false }), true);
  assert.equal(shouldFreezeMotion({ enabled: true, reducedMotion: true }), true);
});

test('the app root carries the motion-off class and CSS stops animations under it', () => {
  assert.match(read('src/lib/store.tsx'), /applyMotionPref\(animations\)/);
  const css = read('src/motion.css');
  assert.match(css, new RegExp(`\\.${MOTION_OFF_CLASS} \\*`));
  assert.match(css, /animation-iteration-count: 1 !important/);
  assert.doesNotMatch(css, /transition[^-]/, 'switches keep their slide');
  assert.match(read('src/main.tsx'), /import '\.\/motion\.css';/);
});

test('the spark canvases stay still when motion is off', () => {
  assert.match(read('src/lib/sparks.ts'), /isMotionOff\(\)/);
});
