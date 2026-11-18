// SPDX-License-Identifier: AGPL-3.0-only
const DAY = 86_400_000;
const MAX_FEE = 100_000;
const NON_GUEST = `(length(login)<>18 OR substr(login,1,6)<>'guest_' OR substr(login,15,1)<>'-' OR lower(substr(login,7,8) || substr(login,16,3)) NOT GLOB '${'[0-9a-f]'.repeat(11)}')`;

function fail(message, status = 400, code = 'organizer_club_invalid') {
  throw Object.assign(new Error(message), { status, code });
}
function id(value, name = 'userId') {
  if (!Number.isSafeInteger(value) || value < 1) fail(`Invalid ${name}.`);
  return value;
}
function text(value, name, max, { optional = false } = {}) {
  if (typeof value !== 'string') fail(`${name} must be text.`);
  const clean = value.trim();
  if ((!optional && !clean) || clean.length > max) fail(`${name} must contain ${optional ? `0–${max}` : `1–${max}`} characters.`);
  if (/[<>]/.test(clean)) fail(`${name} cannot contain HTML.`);
  return clean;
}

export function createOrganizerClubs({ db, now = Date.now }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizer_club_profiles (
      owner_id INTEGER PRIMARY KEY REFERENCES users(id), name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      entry_fee_cents INTEGER NOT NULL DEFAULT 100 CHECK(entry_fee_cents BETWEEN 0 AND 100000),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS organizer_club_members (
      organizer_id INTEGER NOT NULL REFERENCES users(id), user_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','removed')), message TEXT NOT NULL DEFAULT '' CHECK(length(message)<=500),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(organizer_id,user_id)
    );
    CREATE INDEX IF NOT EXISTS organizer_club_members_status ON organizer_club_members(organizer_id,status,updated_at);
    CREATE INDEX IF NOT EXISTS organizer_club_hands_activity ON hands(table_id,created_at);
    CREATE INDEX IF NOT EXISTS organizer_club_tables_owner ON tables(owner_id,private,play_money);
    CREATE INDEX IF NOT EXISTS organizer_club_tournaments_owner ON tournaments(owner_id,private,play_money,status,start_at);
    CREATE INDEX IF NOT EXISTS organizer_club_chip_activity ON organizer_chip_journals(organizer_id,kind,created_at);
  `);
  const stamp = () => new Date(now()).toISOString();
  const cutoff = () => new Date(now() - 30 * DAY).toISOString();
  const activeUser = (userId) => db.prepare(`SELECT id,nick,avatar,country FROM users WHERE id=? AND banned=0 AND deleted_at IS NULL AND ${NON_GUEST}`).get(id(userId));
  const activeOrganizer = (ownerId) => {
    const user = activeUser(ownerId);
    const membership = user && db.prepare("SELECT 1 FROM organizer_billing_memberships WHERE user_id=? AND role='organizer' AND active=1 AND julianday(expires_at)>julianday(?)").get(ownerId, stamp());
    if (!membership) fail('Active organizer membership required.', 403, 'organizer_inactive');
    return user;
  };
  const profileRow = (ownerId) => db.prepare('SELECT * FROM organizer_club_profiles WHERE owner_id=?').get(ownerId);
  const publicInfo = (ownerId) => {
    const user = activeOrganizer(ownerId), profile = profileRow(ownerId);
    const memberCount = db.prepare(`SELECT COUNT(*) n FROM organizer_club_members m JOIN users u ON u.id=m.user_id
      WHERE m.organizer_id=? AND m.status='approved' AND m.user_id<>? AND u.banned=0 AND u.deleted_at IS NULL AND ${NON_GUEST.replaceAll('login', 'u.login')}`).get(ownerId, ownerId).n;
    const hands30d = db.prepare(`SELECT COUNT(*) n FROM hands h JOIN tables t ON t.id=h.table_id
      WHERE t.owner_id=? AND t.private=1 AND COALESCE(t.play_money,0)=0 AND julianday(h.created_at)>=julianday(?) AND julianday(h.created_at)<=julianday(?)`).get(ownerId, cutoff(), stamp()).n;
    const tourneys = db.prepare(`SELECT COALESCE(SUM(entrants),0) entrants,COALESCE(MAX(entrants),0) maximum FROM tournaments
      WHERE owner_id=? AND private=1 AND COALESCE(play_money,0)=0 AND status='finished' AND julianday(start_at)>=julianday(?) AND julianday(start_at)<=julianday(?)`).get(ownerId, cutoff(), stamp());
    const rake30d = db.prepare("SELECT COALESCE(SUM(amount),0) total FROM organizer_chip_journals WHERE organizer_id=? AND kind IN ('rake','spin_rake','event_fee') AND julianday(created_at)>=julianday(?) AND julianday(created_at)<=julianday(?)").get(ownerId, cutoff(), stamp()).total;
    const breakdown = { acceptedMembers: memberCount, hands30d, tournamentEntrants30d: tourneys.entrants, maxTournamentEntrants: tourneys.maximum, cashChipRake30d: rake30d };
    const score = Math.log1p(memberCount) + Math.log1p(hands30d) + Math.log1p(tourneys.entrants) + Math.log1p(tourneys.maximum) + Math.log1p(rake30d);
    return { ownerId, membershipActive: true, nick: user.nick, avatar: user.avatar || '', country: user.country || '', name: profile?.name || `${user.nick} Club`, description: profile?.description || '', entryFeeCents: profile?.entry_fee_cents ?? 100, memberCount, hands30d, tournamentEntrants30d: tourneys.entrants, maxTournamentEntrants: tourneys.maximum, cashChipRake30d: rake30d, score, breakdown };
  };
  function directory({ limit = 20, offset = 0, search = '', rank = true } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) fail('Invalid pagination.');
    search = typeof search === 'string' ? search.trim().toLowerCase().slice(0, 100) : '';
    let rows = db.prepare(`SELECT m.user_id owner_id FROM organizer_billing_memberships m JOIN users u ON u.id=m.user_id
      WHERE m.role='organizer' AND m.active=1 AND julianday(m.expires_at)>julianday(?) AND u.banned=0 AND u.deleted_at IS NULL AND ${NON_GUEST.replaceAll('login', 'u.login')}`).all(stamp()).map((row) => publicInfo(row.owner_id));
    if (search) rows = rows.filter((row) => `${row.nick} ${row.name} ${row.description} ${row.country}`.toLowerCase().includes(search));
    rows.sort((a, b) => (rank ? b.score - a.score : 0) || a.ownerId - b.ownerId);
    return { clubs: rows.slice(offset, offset + limit), total: rows.length, limit, offset };
  }
  function profile(ownerId, viewerId) {
    const club = publicInfo(id(ownerId, 'ownerId'));
    const membershipStatus = viewerId == null || viewerId === ownerId ? null : db.prepare('SELECT status FROM organizer_club_members WHERE organizer_id=? AND user_id=?').get(ownerId, id(viewerId))?.status || null;
    return { ...club, membershipStatus };
  }
  function updateProfile({ ownerId, actorId, name, description = '', entryFeeCents = 100 }) {
    ownerId = id(ownerId, 'ownerId'); actorId = id(actorId, 'actorId');
    if (actorId !== ownerId) fail('Only the club owner can update this profile.', 403, 'owner_required');
    activeOrganizer(ownerId); name = text(name, 'name', 120); description = text(description, 'description', 1000, { optional: true });
    if (!Number.isSafeInteger(entryFeeCents) || entryFeeCents < 0 || entryFeeCents > MAX_FEE) fail('Entry fee must be 0–100000 USD cents.');
    const ts = stamp();
    db.prepare(`INSERT INTO organizer_club_profiles(owner_id,name,description,entry_fee_cents,created_at,updated_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(owner_id) DO UPDATE SET name=excluded.name,description=excluded.description,entry_fee_cents=excluded.entry_fee_cents,updated_at=excluded.updated_at`).run(ownerId, name, description, entryFeeCents, ts, ts);
    return profile(ownerId, ownerId);
  }
  function requestJoin({ organizerId, userId, message = '' }) {
    organizerId = id(organizerId, 'organizerId'); userId = id(userId); activeOrganizer(organizerId); activeUser(userId) || fail('Active user required.', 403, 'user_inactive');
    if (organizerId === userId) fail('Owners already have club access.', 409, 'owner_member');
    const club = publicInfo(organizerId); if (club.entryFeeCents > 0) fail('Payment is required to join this club.', 402, 'payment_required');
    message = text(message, 'message', 500, { optional: true }); const old = db.prepare('SELECT * FROM organizer_club_members WHERE organizer_id=? AND user_id=?').get(organizerId, userId);
    if (old?.status === 'pending' || old?.status === 'approved') return { status: old.status };
    if (old?.status === 'rejected' && now() - Date.parse(old.updated_at) < DAY) fail('Wait 24 hours before applying again.', 429, 'join_cooldown');
    const ts = stamp(); db.prepare(`INSERT INTO organizer_club_members VALUES(?,?,'pending',?,?,?) ON CONFLICT(organizer_id,user_id) DO UPDATE SET status='pending',message=excluded.message,updated_at=excluded.updated_at`).run(organizerId, userId, message, ts, ts);
    return { status: 'pending' };
  }
  function respond({ organizerId, actorId, userId, decision }) {
    organizerId = id(organizerId, 'organizerId'); if (id(actorId, 'actorId') !== organizerId) fail('Only the club owner can respond.', 403, 'owner_required'); activeOrganizer(organizerId); userId = id(userId);
    if (!['approve', 'reject'].includes(decision)) fail('Decision must be approve or reject.');
    const club = publicInfo(organizerId); if (decision === 'approve' && club.entryFeeCents > 0) fail('Paid membership requires settled payment.', 402, 'payment_required');
    const row = db.prepare('SELECT status FROM organizer_club_members WHERE organizer_id=? AND user_id=?').get(organizerId, userId);
    if (decision === 'approve' && row?.status === 'approved') return { status: 'approved' };
    if (!row || row.status !== 'pending') fail('A pending request is required.', 409, 'request_not_pending');
    const status = decision === 'approve' ? 'approved' : 'rejected'; db.prepare('UPDATE organizer_club_members SET status=?,updated_at=? WHERE organizer_id=? AND user_id=?').run(status, stamp(), organizerId, userId); return { status };
  }
  function approvePaid({ organizerId, userId }) {
    organizerId = id(organizerId, 'organizerId'); userId = id(userId); activeOrganizer(organizerId); activeUser(userId) || fail('Active user required.', 403, 'user_inactive');
    if (organizerId === userId) return { status: 'owner' }; const ts = stamp();
    db.prepare(`INSERT INTO organizer_club_members VALUES(?,?,'approved','',?,?) ON CONFLICT(organizer_id,user_id) DO UPDATE SET status='approved',updated_at=excluded.updated_at`).run(organizerId, userId, ts, ts); return { status: 'approved' };
  }
  function leave({ organizerId, userId }) {
    organizerId = id(organizerId, 'organizerId'); userId = id(userId); if (organizerId === userId) fail('Club owners cannot leave their own club.', 409, 'owner_member');
    const row = db.prepare('SELECT status FROM organizer_club_members WHERE organizer_id=? AND user_id=?').get(organizerId, userId);
    if (!row || !['pending','approved'].includes(row.status)) return { status: row?.status || null };
    db.prepare("UPDATE organizer_club_members SET status='removed',updated_at=? WHERE organizer_id=? AND user_id=?").run(stamp(), organizerId, userId); return { status: 'removed' };
  }
  function members({ organizerId, actorId, limit = 50, offset = 0 }) {
    organizerId = id(organizerId, 'organizerId'); if (id(actorId, 'actorId') !== organizerId) fail('Only the club owner can list members.', 403, 'owner_required'); activeOrganizer(organizerId);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) fail('Invalid pagination.');
    return db.prepare(`SELECT m.user_id userId,u.nick,u.avatar,u.country,m.status,m.message,m.created_at createdAt,m.updated_at updatedAt
      FROM organizer_club_members m JOIN users u ON u.id=m.user_id WHERE m.organizer_id=? ORDER BY m.updated_at DESC,m.user_id LIMIT ? OFFSET ?`).all(organizerId, limit, offset);
  }
  function canEnter(organizerId, userId) {
    try { activeOrganizer(id(organizerId, 'organizerId')); activeUser(id(userId)) || fail('inactive'); } catch { return false; }
    return organizerId === userId || db.prepare("SELECT 1 FROM organizer_club_members WHERE organizer_id=? AND user_id=? AND status='approved'").get(organizerId, userId) != null;
  }
  return { directory, profile, updateProfile, requestJoin, respond, approvePaid, leave, members, canEnter };
}
