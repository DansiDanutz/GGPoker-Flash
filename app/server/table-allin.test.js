// All-in in the table's gold look: the seat label, the run-it panel and the ALL IN flash.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const css = () => read('src/table-allin.css');
const rule = (s, selector) => {
  const at = s.indexOf(selector + ' {');
  assert.ok(at >= 0, `missing rule ${selector}`);
  return s.slice(at, s.indexOf('}', at));
};

test('the all-in look loads after the table buttons, so it wins', () => {
  const main = read('src/main.tsx');
  assert.ok(main.indexOf('./table-allin.css') > main.indexOf('./table-buttons.css'));
});

test('the seat shows All-In on a gold pill with dark ink, not thin red text', () => {
  const pill = rule(css(), '.table-screen .seat .plate .st.st-allin');
  assert.match(pill, /background: linear-gradient\(#ffe07a, #f2a812\);/);
  assert.match(pill, /color: #231400;/);
  assert.match(pill, /border-radius: 999px;/);
});

test('the run-it panel is a dark panel with a gold edge, a gold title and cream choice chips', () => {
  const s = css();
  assert.match(rule(s, '.table-screen .straddle-ask'), /border: 2px solid #e8b84a;/);
  assert.match(rule(s, '.table-screen .straddle-ask-head b'), /color: #ffd36a;/);
  const chips = rule(s, '.table-screen .straddle-ask .action-row .btn');
  assert.match(chips, /background: linear-gradient\(#fbefcc, #e2c47a\);/);
  assert.match(chips, /border: 2px solid #e8b84a;/);
});

test('the ALL IN flash is a gold-rimmed plaque made from the table art, not a big gradient word', () => {
  const page = read('src/pages/TablePage.tsx');
  assert.match(page, /<div className="allin-flash" role="status" aria-label="All in">/);
  assert.match(page, /<div className="allin-plaque">/);
  assert.match(page, /className="allin-flare allin-flare-l" src="\/assets\/table\/ui\/fx-flare-left\.webp"/);
  assert.match(page, /className="allin-flare allin-flare-r" src="\/assets\/table\/ui\/fx-flare-right\.webp"/);
  assert.equal((page.match(/className="allin-line" src="\/assets\/table\/ui\/fx-divider\.webp"/g) || []).length, 2);
  assert.match(page, /<span className="allin-word">All in<\/span>/);
  const s = css();
  assert.match(rule(s, '.table-screen .allin-flash .allin-plaque'), /border: 2px solid #e8b84a;/);
  assert.match(rule(s, '.table-screen .allin-flash .allin-word'), /font-family: Georgia, 'Times New Roman', serif;/);
  assert.match(rule(s, '.table-screen .allin-flash .allin-word'), /text-transform: uppercase;/);
  assert.doesNotMatch(s, /background-clip: text|text-stroke/);
  assert.match(s, /@keyframes allinFlareL/);
  assert.match(s, /@media \(prefers-reduced-motion: reduce\)/);
});

test('particles gather into the ALL IN plaque, then burst back out as it fades', () => {
  const page = read('src/pages/TablePage.tsx');
  assert.match(page, /ALLIN_SPARKS\.map\(\(s, i\) => <i key=\{i\} className="allin-spark" style=\{\{ '--a': `\$\{s\.a\}deg`, '--r': `\$\{s\.r\}px`, '--d': `\$\{s\.d\}s` \}/);
  assert.match(read('src/game/allinFx.ts'), /export const ALLIN_SPARKS/);
  const s = css();
  assert.match(rule(s, '.table-screen .allin-flash .allin-spark'), /animation: allinSpark 1\.6s/);
  assert.match(s, /@keyframes allinSpark \{\s*0% \{ opacity: 0; transform: rotate\(var\(--a\)\) translateX\(var\(--r\)\)/);
  assert.match(s, /100% \{ opacity: 0; transform: rotate\(var\(--a\)\) translateX\(calc\(var\(--r\) \* 1\.4\)\)/);
  assert.match(s, /@keyframes allinPlaque \{\s*0% \{ opacity: 0;/);
  assert.match(s, /\.table-screen \.allin-flash \{ animation: allinGlow 1\.6s/);
});

