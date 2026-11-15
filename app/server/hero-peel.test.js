// Your cards arrive like real ones: each lands face down, one after the other, then you lift and
// turn them over one at a time. And your turn shows a round badge counting the seconds down.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const rule = (s, selector) => {
  const at = s.indexOf(selector + ' {');
  assert.ok(at >= 0, `missing rule ${selector}`);
  return s.slice(at, s.indexOf('}', at));
};

test('your cards are drawn as two-sided cards: the face, and a back that turns away', () => {
  const page = read('src/pages/TablePage.tsx');
  assert.match(page, /const heroPeel = p\.isMe && !squeezeEnabled && c !== '\?\?';/);
  assert.match(page, /<span className="hero-peel" style=\{\{ '--i': i,/);
  assert.match(page, /<PlayingCard card="\?\?" size="mini" className="peel-back" \/>/);
});

test('each card lands face down in turn, then is lifted and turned over after the one before', () => {
  const css = read('src/table-hero-peel.css');
  const peel = rule(css, '.table-screen .seat.me .hero-peel');
  assert.match(peel, /animation: heroPitch \.45s .*\) both, heroTurn \.6s /);
  assert.match(peel, /animation-delay: calc\(var\(--i\) \* \.3s\), calc\(\.8s \+ var\(--i\) \* \.45s\);/);
  assert.match(css, /@keyframes heroTurn \{\s*0% \{ transform: perspective\(700px\) translateY\(0\) rotateX\(0\) rotateY\(180deg\); \}/);
  const back = rule(css, '.table-screen .seat.me .hero-peel .peel-back');
  assert.match(back, /transform: rotateY\(180deg\);/);
  assert.doesNotMatch(css, /backface-visibility/, 'no reliance on 3D backface hiding');
  // The back is gone exactly when the card is edge-on (65% of the turn), on the same clock.
  assert.match(back, /animation: peelBackAway \.6s linear both; animation-delay: calc\(\.8s \+ var\(--i\) \* \.45s\);/);
  assert.match(css, /@keyframes peelBackAway \{ 0%, 64\.9% \{ opacity: 1; \} 65%, 100% \{ opacity: 0; \} \}/);
  assert.match(css, /65% \{ transform: perspective\(700px\) translateY\(-8px\) rotateX\(8deg\) rotateY\(90deg\); \}/);
  assert.match(css, /\.anim-off \.seat\.me \.hero-peel,\s*\.table-screen\.cards-off \.seat\.me \.hero-peel/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('on your turn a round badge counts the seconds down inside a gold ring that fills green', () => {
  const page = read('src/pages/TablePage.tsx');
  assert.match(page, /isActor && p\.isMe && !p\.folded && clockSeconds != null && \(\s*<div className=\{'turn-badge' \+ \(clockSeconds <= 5 \? ' hot' : ''\)\} role="timer" aria-label=\{`\$\{clockSeconds\} seconds left`\}>/);
  const css = read('src/table-hero-peel.css');
  const badge = rule(css, '  .table-screen .table-stage.stage-portrait .seat.me .turn-badge');
  assert.match(badge, /conic-gradient\(var\(--used, #3ee07a\) 0 calc\(\(1 - var\(--turn, 1\)\) \* 360deg\), #e8b84a 0\)/);
  assert.match(css, /\.seat\.me \.turn-badge\.hot \{ --used: #ff4d4d;/);
  // The badge replaces the arc and the digit clock on your seat.
  assert.match(css, /\.seat\.me\.active:not\(\.folded\) \.avatar-wrap::after,\s*\.table-screen \.table-stage\.stage-portrait \.seat\.me \.native-clock \{ display: none; \}/);
  assert.match(read('src/main.tsx'), /import '\.\/table-hero-peel\.css';/);
});
