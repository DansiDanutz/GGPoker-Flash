// SPDX-License-Identifier: AGPL-3.0-only
// OpenPoker-side commercial policy; the isolated signed sandbox client is in
// gamingo-provider.js. Paid gameplay and wallet callbacks remain unavailable.
export const GAMINGO_PRODUCT_ID = 'gamingo-casino-manager';
export const GAMINGO_MODEL = Object.freeze({
  product_id: GAMINGO_PRODUCT_ID,
  status: 'integration_pending',
  customer: 'organizer',
  player_plugin_purchase_required: false,
  organizer_membership_required: true,
  plugin_access_required: true,
  payment_provider: 'nervixpay',
  publisher_paid_directly: true,
  commission_bps: 2000,
  commission_source: 'publisher_prepaid_commission_credits',
  gameplay_balances: Object.freeze(['play_money', 'organizer_cash_chips']),
  automatic_balance_conversion: false,
  supplier_fees: 'separate_agreement_required',
  licence_included: false,
  checkout_enabled: false,
  live_sessions_enabled: false,
  provider_wallet_callbacks_enabled: false,
  sandbox_client_available: true,
  provider_protocol_version: '1.11.0',
});

const REQUIRED_EVIDENCE = Object.freeze([
  'operator_arrangement', 'marketplace_distribution', 'balance_model',
  'markets_and_games', 'supplier_pricing', 'source_distribution',
]);
const BALANCES = GAMINGO_MODEL.gameplay_balances;
function fail(message, status = 400, code = 'gamingo_invalid') {
  throw Object.assign(new Error(message), { status, code });
}
function userId(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('Invalid organizer ID.');
  return value;
}
function reference(value) {
  return typeof value === 'string' && value.trim().length >= 3 && value.length <= 200 && !/[\u0000-\u001f]/.test(value);
}

/**
 * Connections come from trusted server configuration, never player/organizer JSON.
 * Evidence values are private reference IDs to reviewed agreements, not secrets.
 * This policy reads existing ledgers and cannot grant access or move balances.
 */
export function createGamingo({ db, billing, commerce, connections = {}, now = Date.now }) {
  if (typeof connections === 'string') {
    try { connections = JSON.parse(connections); }
    catch { fail('GGPOKER_GAMINGO_CONNECTIONS must contain valid JSON.', 503); }
  }
  if (!connections || typeof connections !== 'object' || Array.isArray(connections)) fail('Invalid Gamingo connections.', 503);
  for (const [id, connection] of Object.entries(connections)) {
    if (!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id)) || !connection || typeof connection !== 'object'
      || Array.isArray(connection) || !BALANCES.includes(connection.balance_model)
      || !['individual_operator', 'platform_sub_operator'].includes(connection.arrangement)
      || typeof connection.enabled !== 'boolean' || !reference(connection.operator_id)
      || !connection.evidence || typeof connection.evidence !== 'object' || Array.isArray(connection.evidence)
      || Object.keys(connection).some(key => !['enabled', 'operator_id', 'balance_model', 'arrangement', 'evidence'].includes(key))
      || Object.keys(connection.evidence).some(key => !REQUIRED_EVIDENCE.includes(key) || !reference(connection.evidence[key]))) {
      fail('Invalid Gamingo organizer configuration. Store credentials in a server-side vault, not this configuration.', 503);
    }
  }
  // Copy configuration so a caller cannot mutate a reviewed connection in place.
  connections = JSON.parse(JSON.stringify(connections));
  function readiness(id) {
    id = userId(id);
    const user = db.prepare('SELECT id,banned,deleted_at FROM users WHERE id=?').get(id);
    if (!user || user.banned || user.deleted_at) fail('Active organizer required.', 403, 'gamingo_organizer_inactive');
    const connection = connections[String(id)];
    const membership = billing.account(id).memberships.organizer;
    const paid = commerce.hasPaidAccess(id, GAMINGO_PRODUCT_ID, now());
    const offer = commerce.listOffers().find(row => row.product_id === GAMINGO_PRODUCT_ID);
    const publisher = offer ? commerce.getPublisher(offer.publisher_id) : null;
    const publisherReady = !!publisher && publisher.status === 'approved';
    const publisherFunded = publisherReady && commerce.balance(publisher.id).available_cents > 0;
    const missingEvidence = REQUIRED_EVIDENCE.filter(key => !connection?.evidence?.[key]);
    const blockers = [
      ...(billing.mode !== 'enforce' ? ['organizer_billing_disabled'] : []),
      ...(!membership.active ? ['organizer_membership_required'] : []),
      ...(!paid ? ['paid_plugin_required'] : []),
      ...(!connection?.enabled ? ['provider_connection_disabled'] : []),
      ...missingEvidence.map(key => `supplier_approval_required:${key}`),
      ...(!publisherReady ? ['approved_publisher_required'] : []),
      ...(publisherReady && !publisherFunded ? ['publisher_commission_credit_required'] : []),
      // Configuration and even a manually inserted entitlement cannot bypass
      // unfinished wire protocol, wallet certification or launch review.
      'provider_wallet_not_implemented', 'provider_wallet_not_certified', 'production_release_required',
    ];
    return {
      ...GAMINGO_MODEL, organizer_id: id, balance_model: connection?.balance_model || null,
      arrangement: connection?.arrangement || null,
      organizer_membership_active: membership.active, paid_plugin_access_active: paid,
      publisher_approved: publisherReady, publisher_commission_funded: publisherFunded,
      supplier_configuration_complete: !!connection?.enabled && missingEvidence.length === 0,
      missing_supplier_approvals: missingEvidence, blockers, can_launch: false,
    };
  }
  return { model: () => ({ ...GAMINGO_MODEL }), readiness };
}
