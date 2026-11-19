import { getToken } from './api';

export const cashChips = (amount: number | null | undefined) => `${Math.round(amount || 0).toLocaleString('en-US')} Cash Chips`;
export type ChipBalance = { organizer_id: number; balance: number };
export type ChipTicket = { id: string; organizer_id: number; tournament_id: string; holder_id: number; price: number; buyin: number; fee: number; starting_stack: number; state: 'issued' | 'redeemed' | 'consumed' | 'refunded' };
export type ChipBuyback = { id: string; organizer_id: number; requester_id: number; chips: number; payment_amount: string; payment_currency: string; payment_details: string; state: 'requested' | 'reported' | 'paid' | 'cancelled' | 'rejected' | 'disputed'; processing_at?: string | null; receipt?: string; report_amount?: string; report_currency?: string; report_network?: string; report_details?: string };
export type ChipTournament = { id: string; name: string; owner_id: number; buyin: number; fee: number; starting_stack: number; mode: string; start_at: string };
export type SpinTicket = { id: string; organizer_id: number; table_id: string; holder_id: number; price: number; state: 'issued' | 'consumed' | 'refunded' };
export type ChipAccount = { mode: 'off' | 'enforce'; balances: ChipBalance[]; spinTickets: SpinTicket[]; tickets: ChipTicket[]; buybacks: ChipBuyback[]; tournaments: ChipTournament[]; organizer_supply?: unknown; grants?: unknown; tables?: Array<{ id: string; name: string; game: string; min_buyin: number; rakePercent: number; activeRound?: { state?: string } | null; maximumReserve?: number }> };

async function request<T>(path = '', body?: unknown): Promise<T> {
  const response = await fetch(`/api/marketplace/chips${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${getToken()}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `Cash Chip request failed (${response.status}).`);
  return data as T;
}
export const organizerChipsApi = {
  config: () => request<{ mode: 'off' | 'enforce'; pack: { service_cents: number; chips: number }; membership_grant: number; satellite_supported?: boolean; tournaments: ChipTournament[] }>(),
  mine: () => request<ChipAccount>('/me'),
  purchase: (packs: number, key: string) => request('/purchase', { packs, key }),
  transfer: (organizerId: number, toUserId: number, amount: number, key: string) => request('/transfer', { organizerId, toUserId, amount, key }),
  buyTicket: (tournamentId: string, key: string) => request<{ id: string }>('/tickets', { tournamentId, key }),
  transferTicket: (id: string, toUserId: number, key: string) => request(`/tickets/${encodeURIComponent(id)}/transfer`, { toUserId, key }),
  redeemTicket: (id: string) => request(`/tickets/${encodeURIComponent(id)}/redeem`, {}),
  requestBuyback: (body: { organizerId: number; amount: number; paymentAmount: string; paymentCurrency: string; paymentDetails: string; key: string }) => request('/buybacks', body),
  buyback: (id: string, action: 'accept' | 'confirm' | 'cancel' | 'reject', body: object = {}) => request(`/buybacks/${encodeURIComponent(id)}/${action}`, body),
  reportBuyback: (id: string, body: { receipt: string; paymentAmount: string; paymentCurrency: string; paymentNetwork: string; paymentDetails: string }) => request(`/buybacks/${encodeURIComponent(id)}/report`, body),
  buySpinTicket: (tableId: string, key: string) => request('/spin-tickets', { tableId, key }),
  transferSpinTicket: (id: string, toUserId: number, key: string) => request(`/spin-tickets/${encodeURIComponent(id)}/transfer`, { toUserId, key }),
  refundSpinTicket: (id: string) => request(`/spin-tickets/${encodeURIComponent(id)}/refund`, {}),
  startSpin: (id: string) => request(`/spin/${encodeURIComponent(id)}/start`, {}),
  cancelSpin: (id: string) => request(`/spin/${encodeURIComponent(id)}/cancel`, {}),
};
