function ratingState(db, players, game) {
  return players.map((player) => {
    const user = db.prepare('SELECT id,elo FROM users WHERE id = ? AND deleted_at IS NULL').get(player.id);
    if (!user) return null;
    const rating = db.prepare('SELECT elo FROM elo_ratings WHERE user_id = ? AND game = ?').get(user.id, game);
    return { player, user, before: Number(rating?.elo ?? user.elo ?? 1000) };
  }).filter(Boolean);
}

export function applyLegacyElo(db, { handId, game, players, winners }) {
  const states = ratingState(db, players, game);
  const beforeById = new Map(states.map((state) => [state.user.id, state.before]));
  for (const state of states) {
    const opponents = states.filter((other) => other.user.id !== state.user.id);
    const opponentAverage = opponents.length ? opponents.reduce((sum, other) => sum + beforeById.get(other.user.id), 0) / opponents.length : 1000;
    const won = winners.some((winner) => Number(winner.id) === Number(state.user.id));
    const expected = 1 / (1 + Math.pow(10, (opponentAverage - state.before) / 400));
    const delta = Math.max(-30, Math.min(30, Math.round(24 * ((won ? 1 : 0) - expected))));
    const next = Math.max(0, state.before + delta);
    const overall = Math.max(0, Number(state.user.elo ?? 1000) + delta);
    db.prepare('INSERT INTO elo_ratings (user_id,game,elo) VALUES (?,?,?) ON CONFLICT(user_id,game) DO UPDATE SET elo = excluded.elo').run(state.user.id, game, next);
    db.prepare('UPDATE users SET elo = ? WHERE id = ?').run(overall, state.user.id);
    db.prepare('INSERT INTO elo_history (user_id,hand_id,delta,before,after,game) VALUES (?,?,?,?,?,?)').run(state.user.id, handId || null, next - state.before, state.before, next, game);
  }
}

export function applyNumericElo(db, { handId, game, players }) {
  const states = ratingState(db, players, game);
  const beforeById = new Map(states.map((state) => [state.user.id, state.before]));
  const netById = new Map(players.map((player) => [player.id, Number(player.win || 0) + Number(player.uncalledReturn || 0) - Number(player.grossContribution ?? player.totalBet ?? 0)]));
  for (const state of states) {
    if (handId && db.prepare('SELECT id FROM elo_history WHERE user_id = ? AND hand_id = ? AND game = ?').get(state.user.id, handId, game)) continue;
    const net = netById.get(state.player.id) || 0;
    const scores = players.filter((other) => other.id !== state.player.id).map((other) => {
      const otherNet = netById.get(other.id) || 0;
      return net === otherNet ? 0.5 : net > otherNet ? 1 : 0;
    });
    const actual = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
    const opponents = states.filter((other) => other.user.id !== state.user.id);
    const opponentAverage = opponents.length ? opponents.reduce((sum, other) => sum + beforeById.get(other.user.id), 0) / opponents.length : 1000;
    const expected = 1 / (1 + Math.pow(10, (opponentAverage - state.before) / 400));
    const delta = Math.max(-30, Math.min(30, Math.round(24 * (actual - expected))));
    const next = Math.max(0, state.before + delta);
    const overall = Math.max(0, Number(state.user.elo ?? 1000) + delta);
    db.prepare('INSERT INTO elo_ratings (user_id,game,elo) VALUES (?,?,?) ON CONFLICT(user_id,game) DO UPDATE SET elo = excluded.elo').run(state.user.id, game, next);
    db.prepare('UPDATE users SET elo = ? WHERE id = ?').run(overall, state.user.id);
    db.prepare('INSERT INTO elo_history (user_id,hand_id,delta,before,after,game) VALUES (?,?,?,?,?,?)').run(state.user.id, handId || null, next - state.before, state.before, next, game);
  }
}
