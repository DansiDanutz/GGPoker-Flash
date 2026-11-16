import { withGameReceipt } from './game-receipts.js';
import { spinPayouts } from './spin.js';
import { spinSixConfiguration } from './spin-six.js';

function integer(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw Object.assign(new Error(`${label} must be an integer from ${minimum} to ${maximum}`), { status: 400 });
  return value;
}

export function validateSpinRules(config, stake) {
  if (!config || !Array.isArray(config.rows)) throw Object.assign(new Error('Every Spin multiplier row is required'), { status: 400 });
  const authoritative = spinPayouts(stake);
  if (config.rows.length !== authoritative.length) throw Object.assign(new Error('Every Spin multiplier row is required'), { status: 400 });
  const supplied = new Map();
  for (const row of config.rows) {
    if (!row || !Number.isSafeInteger(row.multiplier) || supplied.has(row.multiplier)) throw Object.assign(new Error('Spin multiplier rows are invalid or duplicated'), { status: 400 });
    supplied.set(row.multiplier, row);
  }
  const rows = authoritative.map((base) => {
    const row = supplied.get(base.multiplier);
    if (!row || row.noDealing) throw Object.assign(new Error(`Spin multiplier ${base.multiplier} is missing or cannot be dealt`), { status: 400 });
    return {
      ...base,
      startingChips: integer(row.startingChips, 300, 1000, 'startingChips'),
      timeBankCards: integer(row.timeBankCards, 1, 4, 'timeBankCards'),
      actionSeconds: integer(row.actionSeconds, 1, 120, 'actionSeconds'),
      secondsPerCard: integer(row.secondsPerCard, 1, 60, 'secondsPerCard'),
      maxCardsPerAction: integer(row.maxCardsPerAction, 1, row.timeBankCards, 'maxCardsPerAction'),
    };
  });
  return { rows };
}

export function validateSpinInsurance(insurance) {
  if (insurance == null) return null;
  return {
    premium: integer(insurance.premium, 1, 1000000000, 'Insurance premium'),
    payout: integer(insurance.payout, 1, 1000000000, 'Insurance payout'),
  };
}

export function spinRulesComplete(config) {
  try {
    if (config?.mode === 'local-practice') spinSixConfiguration(config);
    else validateSpinRules(config, config.rows[0]?.prizePool / config.rows[0]?.multiplier);
    return true;
  } catch {
    return false;
  }
}

export function saveSpinRules(db, { actorId, mode, stake, expectedRevision, operationId, config, insurance }) {
  if (!['3max', '6max'].includes(mode) || ![5000, 10000].includes(stake) || !Number.isSafeInteger(expectedRevision) || typeof operationId !== 'string' || !operationId.trim()) {
    throw Object.assign(new Error('Invalid Spin configuration command'), { status: 400 });
  }
  const validConfig = mode === '6max' ? spinSixConfiguration(config) : validateSpinRules(config, stake);
  if (mode === '6max' && validConfig.buyIn !== stake) throw Object.assign(new Error('Six-seat buy-in must match the selected stake'), { status: 400 });
  const validInsurance = validateSpinInsurance(insurance);
  return withGameReceipt(db, {
    actorId,
    operationId,
    scope: `spin-rules:${mode}:${stake}`,
    request: { mode, stake, expectedRevision, config: validConfig, insurance: validInsurance },
  }, () => {
    const current = db.prepare('SELECT revision FROM spin_rules WHERE mode = ? AND stake = ?').get(mode, stake);
    if (!current && expectedRevision !== 0 || current && current.revision !== expectedRevision) throw Object.assign(new Error('Spin rules revision changed'), { status: 409 });
    const revision = expectedRevision + 1;
    if (!current) db.prepare(`INSERT INTO spin_rules (mode,stake,revision,config_json,insurance_json,updated_at) VALUES (?,?,?,?,?,datetime('now'))`)
      .run(mode, stake, revision, JSON.stringify(validConfig), validInsurance ? JSON.stringify(validInsurance) : null);
    else db.prepare(`UPDATE spin_rules SET revision = ?, config_json = ?, insurance_json = ?, updated_at = datetime('now')
      WHERE mode = ? AND stake = ?`).run(revision, JSON.stringify(validConfig), validInsurance ? JSON.stringify(validInsurance) : null, mode, stake);
    return { revision, state: { mode, stake, ruleRevision: revision, config: validConfig, insurance: validInsurance, complete: true } };
  });
}
