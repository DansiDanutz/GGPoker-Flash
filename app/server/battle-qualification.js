function validatePlayers(players) {
  if (!Array.isArray(players) || !players.length || players.length > 100) throw new Error('Invalid Battle contenders');
  const ids = new Set();
  for (const player of players) {
    if (!player || player.id == null || ids.has(player.id) || !Number.isSafeInteger(player.stack) || player.stack < 0 || !Number.isSafeInteger(player.entryOrder) || player.entryOrder < 0) throw new Error('Invalid Battle contender');
    ids.add(player.id);
  }
  if (!players.some((player) => player.stack > 0)) throw new Error('No surviving Battle contender');
}

export function buildShootoutGroups(contenders, tableSize) {
  validatePlayers(contenders);
  if (!Number.isInteger(tableSize) || tableSize < 2 || tableSize > 6) throw new Error('Invalid Battle table size');
  const ordered = [...contenders].sort((left, right) => right.stack - left.stack || left.entryOrder - right.entryOrder);
  if (tableSize === 2) {
    const groups = [];
    for (let index = 0; index < ordered.length; index += 2) {
      const players = ordered.slice(index, index + 2);
      groups.push({ players: players.length === 1 ? [] : players, bye: players.length === 1 ? players : [] });
    }
    return groups;
  }
  const groups = [];
  for (let index = 0; index < ordered.length; index += tableSize) groups.push({ players: ordered.slice(index, index + tableSize), bye: [] });
  if (groups.length > 1 && groups.at(-1).players.length === 1) groups.at(-1).players.unshift(groups.at(-2).players.pop());
  return groups;
}

export function buildQualificationPlan(players, { finalSeats, tableSize }) {
  validatePlayers(players);
  if (!Number.isInteger(finalSeats) || finalSeats < 2 || finalSeats > 6) throw new Error('Invalid final seat count');
  const survivors = [...players].filter((player) => player.stack > 0).sort((left, right) => right.stack - left.stack || left.entryOrder - right.entryOrder);
  if (survivors.length <= finalSeats) return { direct: survivors, groups: [], phase: 'final-ready', qualified: survivors };
  const direct = survivors.slice(0, finalSeats - 1);
  return { direct, groups: buildShootoutGroups(survivors.slice(direct.length), tableSize), phase: 'shootout', qualified: null };
}

export function evaluateShootoutRound({ direct, survivors, tableSize, round }) {
  if (!Number.isSafeInteger(round) || round < 1) throw new Error('Invalid shootout round');
  if (!Array.isArray(direct) || !Array.isArray(survivors) || !survivors.length) throw new Error('Invalid shootout state');
  if (survivors.length === 1) return { phase: 'final-ready', qualified: [...direct, ...survivors], eliminated: [] };
  if (round >= 10) {
    const [qualifier, ...eliminated] = [...survivors].sort((left, right) => left.entryOrder - right.entryOrder);
    return { phase: 'final-ready', qualified: [...direct, qualifier], eliminated };
  }
  return { phase: 'shootout', groups: buildShootoutGroups(survivors, tableSize), qualified: null, eliminated: [] };
}
