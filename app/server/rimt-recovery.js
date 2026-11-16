import { activeGameCheckpoint, quarantineGameCheckpoint, saveGameCheckpoint, terminalGameCheckpoint } from './game-checkpoints.js';

export function persistRimtCheckpoint(db, table, transition = 'state') {
  if (table.cfg.rimt_mode !== 'negotiated' || !table.handId) return null;
  return saveGameCheckpoint(db, {
    roomId: table.cfg.id,
    kind: 'rimt',
    operationId: `server:rimt:${table.cfg.id}:${table.rimtRevision || 0}:${table.messageSeq}:${transition}`,
    rules: { game: table.cfg.game, rimtMode: table.cfg.rimt_mode, handId: table.handId, revision: table.rimtRevision || 0 },
    state: table.recoveryState(),
    tableVersion: table.tableVersion,
  });
}

export function restoreRimtCheckpoint(db, table) {
  const checkpoint = activeGameCheckpoint(db, table.cfg.id, 'rimt');
  if (!checkpoint) throw new Error('Active RIMT checkpoint is missing');
  if (checkpoint.schema_version !== 1 || checkpoint.engine_version !== '1') throw new Error('Unsupported RIMT checkpoint version');
  const rules = JSON.parse(checkpoint.rules_json);
  if (rules.game !== table.cfg.game || rules.rimtMode !== table.cfg.rimt_mode) throw new Error('RIMT checkpoint rules changed');
  const state = JSON.parse(checkpoint.state_json);
  if (state.properties.handId !== rules.handId || (state.properties.rimtRevision || 0) !== rules.revision || state.properties.tableVersion !== checkpoint.table_version) throw new Error('RIMT checkpoint is stale');
  table.restoreRecoveryState(state);
  return checkpoint;
}

export function quarantineRimtCheckpoint(db, roomId, reason) {
  quarantineGameCheckpoint(db, roomId, 'rimt', reason);
}

export function terminalRimtCheckpoint(db, roomId) {
  terminalGameCheckpoint(db, roomId, 'rimt');
}
