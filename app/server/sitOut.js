import { groupKey, groupQueue, tableQueue } from './waitlist.js';

// Native cash sit-out (REA straddle-sitout.json). KickOutTime is server-supplied; the 2:00
// default was observed on a live $1/$2 table. TableInfo.dealMeInMin: DealMin when set,
// otherwise 2x the big blind (button/third-blind variants do not exist in DanGG).
export const SIT_OUT_KICK_MS = 120_000;

export function dealMeInMin({ bb, dealMin }) {
  return dealMin > 0 ? dealMin : 2 * bb;
}

/** Players waiting for a seat here: the table's own queue plus its lobby group queue. */
export function waitingForTable(cfg, queueSize) {
  return queueSize(tableQueue(cfg.id)) + queueSize(groupQueue(groupKey(cfg)));
}
