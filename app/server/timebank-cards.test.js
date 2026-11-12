import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canSpendCard, refillAfterHand, TB_CARD_SECONDS, TB_CARDS_PER_ACTION, TB_MAX_CARDS, TB_REFILL_HANDS, TB_START_CARDS,
} from './timeBankCards.js';
import { PokerTable } from './table.js';

test('a card is added every TB_REFILL_HANDS hands, capped at TB_MAX_CARDS', () => {
  let s = { cards: 1, hands: 0 };
  for (let i = 0; i < TB_REFILL_HANDS - 1; i++) s = refillAfterHand(s);
  assert.deepEqual(s, { cards: 1, hands: TB_REFILL_HANDS - 1 });
  s = refillAfterHand(s);
  assert.deepEqual(s, { cards: 2, hands: 0 });
  assert.equal(refillAfterHand({ cards: TB_MAX_CARDS, hands: TB_REFILL_HANDS - 1 }).cards, TB_MAX_CARDS);
});

test('cards can be spent while held, up to the per-action limit', () => {
  assert.equal(canSpendCard({ cards: 0, usedThisAction: 0 }), false);
  assert.equal(canSpendCard({ cards: 3, usedThisAction: TB_CARDS_PER_ACTION - 1 }), true);
  assert.equal(canSpendCard({ cards: 3, usedThisAction: TB_CARDS_PER_ACTION }), false);
});

function twoSeatTable() {
  const t = new PokerTable({ id: 'tb', name: 'TB', game: 'holdem', sb: 50, bb: 100, seats: 2, min_buyin: 1000, max_buyin: 5000 });
  t.sit({ id: 1, nick: 'A' }, 0, 2000);
  t.sit({ id: 2, nick: 'B' }, 1, 2000);
  return t;
}

test('table: a seated player starts with cards; each use spends one and adds fixed seconds', () => {
  const t = twoSeatTable();
  const a = t.seatOf(1).player;
  assert.equal(a.timeBankCards, TB_START_CARDS);
  t.actor = 1;
  t.actionEndsAt = Date.now();
  const before = t.actionEndsAt;
  const first = t.useTimeBank(1);
  assert.equal(first.ok, true);
  assert.equal(first.seconds, TB_CARD_SECONDS);
  assert.equal(t.actionEndsAt - before, TB_CARD_SECONDS * 1000);
  assert.equal(a.timeBankCards, TB_START_CARDS - 1);
  for (let i = 1; i < TB_CARDS_PER_ACTION; i++) assert.equal(t.useTimeBank(1).ok, true);
  assert.equal(t.useTimeBank(1).ok, false, 'per-action limit');
});

test('table: dealt-in players earn a card every TB_REFILL_HANDS hands', () => {
  const t = twoSeatTable();
  const a = t.seatOf(1).player;
  a.timeBankCards = 0;
  a.timeBankHands = TB_REFILL_HANDS - 1;
  a.inHand = true;
  t.refillTimeBanks();
  assert.equal(a.timeBankCards, 1);
  assert.equal(a.timeBankHands, 0);
});

test('the client copy of the Time Bank Card rules matches the server', async () => {
  const client = await import('../src/game/timeBankRules.ts');
  const server = await import('./timeBankCards.js');
  for (const k of ['TB_CARD_SECONDS', 'TB_START_CARDS', 'TB_MAX_CARDS', 'TB_REFILL_HANDS', 'TB_CARDS_PER_ACTION']) {
    assert.equal(client[k], server[k], k);
  }
});
