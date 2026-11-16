import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.GGPOKER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-cash-insurance-'));
const { db, addTransactionEx } = await import('./db.js');
const { PokerTable } = await import('./table.js');
const { ensureHouseBank, fundHouse, houseAccount } = await import('./house-bank.js');
const { holdemEquity } = await import('./rimt-equity.js');
const { makeDeck, cardStr } = await import('./poker.js');
const { beginCashInsurance, configureCashInsurance, decideCashInsurance, expireCashInsurance, quoteCashInsurance, restoreCashInsuranceCheckpoint, settleCashInsurance } = await import('./cash-insurance.js');
configureCashInsurance({ addTransaction: addTransactionEx });

const C = (text) => ({ r: text[0], s: text[1], v: '23456789TJQKA'.indexOf(text[0]) + 2 });
let sequence = 100;
function makeUser() {
  const id = ++sequence;
  db.prepare('INSERT INTO users (id,login,nick,password,balance) VALUES (?,?,?,?,1000000)').run(id, `insurance_${id}`, `Insured${id}`, 'x');
  return id;
}
function fixture({ strong = false, funded = true } = {}) {
  const weakId = makeUser();
  const strongId = makeUser();
  const underdogId = weakId;
  const opponentId = strongId;
  const table = new PokerTable({ id: `insurance-${underdogId}-${sequence}`, name: 'Insurance', game: 'holdem', seats: 2, sb: 50, bb: 100, min_buyin: 100, max_buyin: 2000, rakePercent: 0 });
  const player = (id, cards) => ({ id, nick: `P${id}`, avatar: '', stack: 0, isBot: false, sittingOut: false, disconnected: false, inHand: true, folded: false, allIn: true, bet: 0, totalBet: 1000, cards: cards.map(C), acted: true, reveal: false, lastAction: null, winAmount: 0, seat: id === underdogId ? 0 : 1, timeBank: 30, autoMuck: true });
  table.seats[0].player = player(underdogId, ['7c', '5s']);
  table.seats[1].player = player(opponentId, ['Ah', 'Kd']);
  table.board = ['2h', '4d', '8c'].map(C);
  table.deck = makeDeck().filter((card) => ![...table.board, ...table.seats[0].player.cards, ...table.seats[1].player.cards].map(cardStr).includes(cardStr(card)));
  for (const text of (strong ? ['5c', '7h'] : ['As', 'Ad'])) {
    const index = table.deck.findIndex((card) => cardStr(card) === text);
    table.deck.push(table.deck.splice(index, 1)[0]);
  }
  table.street = 'flop';
  table.handNo = 1;
  table.handId = `insurance-hand-${sequence}`;
  table.pot = 2000;
  table.hooks.onCashInsuranceSettlement = (room, summary) => settleCashInsurance(db, room, summary)?.body.state || null;
  if (funded) fundHouse(db, { scope: 'cash-insurance', actorId: 0, operationId: `fund-${sequence}`, amount: 1000000 });
  else {
    ensureHouseBank(db);
    db.prepare('DELETE FROM house_accounts WHERE scope = ?').run('cash-insurance');
    db.prepare('INSERT INTO house_accounts (scope,available,reserved,funded,settled_net,revision) VALUES (?,0,0,0,0,0)').run('cash-insurance');
  }
  table.runout();
  return { table, underdogId, opponentId };
}

test('exact underdog equity prices acceptance and a losing result pays coverage once', () => {
  const { table, underdogId, opponentId } = fixture();
  assert.equal(table.cashInsuranceOffer.status, 'awaiting-quote');
  const active = table.activePlayers();
  const equity = holdemEquity(active[0].player.cards.map((card) => card.r + card.s), active[1].player.cards.map((card) => card.r + card.s), table.board.map((card) => card.r + card.s));
  const probability = (equity.wins[0] + equity.ties / 2) / equity.total;
  const expectedPremium = Math.ceil(500 * probability);
  const quoted = quoteCashInsurance(db, table, { actorId: underdogId, handId: table.handId, expectedRevision: 0, ruleRevision: 1, operationId: 'quote-loss', coverage: 500 });
  assert.equal(quoted.status, 200, JSON.stringify(quoted.body));
  assert.equal(quoted.body.state.quote.premium, expectedPremium);
  const before = db.prepare('SELECT balance FROM users WHERE id = ?').get(underdogId).balance;
  const accepted = decideCashInsurance(db, table, { actorId: underdogId, handId: table.handId, quoteId: quoted.body.state.quote.quoteId, expectedRevision: 1, operationId: 'accept-loss', decision: 'accept' });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(table.cashInsuranceOffer.status, 'settled');
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = ?').get(underdogId).balance, before - expectedPremium + 500);
  assert.equal(houseAccount(db, 'cash-insurance').reserved, 0);
  assert.equal(houseAccount(db, 'cash-insurance').settled_net, expectedPremium - 500);
  assert.ok(opponentId);
});

test('a win releases the funded hold and decline or expiry leaves ordinary runout untouched', () => {
  const won = fixture({ strong: true });
  const quote = quoteCashInsurance(db, won.table, { actorId: won.underdogId, handId: won.table.handId, expectedRevision: 0, ruleRevision: 1, operationId: 'quote-win', coverage: 500 });
  const before = db.prepare('SELECT balance FROM users WHERE id = ?').get(won.underdogId).balance;
  const accepted = decideCashInsurance(db, won.table, { actorId: won.underdogId, handId: won.table.handId, quoteId: quote.body.state.quote.quoteId, expectedRevision: 1, operationId: 'accept-win', decision: 'accept' });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = ?').get(won.underdogId).balance, before - quote.body.state.quote.premium);
  assert.equal(houseAccount(db, 'cash-insurance').reserved, 0);

  const declined = fixture();
  const declineQuote = quoteCashInsurance(db, declined.table, { actorId: declined.underdogId, handId: declined.table.handId, expectedRevision: 0, ruleRevision: 1, operationId: 'quote-decline', coverage: 500 });
  const declinedResult = decideCashInsurance(db, declined.table, { actorId: declined.underdogId, handId: declined.table.handId, quoteId: declineQuote.body.state.quote.quoteId, expectedRevision: 1, operationId: 'decide-decline', decision: 'decline' });
  assert.equal(declinedResult.status, 200);
  assert.equal(declined.table.cashInsuranceOffer.status, 'declined');
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM house_reservations WHERE reservation_id LIKE 'cash-insurance:%' AND status = 'active'").get().count, 0);

  const expired = fixture();
  const expiredQuote = quoteCashInsurance(db, expired.table, { actorId: expired.underdogId, handId: expired.table.handId, expectedRevision: 0, ruleRevision: 1, operationId: 'quote-expiry', coverage: 500 });
  assert.equal(expireCashInsurance(db, expired.table, expiredQuote.body.state.quote.expiresAt), true);
  assert.equal(expired.table.cashInsuranceOffer.status, 'expired');
  assert.equal(expired.table.street, 'ended');
});

test('underfunded acceptance rolls back the premium and an accepted policy restores before settlement', () => {
  const underfunded = fixture({ funded: false });
  const quote = quoteCashInsurance(db, underfunded.table, { actorId: underfunded.underdogId, handId: underfunded.table.handId, expectedRevision: 0, ruleRevision: 1, operationId: 'quote-underfunded', coverage: 500 });
  const before = db.prepare('SELECT balance FROM users WHERE id = ?').get(underfunded.underdogId).balance;
  const result = decideCashInsurance(db, underfunded.table, { actorId: underfunded.underdogId, handId: underfunded.table.handId, quoteId: quote.body.state.quote.quoteId, expectedRevision: 1, operationId: 'accept-underfunded', decision: 'accept' });
  assert.equal(result.status, 409);
  assert.equal(db.prepare('SELECT balance FROM users WHERE id = ?').get(underfunded.underdogId).balance, before);
  assert.equal(underfunded.table.cashInsuranceOffer.status, 'open');

  const accepted = fixture();
  accepted.table.runout = () => {};
  const acceptedQuote = quoteCashInsurance(db, accepted.table, { actorId: accepted.underdogId, handId: accepted.table.handId, expectedRevision: 0, ruleRevision: 1, operationId: 'quote-restore', coverage: 500 });
  const acceptedResult = decideCashInsurance(db, accepted.table, { actorId: accepted.underdogId, handId: accepted.table.handId, quoteId: acceptedQuote.body.state.quote.quoteId, expectedRevision: 1, operationId: 'accept-restore', decision: 'accept' });
  assert.equal(acceptedResult.status, 200);
  const restored = new PokerTable(accepted.table.cfg);
  restored.hooks.onCashInsuranceSettlement = accepted.table.hooks.onCashInsuranceSettlement;
  restoreCashInsuranceCheckpoint(db, restored);
  assert.equal(restored.cashInsuranceOffer.status, 'accepted');
  restored.runout();
  assert.equal(restored.cashInsuranceOffer.status, 'settled');
  assert.equal(restored.seats[0].player.stack + restored.seats[1].player.stack, 2000);
});

test('equal equity produces no insurance offer', () => {
  const table = new PokerTable({ id: 'insurance-tie', name: 'Tie', game: 'holdem', seats: 2, sb: 50, bb: 100, min_buyin: 100, max_buyin: 2000 });
  const player = (id, cards) => ({ id, nick: `P${id}`, stack: 0, inHand: true, folded: false, allIn: true, bet: 0, totalBet: 1000, cards: cards.map(C) });
  table.seats[0].player = player(1, ['As', 'Ad']);
  table.seats[1].player = player(2, ['Ah', 'Ac']);
  table.board = ['2h', '4d', '8c'].map(C);
  table.deck = makeDeck().filter((card) => ![...table.board, ...table.seats[0].player.cards, ...table.seats[1].player.cards].map(cardStr).includes(cardStr(card)));
  table.street = 'flop';
  table.pot = 2000;
  assert.equal(beginCashInsurance(table), false);
});
