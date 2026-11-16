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

function raise(action) { return ['bet', 'raise', 'allin', 'all-in'].includes(String(action.action).toLowerCase()); }
function streetIndex(street) { return ['preflop', 'flop', 'turn', 'river'].indexOf(street); }

function empty() {
  return Object.fromEntries(['flop', 'turn'].flatMap((street) => ['Opportunities', 'Bets', 'Responses', 'Folds', 'Calls', 'Raises'].map((key) => [`${street}Cb${key}`, 0])));
}

export function continuationStats(hand, who) {
  const players = parse(hand?.players, []);
  const actions = parse(hand?.actions, []);
  const result = parse(hand?.result, {});
  const me = Array.isArray(players) && playerFor(players, who);
  if (!me || hand?.game === 'aof' || !result?.reason || !Array.isArray(actions) || !actions.length) return null;
  if (actions.some((action, index) => !action || !Number.isInteger(action.seat) || action.seat < 0 || typeof action.canRaise !== 'boolean' || streetIndex(action.street) < 0 || (index && streetIndex(action.street) < streetIndex(actions[index - 1].street)))) return null;
  const stats = empty();
  for (const [previous, current, prefix] of [['preflop', 'flop', 'flop'], ['flop', 'turn', 'turn']]) {
    const aggressor = actions.findLast((action) => action.street === previous && raise(action))?.seat;
    if (aggressor === undefined) continue;
    let opened = false;
    let decided = false;
    let continuation = false;
    const responded = new Set();
    for (const action of actions.filter((entry) => entry.street === current)) {
      if (action.seat === aggressor && !decided) {
        decided = true;
        if (!opened && action.canRaise) {
          if (me.seat === aggressor) {
            stats[`${prefix}CbOpportunities`]++;
            if (raise(action)) stats[`${prefix}CbBets`]++;
          }
          continuation = raise(action);
        }
      } else if (continuation && action.seat !== aggressor && !responded.has(action.seat) && ['fold', 'call', 'raise', 'allin', 'all-in'].includes(action.action)) {
        responded.add(action.seat);
        if (action.seat === me.seat) {
          stats[`${prefix}CbResponses`]++;
          const key = action.action === 'fold' ? 'Folds' : action.action === 'call' ? 'Calls' : 'Raises';
          stats[`${prefix}Cb${key}`]++;
        }
        if (raise(action)) continuation = false;
      }
      if (raise(action)) opened = true;
    }
  }
  return stats;
}

export function continuationHud(rows, who) {
  const total = empty();
  for (const row of rows) {
    const stats = continuationStats(row, who);
    if (!stats) continue;
    for (const key of Object.keys(total)) total[key] += stats[key];
  }
  return total;
}
