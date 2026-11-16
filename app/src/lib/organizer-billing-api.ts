import { getToken } from './api';

export type BillingMode = 'off' | 'enforce';
export type ManualFundingConfig = {
  enabled: boolean; links: Array<{ amount_cents: 900 | 1000; url: string }>;
  merchant_display?: string; settlement_account_display?: string; assets?: string[];
};
export type OrganizerBillingConfig = { mode: BillingMode; chip_mode: BillingMode; tariffs: OrganizerTariffs; checkout_enabled: false; manual_funding: ManualFundingConfig };
export type OrganizerTariffs = {
  membership: number; cash_setup: number; cash_hour: number; cash_start?: number;
  tournament_setup: number; spin_setup: number; reschedule: number;
  cash_hour_tiers: Array<{ through: number | null; cents: number }>;
};
export type BillingMembership = { active: boolean; expires_at: string | null };
export type BillingLedgerEntry = {
  id: number; kind: string; amount_cents: number; reference: string; resource_id: string | null;
  metadata: string; created_at: string;
};
export type BillingTable = {
  id: string; name: string; game: string;
  chip_economy: number; rakePercent: number; rakeCap: number;
  session?: { active: number | boolean; paid_until: string } | null;
  schedule?: { start_at: string; started_at: string | null } | null;
};
export type BillingTournament = { id: string; name: string; start_at: string; status: string; format: string; mode: string; buyin: number; fee: number; starting_stack: number; blind_speed: number; late_reg: number; max_players: number; entrants: number; bounty: number; chip_economy: number };
export type OrganizerBillingAccount = {
  mode: BillingMode; balance_cents: number;
  cash_usage: { paid_hours: number; next_hour: number; next_hour_cents: number };
  memberships: { organizer: BillingMembership; contributor: BillingMembership };
  ledger: BillingLedgerEntry[]; tables: BillingTable[]; tournaments: BillingTournament[];
};
export type ServiceCreditRefund = {
  request_id: string; user_id: number; original_reference: string; amount_cents: number;
  status: string; external_reference: string | null; reason: string; created_at?: string; updated_at?: string;
};

async function request<T>(path = '', body?: unknown, root = '/api/marketplace/billing'): Promise<T> {
  const token = getToken();
  const response = await fetch(`${root}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `Cererea nu a reușit (${response.status}).`);
  return data as T;
}

export const organizerBillingApi = {
  config: () => request<OrganizerBillingConfig>(),
  mine: () => request<OrganizerBillingAccount>('/me'),
  subscribe: (role: 'organizer' | 'contributor', idempotencyKey: string) => request('/subscribe', { role, idempotencyKey }),
  startCash: (id: string, idempotencyKey: string) => request(`/cash/${encodeURIComponent(id)}/start`, { idempotencyKey }),
  stopCash: (id: string) => request(`/cash/${encodeURIComponent(id)}/stop`, {}),
  setCashRake: (id: string, rakePercent: number, rakeCap: number) => request(`/cash/${encodeURIComponent(id)}/rake`, { rakePercent, rakeCap }),
  reschedule: (kind: 'spin' | 'tournament', id: string, startAt: string, idempotencyKey: string) => request(`/${kind}/${encodeURIComponent(id)}/reschedule`, { startAt, idempotencyKey }),
  credit: (userId: number, amountCents: number, reference: string) => request('', { userId, amountCents, reference }, '/api/admin/marketplace/billing/credits'),
  refunds: () => request<{ refunds: ServiceCreditRefund[] }>('', undefined, '/api/admin/marketplace/billing/refunds'),
  reserveRefund: (body: { userId: number; originalReference: string; amountCents: number; requestId: string; reason: string }) => request('', body, '/api/admin/marketplace/billing/refunds'),
  markRefundPaid: (requestId: string, externalReference: string) => request(`/${encodeURIComponent(requestId)}/paid`, { externalReference }, '/api/admin/marketplace/billing/refunds'),
  cancelRefund: (requestId: string, reason: string) => request(`/${encodeURIComponent(requestId)}/cancel`, { reason }, '/api/admin/marketplace/billing/refunds'),
};
