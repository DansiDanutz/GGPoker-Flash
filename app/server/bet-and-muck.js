import fs from 'node:fs';
import { bestHoldem } from './poker.js';
import { activeGameCheckpoint, quarantineGameCheckpoint, saveGameCheckpoint } from './game-checkpoints.js';

const rows = JSON.parse(fs.readFileSync(new URL('./bet-muck-ranks.json', import.meta.url), 'utf8'));
const ranks = new Map(rows.map((row) => [JSON.stringify(row.score), row.rank]));

export function betMuckRank(score) {
  const rank = ranks.get(JSON.stringify(score));
  if (!rank) throw new Error('Unranked five-card hand');
  return rank;
}

export function betMuckEligibility(table, playerId) {
  const player = table.seatOf(playerId)?.player;
  if (!player) return { ok: false, error: 'not seated' };
  if (table.cfg.game !== 'holdem' || !table.cfg.bet_and_muck || table.cfg.streamer_mode) return { ok: false, error: 'Bet-and-Muck is disabled' };
  if (table.street !== 'river' || table.actor !== playerId) return { ok: false, error: 'Bet-and-Muck is available only on your river action' };
  const active = table.activePlayers();
  if (active.length !== 2 || active.some((seat) => !seat.player.inHand || seat.player.folded)) return { ok: false, error: 'Bet-and-Muck requires exactly two active players' };
  const threshold = table.cfg.bet_muck_condition_rank;
  if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > 7462) return { ok: false, error: 'Bet-and-Muck rank is not configured' };
  const rank = betMuckRank(bestHoldem(player.cards, table.board).score);
  if (threshold > rank) return { ok: false, error: 'Hand is too strong for this Bet-and-Muck table', rank };
  return { ok: true, rank };
}

export function executeBetAndMuck(table, playerId, { action, amount }) {
  if (table.betAndMuck?.status === 'awaiting-response') return { ok: false, error: 'A Bet-and-Muck response is already pending' };
  const eligible = betMuckEligibility(table, playerId);
  if (!eligible.ok) return eligible;
  if (!['bet', 'raise'].includes(action) || !Number.isSafeInteger(amount) || amount <= table.currentBet || (action === 'bet') !== (table.currentBet === 0)) return { ok: false, error: 'A legal flagged bet or raise is required' };
  const opponent = table.activePlayers().find((seat) => seat.player.id !== playerId);
  const result = table.act(playerId, action, amount, { deferProgress: true });
  if (!result.ok) return result;
  table.betAndMuck = { bettorId: playerId, action, amount, status: 'awaiting-response' };
  table.actor = opponent.player.id;
  table.actionEndsAt = Date.now() + table.actionTimeMs;
  table.emit({ type: 'bet_muck', bettorId: playerId, action, amount, status: 'awaiting-response' });
  return { ok: true, rank: eligible.rank };
}

export function respondToBetAndMuck(table, playerId, action, amount = 0, opts = {}) {
  const flag = table.betAndMuck;
  if (!flag || flag.status !== 'awaiting-response' || flag.bettorId === playerId) return null;
  const opponent = table.seatOf(playerId);
  if (!opponent) return { ok: false, error: 'not seated' };
  const call = table.toCall(opponent.player);
  const isCall = action === 'call' || (action === 'allin' && call > 0 && opponent.player.stack <= call);
  table.betAndMuck = { ...flag, status: 'consumed' };
  if (isCall) {
    const result = table.act(playerId, 'call', 0, { ...opts, deferProgress: true, betMuckResponse: true });
    if (!result.ok) {
      table.betAndMuck = flag;
      return result;
    }
    const bettor = table.seatOf(flag.bettorId);
    if (bettor?.player) {
      bettor.player.folded = true;
      bettor.player.betMuckFold = true;
    }
    table.emit({ type: 'bet_muck_fold', bettorId: flag.bettorId });
    table.finishByFold(opponent);
    return { ok: true, betMuckFold: true };
  }
  if (!['fold', 'bet', 'raise', 'allin'].includes(action)) {
    table.betAndMuck = flag;
    return { ok: false, error: 'Respond with fold, call or raise' };
  }
  return table.act(playerId, action, amount, { ...opts, betMuckResponse: true });
}


export function persistBetMuckCheckpoint(db, table, transition = 'state') {
  if (!table.cfg.bet_and_muck || !table.handId) return null;
  return saveGameCheckpoint(db, {
    roomId: table.cfg.id,
    kind: 'bet-muck',
    operationId: `server:bet-muck:${table.cfg.id}:${table.betMuckRevision || 0}:${table.messageSeq}:${transition}`,
    rules: { handId: table.handId, revision: table.betMuckRevision || 0 },
    state: table.recoveryState(),
    tableVersion: table.tableVersion,
  });
}

export function restoreBetMuckCheckpoint(db, table) {
  const checkpoint = activeGameCheckpoint(db, table.cfg.id, 'bet-muck');
  if (!checkpoint) throw new Error('Active Bet-and-Muck checkpoint is missing');
  const rules = JSON.parse(checkpoint.rules_json);
  const state = JSON.parse(checkpoint.state_json);
  if (checkpoint.schema_version !== 1 || checkpoint.engine_version !== '1' || state.properties.handId !== rules.handId || (state.properties.betMuckRevision || 0) !== rules.revision || state.properties.tableVersion !== checkpoint.table_version) throw new Error('Bet-and-Muck checkpoint is incompatible');
  table.restoreRecoveryState(state);
  return checkpoint;
}

export function quarantineBetMuckCheckpoint(db, roomId, reason) {
  quarantineGameCheckpoint(db, roomId, 'bet-muck', reason);
}
