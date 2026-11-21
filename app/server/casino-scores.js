export const blackjackTotal = (cards) => {
  let sum = cards.reduce((a, c) => a + (c.v === 14 ? 11 : c.v >= 10 ? 10 : c.v), 0);
  let aces = cards.filter((c) => c.v === 14).length;
  while (sum > 21 && aces > 0) { sum -= 10; aces--; }
  return sum;
};

export const baccaratTotal = (cs) => cs.reduce((a, c) => a + (c.v === 14 ? 1 : c.v >= 10 ? 0 : c.v), 0) % 10;

export function finishBaccarat(player, banker, deck) {
  const pt = baccaratTotal(player), bt = baccaratTotal(banker);
  if (pt >= 8 || bt >= 8) return;
  if (pt >= 6) {
    if (bt <= 5) banker.push(deck.pop());
    return;
  }
  player.push(deck.pop());
  const third = baccaratTotal(player.slice(-1));
  if (bt <= 2 || (bt === 3 && third !== 8) || (bt === 4 && third >= 2 && third <= 7)
    || (bt === 5 && third >= 4 && third <= 7) || (bt === 6 && third >= 6 && third <= 7)) banker.push(deck.pop());
}
