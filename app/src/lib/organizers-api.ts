import { getToken } from './api';

export type ClubMembershipStatus = 'pending' | 'approved' | 'rejected' | 'removed' | null;
export type OrganizerClub = {
  ownerId: number; membershipActive: boolean; nick: string; avatar: string; country: string; name: string; description: string;
  entryFeeCents: number; memberCount: number; hands30d: number; tournamentEntrants30d: number;
  maxTournamentEntrants: number; cashChipRake30d: number; score: number; pluginsUsed: number; membershipStatus?: ClubMembershipStatus;
  tables?: Array<{ id: string; name: string; game: string; seats: number; minBuyin?: number }>;
};
export type ClubRequest = { userId: number; nick: string; avatar: string; country: string; status: string; message: string; createdAt: string; updatedAt: string };
export type ClubOrder = { id: string; status: string; amountCents: number; checkoutUrl: string | null };

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const token = getToken();
  const response = await fetch(path, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Organizer request failed (${response.status}).`);
  return data as T;
}

export const organizersApi = {
  list: (search = '', sort: 'rank' | 'newest' = 'rank') => request<{ clubs: OrganizerClub[]; total: number }>(`/api/organizers?search=${encodeURIComponent(search)}&sort=${sort}`),
  profile: (id: number) => request<OrganizerClub>(`/api/organizers/${id}`),
  saveProfile: (body: { name: string; description: string; entryFeeCents: number }) => request<OrganizerClub>('/api/organizers/me/profile', 'POST', body),
  knock: (id: number, message: string) => request<{ status: string }>(`/api/organizers/${id}/knock`, 'POST', { message }),
  requests: () => request<{ requests: ClubRequest[] }>('/api/organizers/me/requests'),
  respond: (userId: number, decision: 'approved' | 'rejected') => request<{ status: string }>(`/api/organizers/me/requests/${userId}/respond`, 'POST', { decision }),
  leave: (id: number) => request<{ status: string }>(`/api/organizers/${id}/leave`, 'POST', {}),
  entry: (id: number) => request<{ order: ClubOrder; paymentReady: boolean }>(`/api/organizers/${id}/entry`, 'POST', {}),
  order: (id: string) => request<{ order: ClubOrder; membership?: { status: string } | null }>(`/api/club-entry/orders/${encodeURIComponent(id)}`),
  verify: (id: string, paymentId: string) => request<{ order: ClubOrder; membership?: { status: string } | null }>(`/api/club-entry/orders/${encodeURIComponent(id)}/verify`, 'POST', { paymentId }),
};
