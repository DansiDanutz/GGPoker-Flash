function parse(value, fallback = null) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value;
  try { return JSON.parse(value || '') ?? fallback; } catch { return fallback; }
}

function playerFor(players, who) {
  if (typeof who === 'number') return players.find((player) => player.seat === who);
  if (who && typeof who === 'object' && who.id != null && who.id !== '') return players.find((player) => String(player.id) === String(who.id));
  const nick = who && typeof who === 'object' ? who.nick : who;
  return players.find((player) => player.nick === nick);
}

function summarize(records) {
  const stats = { hands: 0, showdowns: 0, showdownWins: 0, nonShowdownWins: 0 };
  const seen = new Set();
  for (const { row, players, result, me } of records) {
    const identity = row.hand_id || row.id;
    if (seen.has(identity)) continue;
    seen.add(identity);
    stats.hands++;
    if (result.reason === 'showdown' && !me.folded && players.filter((player) => player.inHand === true && !player.folded).length >= 2) {
      stats.showdowns++;
      if ((Number(me.win) || 0) > (Number(me.uncalledReturn) || 0)) stats.showdownWins++;
    } else if (result.reason === 'fold' && result.winners?.length === 1 && String(result.winners[0].id) === String(me.id) && (Number(me.win) || 0) > 0) {
      stats.nonShowdownWins++;
    }
  }
  return stats;
}

export function sessionStats(rows, who) {
  const records = [];
  for (const row of rows) {
    const players = parse(row.players, []);
    const me = Array.isArray(players) && playerFor(players, who);
    if (!me || me.inHand !== true || !Array.isArray(me.cards) || !me.cards.length) continue;
    const result = parse(row.result, {});
    if (!result?.reason) continue;
    records.push({ row, players, result, me });
  }
  const latest = records[0];
  if (!latest) return { known: false, sessionId: null, sessionStartedAt: null, hands: null, showdowns: null, showdownWins: null, nonShowdownWins: null };
  const sessionId = latest.me.sessionId || null;
  const sessionStartedAt = latest.me.sessionStartedAt ?? latest.me.joinedAt ?? null;
  if (!sessionId && !Number.isSafeInteger(sessionStartedAt)) return { known: false, sessionId: null, sessionStartedAt: null, hands: null, showdowns: null, showdownWins: null, nonShowdownWins: null };
  const sameSession = records.filter(({ me }) => sessionId ? me.sessionId === sessionId : (me.sessionStartedAt ?? me.joinedAt) === sessionStartedAt);
  return { known: true, sessionId, sessionStartedAt, ...summarize(sameSession) };
}
