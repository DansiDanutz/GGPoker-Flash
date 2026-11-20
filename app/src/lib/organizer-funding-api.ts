import { getToken } from './api';

export type FundingRequest = {
  id: string; organizerId: number; userId: number; amount: number; feeCents: number | null;
  state: 'requested' | 'offered' | 'credited' | 'paid' | 'rejected';
  userName?: string; organizerName?: string;
  reference: string; paymentLinkId: string | null;
};
async function request<T>(path = '', body?: unknown, base = '/api/marketplace/chips/funding'): Promise<T> {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${getToken()}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.message || 'Funding request failed.');
  return data as T;
}
export const organizerFundingApi = {
  list: () => request<{ requests: FundingRequest[]; enabled: boolean }>(),
  create: (organizerId: number, amount: number, key: string) => request<FundingRequest>('', { organizerId, amount, key }),
  act: (id: string, action: 'credit' | 'reject' | 'offer' | 'verify' | 'cancel', body: object = {}) => request<FundingRequest>(`/${encodeURIComponent(id)}/${action}`, body),
};

export function fundingCheckout(row: Pick<FundingRequest, 'paymentLinkId' | 'reference'>) {
  if (!row.paymentLinkId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.paymentLinkId)) return null;
  const url = new URL(`https://nervixpay.live/l/${row.paymentLinkId}`);
  url.searchParams.set('mode', 'card');
  url.searchParams.set('prefer', 'bnb:USDC');
  url.searchParams.set('ref', row.reference);
  return url.toString();
}

export type SessionCredit = {
  id: string; fundingRequestId: string; organizerId: number; userId: number;
  amount: number; feeCents: number; dueCents: number | null; returnedChips: number | null; usedChips: number | null;
  state: 'proposed' | 'active' | 'awaiting_payment' | 'paid' | 'declined';
  reference: string; paymentLinkId: string | null;
};
const sessionBase = '/api/marketplace/chips/session-credit';
export const sessionCreditApi = {
  list: () => request<{ sessions: SessionCredit[]; enabled: boolean }>('', undefined, sessionBase),
  propose: (fundingRequestId: string, feeCents: number) => request<SessionCredit>('', { fundingRequestId, feeCents }, sessionBase),
  act: (id: string, action: 'accept' | 'decline' | 'finish' | 'link' | 'verify', body: object = {}) => request<SessionCredit>(`/${encodeURIComponent(id)}/${action}`, body, sessionBase),
};
