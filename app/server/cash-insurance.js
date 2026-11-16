import { randomUUID } from 'node:crypto';
import { withGameReceipt } from './game-receipts.js';
import { activeGameCheckpoint, quarantineGameCheckpoint, saveGameCheckpoint } from './game-checkpoints.js';
import { consumeHouseReservation, creditHouse, releaseHouse, reserveHouse, requireHouseResult } from './house-bank.js';
import { holdemEquity } from './rimt-equity.js';

function transaction(db, callback) {
  if (db.isTransaction) return callback();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

let addTransactionEx;

export function configureCashInsurance({ addTransaction }) {
  addTransactionEx = addTransaction;
}

function commandError(message, status = 409) {
  return Object.assign(new Error(message), { status });
}

export function ensureCashInsuranceRules(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS cash_insurance_rules (
    id INTEGER PRIMARY KEY CHECK(id=1),
    insurance_fee_basis_points INTEGER NOT NULL CHECK(insurance_fee_basis_points BETWEEN 0 AND 10000),
    revision INTEGER NOT NULL CHECK(revision>0),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.prepare('INSERT OR IGNORE INTO cash_insurance_rules (id,insurance_fee_basis_points,revision) VALUES (1,0,1)').run();
  return db.prepare('SELECT * FROM cash_insurance_rules WHERE id = 1').get();
}

export function saveCashInsuranceRules(db, { actorId, insuranceFeeBasisPoints, expectedRevision, operationId }) {
  if (!Number.isSafeInteger(insuranceFeeBasisPoints) || insuranceFeeBasisPoints < 0 || insuranceFeeBasisPoints > 10000 || !Number.isSafeInteger(expectedRevision) || typeof operationId !== 'string' || !operationId.trim()) throw commandError('Invalid cash-insurance rule command', 400);
  const current = ensureCashInsuranceRules(db);
  return withGameReceipt(db, { actorId, operationId, scope: 'cash-insurance-rules', request: { insuranceFeeBasisPoints, expectedRevision } }, () => {
    if (current.revision !== expectedRevision) throw commandError('Cash-insurance rules revision changed');
    const revision = expectedRevision + 1;
    db.prepare('UPDATE cash_insurance_rules SET insurance_fee_basis_points = ?, revision = ?, updated_at = datetime(\'now\') WHERE id = 1').run(insuranceFeeBasisPoints, revision);
    return { revision, state: { insuranceFeeBasisPoints, ruleRevision: revision } };
  });
}

function probabilities(table) {
  const active = table.activePlayers();
  const equity = holdemEquity(active[0].player.cards.map((card) => card.r + card.s), active[1].player.cards.map((card) => card.r + card.s), table.board.map((card) => card.r + card.s));
  return active.map((seat, index) => (equity.wins[index] + equity.ties / 2) / equity.total);
}

export function beginCashInsurance(table) {
  if (table.cashInsuranceOffer || table.rimt || table.runItTwice || table.cfg.rimt_mode === 'negotiated' || table.cfg.game !== 'holdem' || table.tournament || table.spin || table.rush || table.aof || table.board.length >= 5) return false;
  const active = table.activePlayers();
  if (active.length !== 2 || !active.some((seat) => seat.player.allIn)) return false;
  const chances = probabilities(table);
  if (chances[0] === chances[1]) return false;
  const underdog = active[chances[0] < chances[1] ? 0 : 1].player;
  if (underdog.isBot) return false;
  table.cashInsuranceOffer = { handId: table.handId, revision: 0, stage: 'quote', underdogId: underdog.id, coverageMax: underdog.stack + underdog.totalBet, status: 'awaiting-quote' };
  table.actor = null;
  table.emit({ type: 'cash_insurance_available', underdogId: underdog.id });
  return true;
}

export function quoteCashInsurance(db, table, { actorId, handId, expectedRevision, ruleRevision, operationId, coverage }) {
  return withGameReceipt(db, { actorId, operationId, scope: `cash-insurance:${table.cfg.id}:${handId}:quote`, request: { handId, expectedRevision, ruleRevision, coverage } }, () => {
    const offer = table.cashInsuranceOffer;
    if (!offer || offer.underdogId !== actorId || offer.status !== 'awaiting-quote' || table.handId !== handId || (table.cashInsuranceRevision || 0) !== expectedRevision) throw commandError('Cash-insurance quote is unavailable');
    const rules = ensureCashInsuranceRules(db);
    if (rules.revision !== ruleRevision) throw commandError('Cash-insurance rules changed');
    const player = table.seatOf(actorId).player;
    const maximum = player.stack + player.totalBet;
    if (!Number.isSafeInteger(coverage) || coverage < 1 || coverage > maximum || coverage > 1000000000) throw commandError('Coverage exceeds the insured amount', 400);
    const active = table.activePlayers();
    const chances = probabilities(table);
    const underdogIndex = active.findIndex((seat) => seat.player.id === actorId);
    const winProbability = chances[underdogIndex];
    const basePremium = Math.ceil(coverage * winProbability);
    const premium = basePremium + Math.ceil(basePremium * rules.insurance_fee_basis_points / 10000);
    if (!Number.isSafeInteger(premium) || premium > 1000000000) throw commandError('Insurance premium exceeds the limit', 400);
    const quote = {
      quoteId: randomUUID(), handId, coverage, premium, payout: coverage,
      winProbabilityNumerator: Math.round(winProbability * 1000000), winProbabilityDenominator: 1000000,
      expiresAt: Date.now() + 10000, ruleRevision, revision: expectedRevision + 1, status: 'open',
    };
    table.cashInsuranceOffer = { ...offer, ...quote };
    table.cashInsuranceRevision = quote.revision;
    persistCashInsuranceCheckpoint(db, table, 'quote');
    return { revision: quote.revision, state: { quote } };
  });
}

function continueRunout(table) {
  table.actor = null;
  table.runout();
}

export function decideCashInsurance(db, table, { actorId, handId, quoteId, expectedRevision, operationId, decision }) {
  return withGameReceipt(db, { actorId, operationId, scope: `cash-insurance:${table.cfg.id}:${handId}:decision`, request: { handId, quoteId, expectedRevision, decision } }, () => transaction(db, () => {
    const offer = table.cashInsuranceOffer;
    if (!offer || offer.quoteId !== quoteId || offer.underdogId !== actorId || offer.status !== 'open' || table.handId !== handId || (table.cashInsuranceRevision || 0) !== expectedRevision || !['accept', 'decline'].includes(decision)) throw commandError('Cash-insurance decision is unavailable');
    if (Date.now() >= offer.expiresAt) {
      table.cashInsuranceOffer = { ...offer, status: 'expired' };
      continueRunout(table);
      throw commandError('Cash-insurance quote expired');
    }
    const revision = expectedRevision + 1;
    if (decision === 'accept') {
      addTransactionEx(actorId, 'cash_insurance_premium', -offer.premium, 'Cash all-in insurance premium', 'USD', { reference: `cash-insurance:premium:${quoteId}`, joinTransaction: true, database: db });
      requireHouseResult(reserveHouse(db, { scope: 'cash-insurance', actorId, operationId, reservationId: `cash-insurance:${quoteId}`, amount: offer.payout }));
      requireHouseResult(creditHouse(db, { scope: 'cash-insurance', actorId, operationId, amount: offer.premium, entityId: quoteId }));
      table.cashInsuranceOffer = { ...offer, status: 'accepted', policy: { quoteId, accountId: actorId, coverage: offer.coverage, premium: offer.premium, payout: offer.payout, status: 'active', receiptId: operationId } };
    } else {
      table.cashInsuranceOffer = { ...offer, status: 'declined' };
    }
    table.cashInsuranceRevision = revision;
    persistCashInsuranceCheckpoint(db, table, decision);
    continueRunout(table);
    return { revision, state: { quote: table.cashInsuranceOffer } };
  }));
}

export function expireCashInsurance(db, table, now = Date.now()) {
  const offer = table.cashInsuranceOffer;
  if (!offer || offer.status !== 'open' || now < offer.expiresAt) return false;
  table.cashInsuranceOffer = { ...offer, status: 'expired' };
  persistCashInsuranceCheckpoint(db, table, 'expire');
  continueRunout(table);
  return true;
}

export function settleCashInsurance(db, table, summary) {
  const offer = table.cashInsuranceOffer;
  if (!offer || offer.status !== 'accepted') return null;
  const insuredWon = (summary.winners || []).some((winner) => winner.id === offer.underdogId && winner.amount > 0);
  const operationId = `cash-insurance-settlement:${table.handId}:${offer.quoteId}`;
  return withGameReceipt(db, { actorId: offer.underdogId, operationId, scope: `cash-insurance:${table.cfg.id}:${table.handId}:settlement`, request: { handId: table.handId, quoteId: offer.quoteId, insuredWon } }, () => transaction(db, () => {
    const reservation = { scope: 'cash-insurance', actorId: offer.underdogId, operationId, reservationId: `cash-insurance:${offer.quoteId}` };
    if (insuredWon) {
      requireHouseResult(releaseHouse(db, reservation));
    } else {
      requireHouseResult(consumeHouseReservation(db, { ...reservation, amount: offer.payout }));
      const credit = addTransactionEx(offer.underdogId, 'cash_insurance_payout', offer.payout, 'Cash all-in insurance payout', 'USD', { reference: `cash-insurance:payout:${offer.quoteId}`, joinTransaction: true, database: db, onDuplicate: 'skip' });
      if (!credit.applied) throw commandError('Cash-insurance payout was already recorded');
    }
    table.cashInsuranceOffer = { ...offer, status: 'settled', insuredWon, policy: { ...offer.policy, status: 'settled' } };
    table.cashInsuranceRevision = (table.cashInsuranceRevision || 0) + 1;
    persistCashInsuranceCheckpoint(db, table, insuredWon ? 'release' : 'payout');
    return { revision: table.cashInsuranceRevision, state: { quote: table.cashInsuranceOffer, insuredWon } };
  }));
}

export function persistCashInsuranceCheckpoint(db, table, transition = 'state') {
  if (!table.cashInsuranceOffer || !table.handId) return null;
  return saveGameCheckpoint(db, {
    roomId: table.cfg.id,
    kind: 'cash-insurance',
    operationId: `server:cash-insurance:${table.cfg.id}:${table.cashInsuranceRevision || 0}:${table.messageSeq}:${transition}`,
    rules: { handId: table.handId, revision: table.cashInsuranceRevision || 0, offer: table.cashInsuranceOffer },
    state: table.recoveryState(),
    tableVersion: table.tableVersion,
  });
}

export function restoreCashInsuranceCheckpoint(db, table) {
  const checkpoint = activeGameCheckpoint(db, table.cfg.id, 'cash-insurance');
  if (!checkpoint) throw new Error('Active cash-insurance checkpoint is missing');
  const rules = JSON.parse(checkpoint.rules_json);
  const state = JSON.parse(checkpoint.state_json);
  if (checkpoint.schema_version !== 1 || checkpoint.engine_version !== '1' || state.properties.handId !== rules.handId || (state.properties.cashInsuranceRevision || 0) !== rules.revision || state.properties.tableVersion !== checkpoint.table_version || JSON.stringify(state.properties.cashInsuranceOffer) !== JSON.stringify(rules.offer)) throw new Error('Cash-insurance checkpoint is incompatible');
  table.restoreRecoveryState(state);
  return checkpoint;
}

export function quarantineCashInsuranceCheckpoint(db, roomId, reason) {
  quarantineGameCheckpoint(db, roomId, 'cash-insurance', reason);
}
