import { getToken } from './api';

export type PublisherStatus = 'pending' | 'approved' | 'suspended' | 'rejected';
export type PublisherBalance = { publisher_id: string; currency: 'USD'; posted_cents: number; reserved_cents: number; available_cents: number };
export type MarketplacePublisher = {
  id: string; owner_user_id: number; display_name: string; kind: 'individual' | 'company';
  nervixpay_merchant_id: string; status: PublisherStatus; review_reason: string;
  created_at: string; updated_at: string; balance?: PublisherBalance;
};
export type CommerceOffer = { product_id: string; publisher_id: string; created_at: string; updated_at: string };
export type PaymentBinding = { provider_order_id: string; merchant_id: string; network: string; token: string; amount_base_units: string };
export type CommerceOrder = {
  id: string; buyer_user_id: number; product_id: string; publisher_id: string; idempotency_key: string;
  seller_merchant_id: string; price_cents: number; currency: 'USD'; pricing: 'one_time' | 'monthly' | 'yearly';
  commission_bps: number; commission_cents: number;
  status: 'awaiting_payment' | 'paid' | 'expired' | 'cancelled' | 'payment_review' | 'refunded';
  expires_at: string; created_at: string; updated_at: string; payment_binding?: PaymentBinding | null;
};
export type CommerceAdminData = { publishers: MarketplacePublisher[]; offers: CommerceOffer[]; orders: CommerceOrder[] };
export type PaymentProof = { providerOrderId: string; merchantId: string; network: string; token: string; amountBaseUnits: string };

const ROOT = '/api/admin/marketplace/commerce';
async function request<T>(path = '', body?: unknown): Promise<T> {
  const token = getToken();
  const response = await fetch(ROOT + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `Operațiunea nu a reușit (${response.status}).`);
  return data as T;
}

export const marketplaceCommerceApi = {
  get: () => request<CommerceAdminData>(),
  createPublisher: (body: { ownerUserId: number; displayName: string; kind: 'individual' | 'company'; nervixpayMerchantId: string }) => request('/publishers', body),
  reviewPublisher: (id: string, body: { status: Exclude<PublisherStatus, 'pending'>; reason: string }) => request(`/publishers/${encodeURIComponent(id)}/review`, body),
  creditPublisher: (id: string, body: { amountCents: number; reference: string; kind: 'confirmed_topup' | 'adjustment' }) => request(`/publishers/${encodeURIComponent(id)}/credits`, body),
  bindOffer: (body: { productId: string; publisherId: string }) => request('/offers', body),
  reserveOrder: (body: { buyerUserId: number; productId: string; idempotencyKey: string }) => request<{ order: CommerceOrder; replayed?: boolean }>('/orders', body),
  bindPayment: (id: string, body: PaymentProof) => request(`/orders/${encodeURIComponent(id)}/payment-binding`, body),
  confirmPayment: (body: PaymentProof & { paymentId: string; paidAt: string }) => request('/payments/confirm', body),
  releaseOrder: (id: string, reason: string) => request(`/orders/${encodeURIComponent(id)}/release`, { reason }),
  refundOrder: (id: string, refundReference: string) => request(`/orders/${encodeURIComponent(id)}/refund`, { refundReference }),
};
