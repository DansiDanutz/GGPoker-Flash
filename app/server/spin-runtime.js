export function matchedSpinRegistration(db, eventId, actorId) {
  return db.prepare(`SELECT r.*,e.entrant_order FROM spin_registrations r
    JOIN spin_event_entrants e ON e.registration_id = r.registration_id
    WHERE r.event_id = ? AND r.actor_id = ? AND r.status IN ('matched','settled')`).get(eventId, actorId);
}

export function spinEvent(db, eventId) {
  return db.prepare('SELECT * FROM spin_events WHERE event_id = ?').get(eventId);
}

export function syncSpinPresentation(table, event) {
  const presentation = { ...JSON.parse(event.presentation_json), revision: event.presentation_revision ?? event.revision };
  table.spinEventId = event.event_id;
  table.spinPresentation = presentation;
  table.spinBarrierOpensAt = Number(presentation.barrierOpensAt) || 0;
  table.spinReady = new Set(Object.entries(presentation.acknowledgements || {})
    .filter(([, stages]) => Array.isArray(stages) && stages.includes('ready'))
    .map(([actorId]) => Number(actorId)));
}

export function configureSpinTable(table, event) {
  const { config, outcome, insurance } = JSON.parse(event.config_json);
  table.spinInsuranceTerms = insurance || null;
  table.spinStartingChips = outcome.startingChips || null;
  table.spinTimeBankCards = outcome.timeBankCards || null;
  table.spinSixConfig = outcome.seats === 6 ? config : null;
  table.spinTimeBankSeconds = config?.clock?.freeTimeChipSecondsPerUnit || null;
  table.spinMaxTimeBankCards = config?.clock?.maxTimeChipsPerAction || null;
  table.spinMultipliers = outcome.seats === 6 ? config.outcomes.map((row) => row.multiplier) : null;
  if (outcome.actionSeconds) table.actionTimeMs = outcome.actionSeconds * 1000;
  if (config?.clock?.actionSeconds) table.actionTimeMs = config.clock.actionSeconds * 1000;
  table.spinMultiplier = outcome.multiplier;
  table.spinPrize = outcome.prizePool;
  table.spinPayouts = Object.freeze([...outcome.prizes]);
  table.spinStartedAt = 0;
  table.spinRegistrationByUser = new Map();
  syncSpinPresentation(table, event);
}

export function seatMatchedSpinEntrant(table, user, registration) {
  const existing = table.seatOf(user.id);
  if (existing) return { ok: true, seat: existing.index };
  const sessionId = `${table.cfg.id}:${registration.registration_id}`;
  const result = table.sit({
    id: user.id,
    nick: user.nick,
    avatar: user.avatar,
    timeBankCards: table.spinTimeBankCards || registration.time_bank_cards,
  }, registration.entrant_order, table.spinStartingChips || table.cfg.min_buyin, sessionId);
  if (result.ok) table.spinRegistrationByUser?.set(Number(user.id), registration.registration_id);
  return result;
}

export function activateSpinTable(table, event, users) {
  configureSpinTable(table, event);
  table.holdStart = true;
  try {
    for (const user of users) {
      const result = seatMatchedSpinEntrant(table, user, user.registration);
      if (!result.ok) throw new Error(result.error);
      const player = table.seatOf(user.id).player;
      player.away = true;
      player.sittingOut = true;
      player.disconnected = true;
      player.disconnectedAt = Date.now();
    }
  } finally {
    table.holdStart = false;
  }
}
