#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { bestHoldem, cardStr, compareScores, makeDeck, score5 } from '../server/poker.js';

const deck = makeDeck();
const classes = new Map();
for (let a = 0; a < deck.length - 4; a++) {
  for (let b = a + 1; b < deck.length - 3; b++) {
    for (let c = b + 1; c < deck.length - 2; c++) {
      for (let d = c + 1; d < deck.length - 1; d++) {
        for (let e = d + 1; e < deck.length; e++) {
          const cards = [deck[a], deck[b], deck[c], deck[d], deck[e]];
          const score = score5(cards);
          const key = JSON.stringify(score);
          if (!classes.has(key)) classes.set(key, { score, cards: cards.map(cardStr) });
        }
      }
    }
  }
}
const rows = [...classes.values()].sort((left, right) => compareScores(right.score, left.score)).map((entry, index) => ({ rank: index + 1, ...entry }));
if (rows.length !== 7462) throw new Error(`Expected 7462 classes, received ${rows.length}`);
for (const row of rows) {
  const cards = row.cards.map((text) => deck.find((card) => cardStr(card) === text));
  const actual = bestHoldem(cards.slice(0, 2), cards.slice(2)).score;
  if (JSON.stringify(actual) !== JSON.stringify(row.score)) throw new Error(`Representative mismatch at ${row.rank}`);
}
const output = path.resolve(import.meta.dirname, '../server/data/bet-muck-ranks.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(rows)}\n`);
console.log(`Wrote ${rows.length} classes to ${output}`);
