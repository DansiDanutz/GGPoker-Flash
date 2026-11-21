// SPDX-License-Identifier: AGPL-3.0-only
// Hosted management policy. This never changes the licence of the source code,
// grants an administrator role, or touches player balances/game settlement.
import { SPIN_SEATS, SPIN_STAKES, spinSmallBlinds } from './spin.js';

export const MANAGEMENT_PLUGINS = Object.freeze([
  Object.freeze({ id: 'cash-games-manager', name: 'Cash Games Manager', implemented: true, scope: 'owned_private_tables',
    summary: 'Create and configure private play-money poker tables.',
    capabilities: ['Private Hold’em, PLO 4/5/6 and Short Deck tables', 'Table configuration', 'Existing ownership checks'],
    description: 'Paid management access on this hosted service for private play-money cash tables. Players do not need a management purchase to participate. Public-table configuration remains restricted to platform administrators. The open-source code retains its AGPL licence.' }),
  Object.freeze({ id: 'tournaments-manager', name: 'Tournaments Manager', implemented: true, scope: 'owned_private_tournaments',
    summary: 'Create scheduled private play-money tournaments.',
    capabilities: ['Scheduled tournaments', 'Standard, bounty, mystery, satellite and flip formats', 'Starting stacks and blind schedules'],
    description: 'Hosted management access for the existing scheduled tournament tools. Access enables creating events owned by your account; it does not grant access to other organizers’ events or the platform administration console. Running events can finish after access expires.' }),
  Object.freeze({ id: 'spin-and-go-manager', name: 'Spin & Go Manager', implemented: true, scope: 'owned_private_spin_tables',
    summary: 'Host private three-player Jackpot Sit & Go tables.',
    capabilities: ['Three-player Jackpot SNG', 'Existing 5,000 or 10,000 play-chip stakes', 'Engine-controlled blinds and prize distribution'],
    description: 'Hosted organizer access for the existing play-money Jackpot SNG engine. Three seats, supported fixed stakes and the engine’s prize rules are enforced on the server. This product is a management service; its purchase does not buy chips or a chance to win money.' }),
  Object.freeze({ id: 'sit-and-go-manager', name: 'Sit & Go Manager', implemented: false, scope: 'planned',
    summary: 'Conventional fill-and-start Sit & Go management, planned.',
    capabilities: ['Planned fill-and-start engine', 'Planned organizer controls'],
    description: 'A separate conventional Sit & Go engine and organizer adapter are not implemented yet. Scheduled tournaments and Jackpot SNG do not establish this capability. This offer cannot grant management access or accept paid orders until implementation is complete.' }),
  Object.freeze({ id: 'social-casino-manager', name: 'Social Casino Manager', implemented: false, scope: 'planned',
    summary: 'Organizer controls for the existing play-money casino games, planned.',
    capabilities: ['Existing simulated play-money games', 'Organizer configuration adapter planned'],
    description: 'The app contains simulated play-money casino games. Organizer-scoped management and supplier integration are separate work. This is not a live-dealer integration or a real-money casino offering and cannot accept paid orders yet.' }),
  Object.freeze({ id: 'gamingo-casino-manager', name: 'Gamingo Casino Manager', implemented: false, scope: 'owned_gamingo_games',
    summary: 'Gamingo games for an organizer’s community, pending supplier integration.',
    capabilities: ['Organizer-scoped provider connection', 'Separate gameplay and marketplace balances', 'Provider approval and wallet certification required'],
    description: 'Planned paid organizer integration with Gamingo. Players do not purchase the plugin. Organizer membership, plugin access and supplier approval are separate requirements. Publisher receipts use the existing NervixPay commerce model and 20% prepaid commission. Free previews use isolated non-redeemable Play Money. Organizer Cash Chips require separate supplier approval. No live games, checkout or gambling licence are supplied by this listing.' }),
]);

const BY_ID = new Map(MANAGEMENT_PLUGINS.map((plugin) => [plugin.id, plugin]));
export const managementPlugin = (id) => BY_ID.get(id) || null;
export const tableManagementProduct = (game) => game === 'spingold' ? 'spin-and-go-manager' : 'cash-games-manager';

export function managementMode(raw = process.env.GGPOKER_MARKETPLACE_ENFORCEMENT) {
  const mode = raw == null || raw === '' ? 'off' : raw;
  if (!['off', 'observe', 'enforce'].includes(mode)) throw new Error('GGPOKER_MARKETPLACE_ENFORCEMENT must be off, observe or enforce');
  return mode;
}

export function seedManagementProducts(db) {
  const insert = db.prepare(`INSERT OR IGNORE INTO marketplace_products
    (id,slug,name,summary,description,category,delivery,status,pricing,price_cents,currency,features_json,featured,sort_order,created_at,updated_at)
    VALUES (?,?,?,?,?,'tools','hosted_service',?,'quote',NULL,'USD',?,?,?, ?,?)`);
  const now = new Date().toISOString();
  for (const [index, plugin] of MANAGEMENT_PLUGINS.entries()) {
    insert.run(plugin.id, plugin.id, plugin.name, plugin.summary, plugin.description,
      plugin.implemented ? 'available' : 'coming_soon', JSON.stringify(plugin.capabilities), plugin.implemented ? 1 : 0,
      50 + index * 10, now, now);
  }
}

/** No role bypass: auth/ownership is still required by each route before this check. */
export function createManagementPolicy({ db, commerce, mode = managementMode(), now = Date.now }) {
  managementMode(mode);
  const catalog = () => ({ mode, plugins: MANAGEMENT_PLUGINS.map(({ description, ...plugin }) => plugin) });
  const access = (userId, productId) => {
    const plugin = managementPlugin(productId);
    if (!plugin || !plugin.implemented) return { product_id: productId, active: false, expires_at: null, can_manage: false, reason: 'not_implemented' };
    const active = commerce.hasPaidAccess(userId, productId, now());
    const paid = active ? commerce.listPaidAccess(userId).filter((row) => row.product_id === productId && row.status === 'active'
      && (!row.expires_at || Date.parse(row.expires_at) > now())) : [];
    const expires = paid.some((row) => row.expires_at == null) ? null : paid.map((row) => row.expires_at).sort().at(-1) || null;
    return { product_id: productId, active, expires_at: expires, can_manage: active || mode !== 'enforce',
      reason: active ? 'paid_access' : mode === 'off' ? 'community_mode' : mode === 'observe' ? 'rollout_observation' : 'paid_plugin_required' };
  };
  const check = (actor, productId, action) => {
    const result = access(actor.id, productId);
    if (!result.active && mode !== 'off') {
      db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)').run(actor.login || String(actor.id),
        result.can_manage ? 'plugin_access_observed' : 'plugin_access_denied', JSON.stringify({ product_id: productId, action }));
    }
    return result;
  };
  const error = (productId) => ({ error: `An active paid ${managementPlugin(productId)?.name || 'management plugin'} is required to manage this feature.`,
    code: 'paid_plugin_required', product_id: productId, marketplace_url: '/marketplace' });
  const requireAccess = (actor, productId, action, res, json) => {
    if (check(actor, productId, action).can_manage) return true;
    json(res, 402, error(productId));
    return false;
  };
  return { mode, catalog, access, check, error, requireAccess,
    account: (userId) => ({ ...catalog(), access: MANAGEMENT_PLUGINS.map((plugin) => access(userId, plugin.id)) }) };
}

/** Private Spin tables use the existing engine's invariant configuration. */
export function privateSpinConfig(body) {
  const stake = body.stake ?? body.min_buyin;
  if (!Number.isSafeInteger(stake) || !SPIN_STAKES.includes(stake)) throw new Error('Choose a supported Spin & Go stake: 5000 or 10000 play chips.');
  if (body.bombPot) throw new Error('Bomb pots are not available in Spin & Go.');
  return { game: 'spingold', sb: spinSmallBlinds[0], bb: spinSmallBlinds[0] * 2,
    min_buyin: stake, max_buyin: stake, seats: SPIN_SEATS, speed: 'Fast', bomb_pot: 0 };
}
