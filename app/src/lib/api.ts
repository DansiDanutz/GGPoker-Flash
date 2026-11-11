export type User = {
  id: number;
  login: string;
  nick: string;
  email: string;
  avatar: string;
  balance: number;
  play_chips: number;
  tickets: number;
  gems: number;
  xp: number;
  vip_level: number;
  vip_points: number;
  is_admin: boolean;
  banned: boolean;
  chat_muted?: boolean;
  country: string;
  created_at: string;
};

export type LobbyTable = {
  id: string;
  name: string;
  game: string;
  category: string;
  sb: number;
  bb: number;
  ante: number;
  min_buyin: number;
  max_buyin: number;
  seats: number;
  speed: string;
  featured: boolean;
  private?: boolean;
  owner_id?: number | null;
  players: number;
  wait: number;
  avgPot: number;
  vpip: number;
  synthetic?: boolean;
  pro?: boolean;
  handsPerHour: number;
  running: boolean;
};

const TOKEN_KEY = 'ggpoker.token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as any) };
  if (options.body && !headers['content-type']) headers['content-type'] = 'application/json';
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    (err as any).status = res.status;
    throw err;
  }
  return data as T;
}

export const api = {
  hostTable: (data: { name: string; game: string; seats: number; sb: number; bb: number; min_buyin: number; max_buyin: number }) =>
    request<{ id: string }>('/api/tables/host', { method: 'POST', body: JSON.stringify(data) }),
  hostTables: () => request<{ tables: any[] }>('/api/tables/host'),
  hostTournament: (data: any) => request<{ id: string }>('/api/tournaments/host', { method: 'POST', body: JSON.stringify(data) }),
  hostTournaments: () => request<{ tournaments: any[] }>('/api/tournaments/host'),
  deleteHostTournament: (id: string) => request<any>(`/api/tournaments/host/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  tournament: (id: string) => request<{ tournament: any }>(`/api/tournaments/${encodeURIComponent(id)}`),
  deleteHostTable: (id: string) => request<any>(`/api/tables/host/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  hostMutes: (id: string) => request<{ muted: any[] }>(`/api/tables/host/${encodeURIComponent(id)}/mutes`),
  muteHostPlayer: (id: string, userId: number, muted: boolean) => request<any>(`/api/tables/host/${encodeURIComponent(id)}/mutes`, { method: 'POST', body: JSON.stringify({ userId, muted }) }),
  login: (login: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ login, password }) }),
  register: (data: { login: string; nick: string; password: string; email?: string }) =>
    request<{ token: string; user: User }>('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User; settings: any }>('/api/me'),
  saveSettings: (settings: any) => request('/api/me/settings', { method: 'POST', body: JSON.stringify(settings) }),
  setNick: (nick: string) => request<{ nick: string }>('/api/me/nick', { method: 'POST', body: JSON.stringify({ nick }) }),
  setAvatar: (avatar: string) => request('/api/me/avatar', { method: 'POST', body: JSON.stringify({ avatar }) }),
  lobby: () => request<any>('/api/lobby'),
  brand: () => request<{ logo?: string; promo?: string }>('/api/brand'),
  tournaments: () => request<{ tournaments: any[]; registered: string[] }>('/api/tournaments'),
  registerTourney: (id: string) => request(`/api/tournaments/${id}/register`, { method: 'POST' }),
  unregisterTourney: (id: string) => request(`/api/tournaments/${id}/unregister`, { method: 'POST' }),
  cashier: () => request<any>('/api/cashier'),
  notifications: () => request<{ items: any[]; unread: number }>('/api/notifications'),
  markNotificationsRead: (keys: string[]) => request<any>('/api/notifications/read', { method: 'POST', body: JSON.stringify({ keys }) }),
  messages: () => request<{ threads: any[] }>('/api/messages'),
  userProfile: (id: number) => request<any>(`/api/users/${id}/profile`),
  addFriend: (nick: string) => request<any>('/api/friends/requests', { method: 'POST', body: JSON.stringify({ nick }) }),
  friendRequests: () => request<{ incoming: any[]; outgoing: any[] }>('/api/friends/requests'),
  respondFriendRequest: (fromId: number, action: 'accept' | 'decline') => request<any>(`/api/friends/requests/${fromId}`, { method: 'POST', body: JSON.stringify({ action }) }),
  messageThread: (peerId: number) => request<{ messages: any[] }>(`/api/messages/${peerId}`),
  sendMessage: (peerId: number, message: string) => request<any>('/api/messages', { method: 'POST', body: JSON.stringify({ peerId, message }) }),
  claimBonus: (id: string) => request<any>('/api/cashier/bonus', { method: 'POST', body: JSON.stringify({ id }) }),
  deposit: (amount: number, method?: string, key?: string) => request<any>('/api/cashier/deposit', { method: 'POST', headers: key ? { 'idempotency-key': key } : {}, body: JSON.stringify({ amount, method }) }),
  withdraw: (amount: number, method?: string, key?: string) => request<any>('/api/cashier/withdraw', { method: 'POST', headers: key ? { 'idempotency-key': key } : {}, body: JSON.stringify({ amount, method }) }),
  hands: () => request<{ hands: any[] }>('/api/hands'),
  missions: () => request<{ missions: any[] }>('/api/missions'),
  claimMission: (id: string) => request<any>(`/api/missions/${id}/claim`, { method: 'POST' }),
  leaderboard: () => request<{ leaders: any[] }>('/api/leaderboard'),
  ocean: () => request<any>('/api/ocean'),
  buyOcean: (item: string) => request<any>('/api/ocean/buy', { method: 'POST', body: JSON.stringify({ item }) }),
  sessions: () => request<{ sessions: any[] }>('/api/sessions'),
  revokeSession: (token: string) => request<any>(`/api/sessions/${token}`, { method: 'DELETE' }),
  revokeOtherSessions: () => request<any>('/api/sessions', { method: 'DELETE' }),
  changePassword: (current: string, next: string) => request<any>('/api/password', { method: 'POST', body: JSON.stringify({ current, next }) }),
  friends: () => request<{ friends: any[] }>('/api/friends'),
  removeFriend: (id: number) => request<any>(`/api/friends/${id}`, { method: 'DELETE' }),
  honeymoon: () => request<any>('/api/honeymoon'),
  claimHoneymoon: (step: string) => request<any>('/api/honeymoon/claim', { method: 'POST', body: JSON.stringify({ step }) }),
  ggcare: () => request<any>('/api/ggcare'),
  claimCare: () => request<any>('/api/ggcare/claim', { method: 'POST' }),
  spin: () => request<any>('/api/rewards/spin', { method: 'POST' }),
  admin: {
    stats: () => request<any>('/api/admin/stats'),
    users: (q = '') => request<{ users: User[] }>(`/api/admin/users?q=${encodeURIComponent(q)}`),
    userAction: (id: number, body: any) => request(`/api/admin/users/${id}`, { method: 'POST', body: JSON.stringify(body) }),
    tables: () => request<{ tables: any[] }>('/api/admin/tables'),
    saveTable: (body: any) => request('/api/admin/tables', { method: 'POST', body: JSON.stringify(body) }),
    tournaments: () => request<{ tournaments: any[] }>('/api/admin/tournaments'),
    saveTournament: (body: any) => request('/api/admin/tournaments', { method: 'POST', body: JSON.stringify(body) }),
    banners: () => request<{ banners: any[] }>('/api/admin/banners'),
    saveBanner: (body: any) => request('/api/admin/banners', { method: 'POST', body: JSON.stringify(body) }),
    missions: () => request<{ missions: any[] }>('/api/admin/missions'),
    saveMission: (body: any) => request('/api/admin/missions', { method: 'POST', body: JSON.stringify(body) }),
    settings: () => request<{ settings: any }>('/api/admin/settings'),
    saveSettings: (body: any) => request('/api/admin/settings', { method: 'POST', body: JSON.stringify(body) }),
    audit: () => request<{ log: any[] }>('/api/admin/audit'),
    transactions: () => request<{ transactions: any[] }>('/api/admin/transactions'),
    chat: (message: string) => request('/api/admin/chat', { method: 'POST', body: JSON.stringify({ message }) }),
    saveBrand: (slot: string, dataUrl: string) => request('/api/admin/brand', { method: 'POST', body: JSON.stringify({ slot, dataUrl }) }),
    resetBrand: (slot: string) => request(`/api/admin/brand/${slot}`, { method: 'DELETE' }),
    verifications: () => request<{ verifications: any[] }>('/api/admin/verifications'),
    reviewVerification: (id: number, action: string, note: string) => request(`/api/admin/verifications/${id}`, { method: 'POST', body: JSON.stringify({ action, note }) }),
    verificationDoc: async (id: number) => {
      const r = await fetch(`/api/admin/verifications/${id}/doc`, { headers: { authorization: `Bearer ${getToken()}` } });
      if (!r.ok) throw new Error('Document unavailable');
      return r.text();
    },
    exportCsv: async (kind: string) => {
      const r = await fetch(`/api/admin/export/${kind}`, { headers: { authorization: `Bearer ${getToken()}` } });
      if (!r.ok) throw new Error('Export failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `dangro-${kind}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
  },
};

export function money(cents: number | null | undefined, compact = false) {
  const v = (cents || 0) / 100;
  if (compact) {
    if (Math.abs(v) >= 1000) return '$' + (v / 1000).toFixed(v >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return '$' + Math.round(v).toLocaleString('en-US');
  }
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function chips(cents: number) {
  return (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export const GAME_LABEL: Record<string, string> = {
  holdem: "Hold'em",
  omaha: 'PLO',
  omaha5: 'PLO5',
  omaha6: 'PLO6',
  shortdeck: 'Short Deck',
  rush: 'Rush & Cash',
  aof: 'All-in or Fold',
  spingold: 'Spin & Gold',
  battleroyale: 'Mystery Battle Royale',
  flipandgo: 'Flip & Go',
};
