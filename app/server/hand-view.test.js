import test from 'node:test';
import assert from 'node:assert/strict';
import { anonymizeHand, formatHandAmount, handExportLines, handExportFileName } from '../src/lib/handDetail.ts';

const money = (v) => `$${(v / 100).toFixed(2)}`;

const sampleHand = () => ({
  id: 41, handNo: 9, tableName: 'Bronze 1', game: 'holdem', board: 'Ah Kd 7c', pot: 1200,
  blinds: { sb: 50, bb: 100, ante: 0 },
  players: [
    { id: 'bot-9', nick: 'Zed', seat: 4, stack: 5000, cards: [], win: 0, position: 'BB' },
    { id: 7, nick: 'Hero', seat: 1, stack: 4000, cards: ['As', 'Ad'], win: 1200, position: 'BTN' },
    { id: 'bot-2', nick: 'Amy', seat: 2, stack: 3000, cards: ['Qc', 'Qh'], win: 0, position: 'SB' },
  ],
  actions: [
    { nick: 'Hero', action: 'raise', amount: 300, street: 'preflop' },
    { nick: 'Amy', action: 'call', amount: 300, street: 'preflop' },
    { nick: 'Zed', action: 'fold', street: 'preflop' },
  ],
  result: {
    reason: 'showdown',
    winners: [{ id: 7, nick: 'Hero', seat: 1, amount: 1200 }],
    hands: [{ seat: 1, nick: 'Hero', hand: 'Set' }, { seat: 2, nick: 'Amy', hand: 'Pair' }],
  },
});

test('amounts read in chips or in big blinds', () => {
  assert.equal(formatHandAmount(1200, 'chips', 100, money), '$12.00');
  assert.equal(formatHandAmount(1200, 'bb', 100, money), '12 BB');
  assert.equal(formatHandAmount(150, 'bb', 100, money), '1.5 BB');
  assert.equal(formatHandAmount(1234, 'bb', 100, money), '12.34 BB');
  assert.equal(formatHandAmount(500, 'bb', 0, money), '$5.00', 'no big blind recorded: fall back to chips');
});

test('anonymising renames other players by seat and never the viewer', () => {
  const hand = sampleHand();
  const anon = anonymizeHand(hand, 7);
  assert.deepEqual(anon.players.map((p) => p.nick), ['Player 2', 'Hero', 'Player 1']);
  assert.deepEqual(anon.actions.map((a) => a.nick), ['Hero', 'Player 1', 'Player 2']);
  assert.deepEqual(anon.result.winners.map((w) => w.nick), ['Hero']);
  assert.deepEqual(anon.result.hands.map((h) => h.nick), ['Hero', 'Player 1']);
  assert.equal(JSON.stringify(anon).includes('Zed'), false);
  assert.equal(JSON.stringify(anon).includes('Amy'), false);
  assert.equal(hand.players[0].nick, 'Zed', 'the stored hand is not mutated');
});

test('the export lines follow the chosen unit and names', () => {
  const lines = handExportLines(anonymizeHand(sampleHand(), 7), { unit: 'bb', viewerId: 7, money });
  const text = lines.join('\n');
  assert.match(text, /Bronze 1 · hand #9/);
  assert.match(text, /Pot: 12 BB/);
  assert.match(text, /Board: Ah Kd 7c/);
  assert.match(text, /Hero \(you\) · BTN · As Ad · stack 40 BB · won 12 BB/);
  assert.match(text, /Pre-Flop: Hero raise 3 BB, Player 1 call 3 BB, Player 2 fold/);
  assert.equal(text.includes('Amy'), false);
});

test('export file names are safe', () => {
  assert.equal(handExportFileName({ tableName: 'Bronze #1 / Fast', handNo: 9 }), 'dangg-hand-Bronze-1-Fast-9.png');
});
