// SPDX-License-Identifier: AGPL-3.0-only
// The commerce console records payments independently verified by an operator.
// There is deliberately no public or buyer-callable payment confirmation route.
import { managementPlugin } from './management-plugins.js';

const PUBLIC = '/api/marketplace/management';
const ADMIN = '/api/admin/marketplace/commerce';

function fail(message, status = 400) {
  const error = new Error(message); error.status = status; throw error;
}

function bodyFields(body, fields) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Expected an object.');
  if (JSON.stringify(body).length > 24_000) fail('Request is too large.', 413);
  if (Object.keys(body).some((field) => !fields.includes(field))) fail('Unexpected request field.');
  return body;
}

function identifier(value) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) fail('Invalid identifier.');
  return value;
}

export function createManagementRoutes({ db, commerce, policy, billing, json, requireUser, requireAdmin, readBody }) {
  const method = (req, expected) => { if (req.method !== expected) fail('Method not allowed.', 405); };
  const implemented = (productId) => {
    const plugin = managementPlugin(productId);
    if (!plugin?.implemented) fail('This management plugin is not implemented and cannot be sold.', 409);
  };
  const audit = (actor, action, detail) => db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)')
    .run(actor.login, action, JSON.stringify(detail));

  return async function handleManagement(req, res, url) {
    const p = url.pathname;
    const publicRoute = p === PUBLIC || p === `${PUBLIC}/me`;
    const publisherRoute = p === '/api/marketplace/publisher';
    const adminRoute = p === ADMIN || p.startsWith(`${ADMIN}/`);
    if (!publicRoute && !publisherRoute && !adminRoute) return false;
    try {
      if (p === PUBLIC) {
        method(req, 'GET'); json(res, 200, policy.catalog()); return true;
      }
      if (p === `${PUBLIC}/me`) {
        method(req, 'GET');
        const user = requireUser(req, res); if (!user) return true;
        json(res, 200, policy.account(user.id)); return true;
      }
      if (publisherRoute) {
        const user = requireUser(req, res); if (!user) return true;
        if (req.method === 'GET') {
          const publisher = commerce.publisherForUser(user.id);
          json(res, 200, { publisher, balance: publisher ? commerce.balance(publisher.id) : null,
            submission_enabled: true, checkout_enabled: false });
          return true;
        }
        method(req, 'POST');
        const body = bodyFields(await readBody(req), ['displayName', 'kind', 'nervixpayMerchantId']);
        billing?.requireMembership(user.id, 'contributor');
        const publisher = commerce.registerPublisher({ ...body, ownerUserId: user.id });
        json(res, 201, { publisher }); return true;
      }

      // index.js applies its private-network boundary before entering this router.
      const actor = requireAdmin(req, res); if (!actor) return true;
      if (p === ADMIN) {
        method(req, 'GET');
        const bindings = new Map(db.prepare('SELECT * FROM marketplace_payment_bindings').all().map((binding) => [binding.order_id, binding]));
        json(res, 200, {
          checkout_enabled: false, settlement_mode: 'operator_verified', commission_bps: 2000,
          publishers: commerce.listPublishers().map((publisher) => ({ ...publisher, balance: commerce.balance(publisher.id) })),
          orders: commerce.listOrders().map((order) => ({ ...order, payment_binding: bindings.get(order.id) || null })),
          offers: db.prepare('SELECT * FROM marketplace_commerce_offers ORDER BY product_id').all(),
        });
        return true;
      }
      method(req, 'POST');
      let result;
      if (p === `${ADMIN}/publishers`) {
        const body = bodyFields(await readBody(req), ['ownerUserId', 'displayName', 'kind', 'nervixpayMerchantId']);
        billing?.requireMembership(body.ownerUserId, 'contributor');
        result = { publisher: commerce.registerPublisher({ ...body, actor: actor.login }) };
        audit(actor, 'marketplace_publisher_recorded', { publisher_id: result.publisher.id });
      } else if (p === `${ADMIN}/offers`) {
        const body = bodyFields(await readBody(req), ['productId', 'publisherId']); implemented(body.productId);
        const publisher = db.prepare('SELECT owner_user_id FROM marketplace_publishers WHERE id=?').get(body.publisherId);
        if (publisher) billing?.requireMembership(publisher.owner_user_id, 'contributor');
        result = { offer: commerce.bindOffer({ ...body, actor: actor.login }) };
      } else if (p === `${ADMIN}/orders`) {
        const body = bodyFields(await readBody(req), ['buyerUserId', 'productId', 'idempotencyKey']); implemented(body.productId);
        if (billing?.mode === 'enforce') fail('Legacy product-wide purchases are unavailable under service-credit billing.', 409);
        result = { order: commerce.reserveOrder(body) };
        audit(actor, 'marketplace_order_reserved_by_operator', { order_id: result.order.id });
      } else if (p === `${ADMIN}/payments/confirm`) {
        const body = bodyFields(await readBody(req), ['providerOrderId', 'paymentId', 'merchantId', 'network', 'token', 'amountBaseUnits', 'paidAt']);
        result = commerce.settleOrder({ ...body, actor: actor.login });
        audit(actor, 'marketplace_payment_manually_verified', { order_id: result.order.id, payment_id: body.paymentId, replayed: result.replayed });
      } else {
        const publisherAction = p.match(/^\/api\/admin\/marketplace\/commerce\/publishers\/([^/]+)\/(review|credits|expire)$/);
        const orderAction = p.match(/^\/api\/admin\/marketplace\/commerce\/orders\/([^/]+)\/(payment-binding|release|refund)$/);
        if (publisherAction) {
          const publisherId = identifier(publisherAction[1]);
          if (publisherAction[2] === 'review') {
            const body = bodyFields(await readBody(req), ['status', 'reason']);
            result = { publisher: commerce.reviewPublisher({ ...body, publisherId, actor: actor.login }) };
          } else if (publisherAction[2] === 'credits') {
            const body = bodyFields(await readBody(req), ['amountCents', 'reference', 'kind']);
            result = { balance: commerce.creditPublisher({ ...body, publisherId, actor: actor.login }) };
          } else {
            bodyFields(await readBody(req), []);
            result = { expired: commerce.expireReservations(publisherId), balance: commerce.balance(publisherId) };
          }
        } else if (orderAction) {
          const orderId = identifier(orderAction[1]);
          if (orderAction[2] === 'payment-binding') {
            const body = bodyFields(await readBody(req), ['providerOrderId', 'merchantId', 'network', 'token', 'amountBaseUnits']);
            result = { binding: commerce.bindPayment({ ...body, orderId, actor: actor.login }) };
            audit(actor, 'marketplace_payment_bound_by_operator', { order_id: orderId, provider_order_id: body.providerOrderId });
          } else if (orderAction[2] === 'release') {
            const body = bodyFields(await readBody(req), ['reason']);
            result = { order: commerce.releaseOrder({ ...body, orderId, actor: actor.login }) };
          } else {
            const body = bodyFields(await readBody(req), ['refundReference']);
            result = commerce.refundOrder({ ...body, orderId, actor: actor.login });
          }
        } else fail('Commerce route not found.', 404);
      }
      json(res, 200, result); return true;
    } catch (error) {
      if (!error.status) throw error;
      json(res, error.status, { error: error.message, ...(error.code ? { code: error.code } : {}) }); return true;
    }
  };
}
