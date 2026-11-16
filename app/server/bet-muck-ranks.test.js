import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bestHoldem, compareScores } from './poker.js';
import { betMuckRank } from './bet-and-muck.js';

const rows = JSON.parse(fs.readFileSync(new URL('./data/bet-muck-ranks.json', import.meta.url), 'utf8'));
const C = (text) => ({ r: text[0], s: text[1], v: '23456789TJQKA'.indexOf(text[0]) + 2 });

test('all 7,462 equivalence classes are ordered and have an exact evaluator representative', () => {
  assert.equal(rows.length, 7462);
  const unique = new Set();
  for (const [index, row] of rows.entries()) {
    assert.equal(row.rank, index + 1);
    if (index) assert.ok(compareScores(rows[index - 1].score, row.score) > 0);
    const cards = row.cards.map(C);
    const actual = bestHoldem(cards.slice(0, 2), cards.slice(2)).score;
    assert.deepEqual(actual, row.score, `rank ${row.rank}`);
    assert.equal(betMuckRank(actual), row.rank);
    unique.add(JSON.stringify(row.score));
  }
  assert.equal(unique.size, 7462);
  assert.deepEqual(rows[0].score, [8, 14]);
  assert.equal(rows[0].rank, 1);
  assert.equal(rows.at(-1).rank, 7462);
});
