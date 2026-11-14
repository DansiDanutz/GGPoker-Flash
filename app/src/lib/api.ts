import type { LeaderMetric, LeaderboardResponse } from './leaderboard';
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
  elo?: number;
  is_admin: boolean;
  banned: boolean;
  chat_muted?: boolean;
  country: string;
  created_at: string;
};

export type SeatedPreview = { seat: number; nick: string; stack: number; bot: boolean };

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
  /** Real occupied seats on the live table, bots included; 0 when the table is not running. */
  players: number;
  /** How many of `players` are bots. */
  bots?: number;
  /** Public seat data for the lobby preview (nick, stack, seat). */
  seated?: SeatedPreview[];
  /** Players in this table's wait list (real queue length). */
  wait: number;
  /** Caller's 1-based position in this table's wait list; 0 when not queued. */
  myWait?: number;
  avgPot: number;
  vpip: number;
  pro?: boolean;
  handsPerHour: number;
  running: boolean;
};

/** One Rush pool row from `/api/lobby` `rushPools` (P0 slice R3): every table of one game + stake. */
export type RushPool = {
  /** `game:sb/bb`, the pool the server moves players within. */
  poolKey: string;
  /** `game:sb/bb:seats`, the group wait-list key. */
  groupKey: string;
  game: string;
  category: string;
  sb: number;
  bb: number;
  seats: number;
  min_buyin: number;
  max_buyin: number;
  featured: boolean;
  /** Tables in the pool. */
  tables: number;
  /** Seated players summed across the pool's tables. */
  players: number;
  /** Always 0 until a "pro" player is defined. */
  pros: number;
  /** Hands saved across the pool in the last hour. */
  handsPerHour: number;
  /** First pool table with a free seat; null when every table is full. */
  firstFree: string | null;
  /** Table queues plus the pool's group queue. */
  wait: number;
};

/** One `/api/lobby` `rushLeaderboard` row: today's Cash Drops + Rush pot wins, play money cents. */
export type RushLeaderRow = {
  rank: number;
  userId: number;
  nick: string;
  country: string;
  won: number;
};

/** Where a wait-list queue points: one table, or any table in a lobby group (`game:sb/bb:seats`). */
export type WaitlistTarget =
  | { kind: 'table'; tableId: string; groupKey?: undefined }
  | { kind: 'group'; groupKey: string; tableId?: undefined };

/** Join answer: room was found (join the table over the socket) or the caller was queued. */
export type WaitlistJoinResult =
  | { status: 'seat'; tableId: string; seat?: number }
  | ({ status: 'queued'; position: number; size: number; queueKey: string } & WaitlistTarget);

export type WaitlistQueue = { queueKey: string; position: number; size: number; tableName?: string } & WaitlistTarget;

export type WaitlistOffer = { tableId: string; tableName: string; seat: number; deadline: number; holdMs: number };

export type MyWaitlists = { queues: WaitlistQueue[]; offers: WaitlistOffer[] };

/** SSE `waitlist_update` from /api/notifications/stream. Position 0 = no longer queued. */
export type WaitlistUpdateEvent = { type: 'waitlist_update'; queueKey: string; position: number; size: number } & WaitlistTarget;

/** Admin monitor (GET /api/admin/waitlists): one non-empty table or group queue. */
export type AdminWaitlistQueue = {
  queueKey: string;
  name: string;
  length: number;
  positions: { userId: number; nick: string; position: number; waitingMs: number }[];
  held: { userId: number; nick: string; tableId: string; tableName: string; seat: number; deadline: number; remainingMs: number }[];
  oldestWaitMs: number;
} & WaitlistTarget;

export type AdminWaitlists = { queues: AdminWaitlistQueue[]; totals: { queues: number; waiting: number; held: number } };

/** Admin chat moderation (GET /api/admin/chat): one persisted table-chat line. */
export type AdminChatLine = { id: number; channel: string; user_id: number | null; nick: string; text: string; created_at: string };

export type AdminChatTable = { tableId: string; name: string; count: number; lastAt: string };

export type AdminChatFeed = { messages: AdminChatLine[]; tables: AdminChatTable[] };

/** Admin audit log (GET /api/admin/audit): one row, newest first. */
export type AdminAuditRow = { id: number; actor: string | null; action: string; detail: string | null; created_at: string };

/** Audit filters; empty strings mean "any". `limit` is clamped server-side to 1..1000. */
export type AdminAuditFilters = { actor: string; action: string; q: string; limit: number };

export type AdminAuditPage = { log: AdminAuditRow[]; filters: AdminAuditFilters };

/** Query string for the audit route; blank filters are left out. */
export function auditQuery(filters: Partial<AdminAuditFilters>, format?: 'csv'): string {
  const entries = [
    ['actor', filters.actor?.trim() ?? ''],
    ['action', filters.action?.trim() ?? ''],
    ['q', filters.q?.trim() ?? ''],
    ['limit', filters.limit ? String(filters.limit) : ''],
    ['format', format ?? ''],
  ].filter(([, value]) => value !== '');
  return new URLSearchParams(entries).toString();
}

/** Admin transactions (GET /api/admin/transactions): every ledger column plus the user's login and nick. */
export type AdminTransactionRow = {
  id: number; user_id: number; kind: string; currency: string; amount: number; balance_after: number;
  memo: string | null; created_at: string; login: string | null; nick: string | null;
};

/** Transaction filters; empty strings mean "any". `limit` is clamped server-side to 1..1000. */
export type AdminTransactionFilters = { q: string; kind: string; limit: number };

export type AdminTransactionPage = { transactions: AdminTransactionRow[]; filters: AdminTransactionFilters };

/** Query string for the transactions route; blank filters are left out. */
export function transactionsQuery(filters: Partial<AdminTransactionFilters>, format?: 'csv'): string {
  const entries = [
    ['q', filters.q?.trim() ?? ''],
    ['kind', filters.kind?.trim() ?? ''],
    ['limit', filters.limit ? String(filters.limit) : ''],
    ['format', format ?? ''],
  ].filter(([, value]) => value !== '');
  return new URLSearchParams(entries).toString();
}

/** Admin users list (GET /api/admin/users) status filter. */
export type AdminUserStatus = 'all' | 'active' | 'admin' | 'banned' | 'muted';

/** Users-list filters. `limit` is clamped server-side to 1..200 (default 50); `offset` is 0-based. */
export type AdminUserFilters = { q: string; status: AdminUserStatus; limit: number; offset: number };

/** One page of users plus the total match count and the count of active (unbanned) admins. */
export type AdminUserPage = { users: User[]; total: number; filters: AdminUserFilters; activeAdmins: number };

/** Query string for the users list; defaults (`status=all`, `offset=0`) and empty values are omitted. */
export function usersQuery(filters: Partial<AdminUserFilters>): string {
  const entries = [
    ['q', filters.q?.trim() ?? ''],
    ['status', filters.status && filters.status !== 'all' ? filters.status : ''],
    ['limit', filters.limit ? String(filters.limit) : ''],
    ['offset', filters.offset ? String(filters.offset) : ''],
  ].filter(([, value]) => value !== '');
  return new URLSearchParams(entries).toString();
}

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

const BACKUP_FALLBACK_NAME = 'dangg-backup.db';

/** Pull a safe `dangg-backup-*.db` name out of a content-disposition header. */
export function backupFilenameFrom(disposition: string | null): string {
  const m = disposition?.match(/filename="(dangg-backup-\d{8}-\d{6}\.db)"/);
  return m ? m[1] : BACKUP_FALLBACK_NAME;
}

/** Restore uploads above this size are refused by the server (decoded bytes). */
export const RESTORE_MAX_BYTES = 6 * 1024 * 1024;
export const RESTORE_CONFIRM_WORD = 'RESTORE';

/** One server-side snapshot (GET /api/admin/backups): newest first. */
export type AdminSnapshot = { id: string; size: number; createdAt: string };
export type AdminSnapshotList = { snapshots: AdminSnapshot[]; retention: number };
export type AdminSnapshotCreated = { snapshot: AdminSnapshot & { integrity: 'ok' }; pruned: string[]; retention: number };

/** Strip the `data:<mime>;base64,` prefix from a FileReader data URL. */
export function base64FromDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma < 0 || !dataUrl.slice(0, comma).endsWith(';base64')) {
    throw new Error('Could not read the backup file');
  }
  return dataUrl.slice(comma + 1);
}

function readFileBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the backup file'));
    reader.onload = () => {
      try { resolve(base64FromDataUrl(String(reader.result))); } catch (e) { reject(e); }
    };
    reader.readAsDataURL(file);
  });
}

export const api = {
  hostTable: (data: { name: string; game: string; seats: number; sb: number; bb: number; min_buyin: number; max_buyin: number; bombPot?: boolean }) =>
    request<{ id: string }>('/api/tables/host', { method: 'POST', body: JSON.stringify(data) }),
  hostTables: () => request<{ tables: any[] }>('/api/tables/host'),
  joinTableWaitlist: (tableId: string) =>
    request<WaitlistJoinResult>(`/api/tables/${encodeURIComponent(tableId)}/waitlist`, { method: 'POST' }),
  leaveTableWaitlist: (tableId: string) =>
    request<{ ok: true; left: boolean }>(`/api/tables/${encodeURIComponent(tableId)}/waitlist`, { method: 'DELETE' }),
  joinGroupWaitlist: (groupKey: string) =>
    request<WaitlistJoinResult>(`/api/lobby/groups/${encodeURIComponent(groupKey)}/waitlist`, { method: 'POST' }),
  leaveGroupWaitlist: (groupKey: string) =>
    request<{ ok: true; left: boolean }>(`/api/lobby/groups/${encodeURIComponent(groupKey)}/waitlist`, { method: 'DELETE' }),
  myWaitlists: () => request<MyWaitlists>('/api/waitlists/me'),
  hostTournament: (data: any) => request<{ id: string }>('/api/tournaments/host', { method: 'POST', body: JSON.stringify(data) }),
  hostTournaments: () => request<{ tournaments: any[] }>('/api/tournaments/host'),
  deleteHostTournament: (id: string) => request<any>(`/api/tournaments/host/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  tournament: (id: string) => request<TournamentDetail>(`/api/tournaments/${encodeURIComponent(id)}`),
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
  notifications: (all = false) => request<{ items: any[]; unread: number }>(`/api/notifications${all ? '?all=1' : ''}`),
  mysteryFeed: () => request<{ total: number; items: any[] }>('/api/mystery/feed'),
  elo: (game: string = 'all') => request<{ leaders: any[]; me: any; game: string }>(`/api/elo${game === 'all' ? '' : '?game=' + encodeURIComponent(game)}`),
  reportPlayer: (targetId: number, reason: string, detail: string, handId?: string) => request<any>('/api/reports', { method: 'POST', body: JSON.stringify({ targetId, reason, detail, handId }) }),
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
  setHandHidden: (id: number, hidden: boolean) => request<{ ok: boolean; hidden: boolean }>(`/api/hands/${id}/hidden`, { method: 'POST', body: JSON.stringify({ hidden }) }),
  missions: () => request<{ missions: any[] }>('/api/missions'),
  claimMission: (id: string) => request<any>(`/api/missions/${id}/claim`, { method: 'POST' }),
  leaderboard: (metric: LeaderMetric = 'vip') => request<LeaderboardResponse>(`/api/leaderboard?metric=${metric}`),
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
    reports: () => request<{ reports: any[] }>('/api/admin/reports'),
    hand: (id: string) => request<{ hand: any }>(`/api/admin/hands/${encodeURIComponent(id)}`),
    reportAction: (id: number, action: 'resolve' | 'dismiss') => request<any>(`/api/admin/reports/${id}`, { method: 'POST', body: JSON.stringify({ action }) }),
    stats: () => request<any>('/api/admin/stats'),
    platform: () => request<any>('/api/admin/platform'),
    tournamentsLive: () => request<any>('/api/admin/tournaments/live'),
    snapshotTournament: (id: string) => request<any>(`/api/admin/tournaments/${encodeURIComponent(id)}/snapshot`, { method: 'POST' }),
    snapshotAllTournaments: () => request<any>('/api/admin/tournaments/snapshot-all', { method: 'POST' }),
    advanceTournamentLevel: (id: string, delta = 1) => request<any>(`/api/admin/tournaments/${encodeURIComponent(id)}/level`, { method: 'POST', body: JSON.stringify({ delta }) }),
    users: (filters: Partial<AdminUserFilters> = {}) => {
      const query = usersQuery(filters);
      return request<AdminUserPage>(`/api/admin/users${query ? `?${query}` : ''}`);
    },
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
    audit: (filters: Partial<AdminAuditFilters> = {}) => {
      const query = auditQuery(filters);
      return request<AdminAuditPage>(`/api/admin/audit${query ? `?${query}` : ''}`);
    },
    auditCsv: async (filters: Partial<AdminAuditFilters>) => {
      const r = await fetch(`/api/admin/audit?${auditQuery(filters, 'csv')}`, { headers: { authorization: `Bearer ${getToken()}` } });
      if (!r.ok) throw new Error(r.status === 403 ? 'Admin access required' : `Export failed (${r.status})`);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url; a.download = 'audit.csv'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
    transactions: (filters: Partial<AdminTransactionFilters> = {}) => {
      const query = transactionsQuery(filters);
      return request<AdminTransactionPage>(`/api/admin/transactions${query ? `?${query}` : ''}`);
    },
    transactionKinds: () => request<{ kinds: string[] }>('/api/admin/transactions/kinds'),
    transactionsCsv: async (filters: Partial<AdminTransactionFilters>) => {
      const r = await fetch(`/api/admin/transactions?${transactionsQuery(filters, 'csv')}`, { headers: { authorization: `Bearer ${getToken()}` } });
      if (!r.ok) throw new Error(r.status === 403 ? 'Admin access required' : `Export failed (${r.status})`);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url; a.download = 'transactions.csv'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
    waitlists: () => request<AdminWaitlists>('/api/admin/waitlists'),
    clearWaitlist: (target: { tableId: string } | { groupKey: string }) =>
      request<{ ok: true; removed: number; released: number }>('/api/admin/waitlists/clear', { method: 'POST', body: JSON.stringify(target) }),
    chat: (message: string) => request('/api/admin/chat', { method: 'POST', body: JSON.stringify({ message }) }),
    chatFeed: (tableId?: string, limit = 100) => {
      const query = new URLSearchParams({ limit: String(limit), ...(tableId ? { tableId } : {}) });
      return request<AdminChatFeed>(`/api/admin/chat?${query}`);
    },
    deleteChatLine: (id: number) =>
      request<{ ok: true; id: number; channel: string }>(`/api/admin/chat/${id}/delete`, { method: 'POST' }),
    saveBrand: (slot: string, dataUrl: string) => request('/api/admin/brand', { method: 'POST', body: JSON.stringify({ slot, dataUrl }) }),
    resetBrand: (slot: string) => request(`/api/admin/brand/${slot}`, { method: 'DELETE' }),
    verifications: () => request<{ verifications: any[] }>('/api/admin/verifications'),
    reviewVerification: (id: number, action: string, note: string) => request(`/api/admin/verifications/${id}`, { method: 'POST', body: JSON.stringify({ action, note }) }),
    verificationDoc: async (id: number) => {
      const r = await fetch(`/api/admin/verifications/${id}/doc`, { headers: { authorization: `Bearer ${getToken()}` } });
      if (!r.ok) throw new Error('Document unavailable');
      return r.text();
    },
    /** Download a consistent SQLite snapshot; resolves with the server-chosen filename. */
    backup: async (): Promise<string> => {
      const r = await fetch('/api/admin/backup', { headers: { authorization: `Bearer ${getToken()}` } });
      if (!r.ok) throw new Error(r.status === 403 ? 'Admin access required' : `Backup failed (${r.status})`);
      const filename = backupFilenameFrom(r.headers.get('content-disposition'));
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return filename;
    },
    /** Queue a backup restore; the server applies it on its next restart. */
    restore: async (file: Blob, confirm: string): Promise<{ ok: true; requiresRestart: true }> => {
      if (file.size > RESTORE_MAX_BYTES) throw new Error('Backup larger than 6 MB');
      const data = await readFileBase64(file);
      return request('/api/admin/restore', { method: 'POST', body: JSON.stringify({ data, confirm }) });
    },
    /** Server-side snapshots: list, create (integrity checked and pruned), download, delete, restore. */
    snapshots: () => request<AdminSnapshotList>('/api/admin/backups'),
    createSnapshot: () => request<AdminSnapshotCreated>('/api/admin/backups', { method: 'POST' }),
    deleteSnapshot: (id: string) => request<{ ok: true; deleted: string }>(`/api/admin/backups/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    restoreSnapshot: (id: string, confirm: string) => request<{ ok: true; requiresRestart: true; snapshot: string }>(
      `/api/admin/backups/${encodeURIComponent(id)}/restore`, { method: 'POST', body: JSON.stringify({ confirm }) },
    ),
    downloadSnapshot: async (id: string): Promise<void> => {
      const r = await fetch(`/api/admin/backups/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${getToken()}` } });
      if (!r.ok) throw new Error(r.status === 404 ? 'Snapshot not found' : `Download failed (${r.status})`);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url; a.download = id; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
    /** Copy a cash table to a new, disabled "(copy)" table; resolves with the new id and name. */
    duplicateTable: (id: string) => request<{ ok: true; id: string; name: string }>('/api/admin/tables/duplicate', { method: 'POST', body: JSON.stringify({ id }) }),
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
  rush: 'Fast Fold',
  rushplo: 'Fast Fold PLO',
  aof: 'All-in or Fold',
  spingold: 'Jackpot SNG',
  battleroyale: 'Battle Royale',
  flipandgo: 'Quick Flip',
};

/** GET /api/tournaments/:id — the row plus its payout table (DanGG rule). */
export interface TournamentDetail {
  tournament: any;
  prizePool: number;
  payouts: { place: number; amount: number; ticket?: string }[];
  placesPaid: number;
  bubble: number;
  playersLeft: number | null;
}
