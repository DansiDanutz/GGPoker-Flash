import { getToken } from './api';
import { notifyPrefsChanged } from './prefsSync';

export type SqueezePlan = 'monthly' | 'lifetime';
export type SqueezeEntitlement = { active: boolean; plan: SqueezePlan | null; expires_at: string | null };
export type SqueezeAccount = {
  product: { id: string; prices: { monthly_cents: number; lifetime_cents: number } };
  entitlement: SqueezeEntitlement;
  service_credit_balance_cents: number;
  purchases_enabled: boolean;
};
const ROOT = '/api/marketplace/squeeze-3d';
async function request<T>(path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const response = await fetch(ROOT + path, {
    method: body === undefined ? 'GET' : 'POST',
    signal: AbortSignal.timeout(5000),
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || `Request failed (${response.status}).`), { status: response.status });
  return data as T;
}
export const squeezePluginApi = {
  account: () => request<SqueezeAccount>('/account'),
  purchase: (plan: SqueezePlan, idempotencyKey: string) => request<SqueezeAccount>('/purchase', { plan, idempotencyKey }),
  access: (tableId: string) => request<{ access: { allowed: boolean; preview: boolean; reason: string }; entitlement: SqueezeEntitlement }>(`/access?tableId=${encodeURIComponent(tableId)}`),
};
export const squeezePreferenceKey = (userId?: number) => `openpoker.squeeze3d:${userId ?? 'guest'}`;
export function readSqueeze3D(userId?: number): boolean {
  try { return localStorage.getItem(squeezePreferenceKey(userId)) === '1'; } catch { return false; }
}
export function selectSqueeze3D(userId: number | undefined, enabled: boolean) {
  const key = squeezePreferenceKey(userId);
  localStorage.setItem(key, enabled ? '1' : '0');
  notifyPrefsChanged([key]);
}
