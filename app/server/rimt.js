const fail = (status, message) => { throw Object.assign(Error(message), { status }); };
const time = (value) => Number.isSafeInteger(value) && value >= 0;
const seat = (value) => Number.isInteger(value) && value >= 0 && value < 9;
const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === expected.split(',').sort().join(',');
const clone = (value) => structuredClone(value);

export function createRimt(input) {
  if (!keys(input, 'handId,proposer,decider,now,proposalMs,decisionMs') || !time(input.now)) fail(400, 'Provide explicit RIMT roles and deadlines');
  if (!seat(input.proposer) || !seat(input.decider) || input.proposer === input.decider) fail(400, 'RIMT seats must be distinct');
  if (typeof input.handId !== 'string' || !input.handId || !time(input.proposalMs) || input.proposalMs < 1 || !time(input.decisionMs) || input.decisionMs < 1 || !time(input.now + input.proposalMs)) fail(400, 'Invalid RIMT roles or deadlines');
  return readRimt({
    version: 1, handId: input.handId, proposer: input.proposer, decider: input.decider,
    createdAt: input.now, suggestUntil: input.now + input.proposalMs, decisionMs: input.decisionMs,
    proposal: null, proposedAt: null, agreed: null, runs: null, decidedAt: null, reason: null,
  });
}

export function readRimt(value) {
  try {
    const fields = 'version,handId,proposer,decider,createdAt,suggestUntil,decisionMs,proposal,proposedAt,agreed,runs,decidedAt,reason';
    if (!keys(value, fields) || value.version !== 1 || typeof value.handId !== 'string' || !value.handId || !seat(value.proposer) || !seat(value.decider) || value.proposer === value.decider || !time(value.createdAt) || !time(value.suggestUntil) || value.suggestUntil <= value.createdAt || !Number.isSafeInteger(value.decisionMs) || value.decisionMs < 1 || !time(value.suggestUntil + value.decisionMs)) throw Error();
    if (value.proposal === null) {
      if (value.proposedAt !== null) throw Error();
    } else if (![1, 2, 3].includes(value.proposal) || !time(value.proposedAt) || value.proposedAt < value.createdAt || value.proposedAt >= value.suggestUntil) throw Error();
    if (value.runs === null) {
      if (value.proposal === 1 || value.agreed !== null || value.decidedAt !== null || value.reason !== null) throw Error();
    } else {
      if (![1, 2, 3].includes(value.runs) || !time(value.decidedAt) || value.decidedAt < value.createdAt) throw Error();
      if (value.reason === 'once') {
        if (value.proposal !== 1 || value.runs !== 1 || value.agreed !== null || value.decidedAt !== value.proposedAt) throw Error();
      } else if (value.reason === 'agreed' || value.reason === 'declined') {
        if (![2, 3].includes(value.proposal) || value.agreed !== (value.reason === 'agreed') || value.runs !== (value.agreed ? value.proposal : 1) || value.decidedAt < value.proposedAt || value.decidedAt >= value.proposedAt + value.decisionMs) throw Error();
      } else if (value.reason === 'timeout') {
        if (value.proposal === 1 || value.runs !== 1 || value.agreed !== null || value.decidedAt < (value.proposal === null ? value.suggestUntil : value.proposedAt + value.decisionMs)) throw Error();
      } else throw Error();
    }
    return clone(value);
  } catch {
    throw Error('Invalid RIMT checkpoint');
  }
}

export function applyRimt(value, command, now) {
  const state = readRimt(value);
  const action = command?.action;
  const expected = action === 'suggest' ? 'action,handId,seat,runs' : action === 'decide' ? 'action,handId,seat,agreed' : action === 'expire' ? 'action,handId' : null;
  if (!expected || !keys(command, expected) || typeof command.handId !== 'string' || !command.handId || !time(now) || now < state.createdAt || (action !== 'expire' && !seat(command.seat)) || (action === 'suggest' && ![1, 2, 3].includes(command.runs)) || (action === 'decide' && typeof command.agreed !== 'boolean')) fail(400, 'Invalid RIMT command');
  if (command.handId !== state.handId) fail(409, 'RIMT hand changed');
  if ((action === 'suggest' && command.seat !== state.proposer) || (action === 'decide' && command.seat !== state.decider)) fail(409, 'This seat cannot make that RIMT choice');
  if (action === 'suggest' && state.proposal !== null) {
    if (command.runs === state.proposal) return state;
    fail(409, 'RIMT proposal already recorded');
  }
  if (action === 'decide' && state.agreed !== null) {
    if (command.agreed === state.agreed) return state;
    fail(409, 'RIMT decision already recorded');
  }
  const deadline = state.proposal === null ? state.suggestUntil : state.proposedAt + state.decisionMs;
  if (action === 'expire') {
    if (state.runs !== null || now < deadline) return state;
    state.runs = 1;
    state.reason = 'timeout';
    state.decidedAt = now;
    return readRimt(state);
  }
  if (state.runs !== null || now >= deadline) fail(409, 'RIMT choice is closed');
  if (action === 'suggest') {
    state.proposal = command.runs;
    state.proposedAt = now;
    if (command.runs === 1) {
      state.runs = 1;
      state.reason = 'once';
      state.decidedAt = now;
    }
  } else {
    if (state.proposal === null) fail(409, 'Wait for a RIMT proposal');
    if (now < state.proposedAt) fail(400, 'RIMT clock moved before the proposal');
    state.agreed = command.agreed;
    state.runs = command.agreed ? state.proposal : 1;
    state.reason = command.agreed ? 'agreed' : 'declined';
    state.decidedAt = now;
  }
  return readRimt(state);
}
