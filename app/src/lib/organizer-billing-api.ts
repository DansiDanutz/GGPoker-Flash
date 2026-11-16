import { getToken } from './api';

export type BillingMode = 'off' | 'enforce';
export type OrganizerTariffs = {
  membership: number; cash_setup: number; cash_hour: number; cash_start?: number;
  tournament_setup: number; spin_setup: number; reschedule: number;
};
export type BillingMembership = { active: boolean; expires_at: string | null };
export type BillingLedgerEntry = {
  id: number; kind: string; amount_cents: number; reference: string; resource_id: string | null;
  metadata: string; created_at: string;
};
export type BillingTable = {
  id: string; name: string; game: string;
  session?: { active: number | boolean; paid_until: string } | null;
  schedule?: { start_at: string; started_at: string | null } | null;
};
export type BillingTournament = { id: string; name: string; start_at: string; status: string };
export type OrganizerBillingAccount = {
  mode: BillingMode; balance_cents: number;
  memberships: { organizer: BillingMembership; contributor: BillingMembership };
  ledger: BillingLedgerEntry[]; tables: BillingTable[]; tournaments: BillingTournament[];
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
  config: () => request<{ mode: BillingMode; tariffs: OrganizerTariffs }>(),
  mine: () => request<OrganizerBillingAccount>('/me'),
  subscribe: (role: 'organizer' | 'contributor', idempotencyKey: string) => request('/subscribe', { role, idempotencyKey }),
  startCash: (id: string, idempotencyKey: string) => request(`/cash/${encodeURIComponent(id)}/start`, { idempotencyKey }),
  stopCash: (id: string) => request(`/cash/${encodeURIComponent(id)}/stop`, {}),
  reschedule: (kind: 'spin' | 'tournament', id: string, startAt: string, idempotencyKey: string) => request(`/${kind}/${encodeURIComponent(id)}/reschedule`, { startAt, idempotencyKey }),
  credit: (userId: number, amountCents: number, reference: string) => request('', { userId, amountCents, reference }, '/api/admin/marketplace/billing/credits'),
};
