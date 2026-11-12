/**
 * Persists cash-game Time Bank Cards per account (users.time_bank_cards / time_bank_hands),
 * so leaving and rejoining does not refill a spent bank. Tournament and Jackpot SNG seats
 * keep their own in-table bank and are never loaded from or written to the account.
 */

function isCashTable(table) {
  return !!table && !table.tournament && !table.spin;
}

function storedInt(value) {
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

/** The account's saved bank for a seat at `table` (undefined fields start a fresh bank). */
export function loadTimeBank(table, user) {
  if (!isCashTable(table)) return { timeBankCards: undefined, timeBankHands: undefined };
  // An automatic move (Rush) passes the live seat's balance in camelCase; it wins.
  return {
    timeBankCards: storedInt(user.timeBankCards) ?? storedInt(user.time_bank_cards),
    timeBankHands: storedInt(user.timeBankHands) ?? storedInt(user.time_bank_hands),
  };
}

/** Writes one seated human's bank back to their account. */
export function saveTimeBank(db, table, player) {
  if (!isCashTable(table) || !player || player.isBot) return false;
  const cards = storedInt(player.timeBankCards);
  const hands = storedInt(player.timeBankHands);
  if (cards === undefined) return false;
  db.prepare('UPDATE users SET time_bank_cards = ?, time_bank_hands = ? WHERE id = ?').run(cards, hands ?? 0, player.id);
  return true;
}
