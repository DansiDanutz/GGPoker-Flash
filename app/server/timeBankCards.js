// Native cash-game Time Bank Cards (string_table TimeBankCardCashGamesInfo: "{0} Time Bank
// Card will be added every {1} hands. Up to {2} Time Bank Cards can be held at once.";
// TimeBankCardInfo1/2: one card grants {0} seconds, up to {0} cards per action). The numbers
// are server data the client never holds, so these values are DanGG rules.

export const TB_CARD_SECONDS = 15;
export const TB_START_CARDS = 3;
export const TB_MAX_CARDS = 5;
export const TB_REFILL_HANDS = 20;
export const TB_CARDS_PER_ACTION = 2;

/** One more hand dealt in: every TB_REFILL_HANDS hands a card is added, up to TB_MAX_CARDS. */
export function refillAfterHand({ cards, hands }) {
  const played = hands + 1;
  if (played < TB_REFILL_HANDS) return { cards, hands: played };
  return { cards: Math.min(TB_MAX_CARDS, cards + 1), hands: 0 };
}

/** Whether one more card may be spent on the current action. */
export function canSpendCard({ cards, usedThisAction }) {
  return cards > 0 && usedThisAction < TB_CARDS_PER_ACTION;
}
