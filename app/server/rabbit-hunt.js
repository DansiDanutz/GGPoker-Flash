const GAMES = new Set(['holdem', 'omaha', 'omaha5', 'omaha6']);
const CARD = /^[23456789TJQKA][cdhs]$/;

export function rabbitRunout({ game, street, board, deck, boards = null }) {
  if (!GAMES.has(game) || street !== 'ended') return null;
  if (!Array.isArray(board) || ![0, 3, 4].includes(board.length)) return null;
  if ((Array.isArray(boards) && boards.length > 1) || !Array.isArray(deck)) return null;
  const missing = 5 - board.length;
  if (deck.length < missing) return null;
  const cards = [...board, ...deck];
  if (cards.some((card) => typeof card !== 'string' || !CARD.test(card))) return null;
  if (new Set(cards).size !== cards.length) return null;
  return deck.slice(-missing).reverse();
}

export function rabbitEligible(table, viewerId, players) {
  return rabbitRunout(table) !== null && players.some((player) => player && player.inHand && String(player.id) === String(viewerId));
}
