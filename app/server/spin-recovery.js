import { activeGameCheckpoint, quarantineGameCheckpoint, saveGameCheckpoint, terminalGameCheckpoint } from './game-checkpoints.js';

export function persistSpinCheckpoint(db, table, transition = 'state') {
  if (!table.spinEventId) return null;
  const event = db.prepare('SELECT * FROM spin_events WHERE event_id = ?').get(table.spinEventId);
  if (!event) throw new Error('Spin checkpoint event is missing');
  if (['finished', 'cancelled'].includes(event.status)) {
    terminalGameCheckpoint(db, table.cfg.id, 'spin');
    return { revision: 0, terminal: true };
  }
  return saveGameCheckpoint(db, {
    roomId: table.cfg.id,
    kind: 'spin',
    operationId: `server:spin:${event.event_id}:${event.revision}:${event.presentation_revision ?? event.revision}:${table.messageSeq}:${transition}`,
    rules: { eventId: event.event_id, config: JSON.parse(event.config_json) },
    state: table.recoveryState(),
    tableVersion: table.tableVersion,
  });
}

export function restoreSpinCheckpoint(db, table, event) {
  const checkpoint = activeGameCheckpoint(db, table.cfg.id, 'spin');
  if (!checkpoint) throw new Error('Active Spin checkpoint is missing');
  if (checkpoint.schema_version !== 1 || checkpoint.engine_version !== '1') throw new Error('Unsupported Spin checkpoint version');
  const rules = JSON.parse(checkpoint.rules_json);
  if (rules.eventId !== event.event_id || JSON.stringify(rules.config) !== event.config_json) throw new Error('Spin checkpoint rules changed');
  const state = JSON.parse(checkpoint.state_json);
  const { outcome } = JSON.parse(event.config_json);
  const { config } = JSON.parse(event.config_json);
  if (state.properties.spinEventId !== event.event_id || state.properties.spinMultiplier !== outcome.multiplier || state.properties.spinPrize !== outcome.prizePool || JSON.stringify(state.properties.spinPayouts) !== JSON.stringify(outcome.prizes)
    || JSON.stringify(state.properties.spinSixConfig || null) !== JSON.stringify(outcome.seats === 6 ? config : null)) {
    throw new Error('Spin checkpoint outcome changed');
  }
  if (state.properties.spinPresentation?.revision !== (event.presentation_revision ?? event.revision) || state.properties.tableVersion !== checkpoint.table_version) throw new Error('Spin checkpoint is stale');
  table.restoreRecoveryState(state);
  const entrants = db.prepare(`SELECT r.actor_id,r.registration_id,r.status,e.entrant_order FROM spin_registrations r
    JOIN spin_event_entrants e ON e.registration_id = r.registration_id WHERE e.event_id = ?`).all(event.event_id);
  for (const entrant of entrants) {
    const player = table.seatOf(entrant.actor_id)?.player;
    if (entrant.status === 'settled' && !player) continue;
    if (!player || player.seat !== entrant.entrant_order || player.sessionId !== `${table.cfg.id}:${entrant.registration_id}`) throw new Error('Spin checkpoint entrant mismatch');
  }
  return checkpoint;
}

export function quarantineSpinCheckpoint(db, roomId, reason) {
  quarantineGameCheckpoint(db, roomId, 'spin', reason);
}
