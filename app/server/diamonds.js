import { randomUUID } from 'node:crypto';

export const DIAMOND_ISSUANCE_COST = 10_000;
const MAX_TOTAL = 9_000_000_000;
const NON_GUEST = `(length(login)<>18 OR substr(login,1,6)<>'guest_' OR substr(login,15,1)<>'-' OR lower(substr(login,7,8) || substr(login,16,3)) NOT GLOB '${'[0-9a-f]'.repeat(11)}')`;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const whole = (value, name, max = MAX_TOTAL) => { if (!Number.isSafeInteger(value) || value < 1 || value > max) fail(`${name} must be a whole number from 1 to ${max}.`); return value; };
const key = value => { if (typeof value !== 'string' || !/^[A-Za-z0-9:_-]{8,120}$/.test(value)) fail('Invalid idempotency key.'); return value; };

export function createDiamonds({ db, chips, clubs, now = () => new Date().toISOString(), enabled = true, assertMovementAllowed }) {
  if (typeof assertMovementAllowed !== 'function') throw new TypeError('assertMovementAllowed is required.');
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizer_diamond_offers(organizer_id INTEGER PRIMARY KEY,price_cash_chips INTEGER NOT NULL CHECK(price_cash_chips BETWEEN 1 AND ${MAX_TOTAL}),updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS organizer_diamond_requests(id TEXT PRIMARY KEY,organizer_id INTEGER NOT NULL,user_id INTEGER NOT NULL,quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10000),price_cash_chips INTEGER NOT NULL CHECK(price_cash_chips BETWEEN 1 AND ${MAX_TOTAL}),state TEXT NOT NULL CHECK(state IN ('requested','approved','rejected','cancelled')),key TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(user_id,key));
    CREATE TABLE IF NOT EXISTS organizer_diamond_balances(organizer_id INTEGER NOT NULL,user_id INTEGER NOT NULL,balance INTEGER NOT NULL CHECK(balance BETWEEN 0 AND ${MAX_TOTAL}),PRIMARY KEY(organizer_id,user_id));
    CREATE TABLE IF NOT EXISTS organizer_diamond_issuances(request_id TEXT PRIMARY KEY,organizer_id INTEGER NOT NULL,user_id INTEGER NOT NULL,quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10000),created_at TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS organizer_diamond_requests_insert_guard BEFORE INSERT ON organizer_diamond_requests WHEN NEW.quantity NOT BETWEEN 1 AND 10000 OR NEW.price_cash_chips NOT BETWEEN 1 AND ${MAX_TOTAL} OR NEW.state NOT IN ('requested','approved','rejected','cancelled') BEGIN SELECT RAISE(ABORT,'invalid diamond request'); END;
    CREATE TRIGGER IF NOT EXISTS organizer_diamond_requests_update_guard BEFORE UPDATE ON organizer_diamond_requests WHEN NEW.quantity NOT BETWEEN 1 AND 10000 OR NEW.price_cash_chips NOT BETWEEN 1 AND ${MAX_TOTAL} OR NEW.state NOT IN ('requested','approved','rejected','cancelled') BEGIN SELECT RAISE(ABORT,'invalid diamond request'); END;
    CREATE TRIGGER IF NOT EXISTS organizer_diamond_balances_insert_guard BEFORE INSERT ON organizer_diamond_balances WHEN NEW.balance NOT BETWEEN 0 AND ${MAX_TOTAL} BEGIN SELECT RAISE(ABORT,'invalid diamond balance'); END;
    CREATE TRIGGER IF NOT EXISTS organizer_diamond_balances_update_guard BEFORE UPDATE ON organizer_diamond_balances WHEN NEW.balance NOT BETWEEN 0 AND ${MAX_TOTAL} BEGIN SELECT RAISE(ABORT,'invalid diamond balance'); END;
    CREATE TRIGGER IF NOT EXISTS organizer_diamond_issuances_no_update BEFORE UPDATE ON organizer_diamond_issuances BEGIN SELECT RAISE(ABORT,'diamond issuance journal is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS organizer_diamond_issuances_no_delete BEFORE DELETE ON organizer_diamond_issuances BEGIN SELECT RAISE(ABORT,'diamond issuance journal is immutable'); END;
  `);
  const active = id => db.prepare(`SELECT id,nick FROM users WHERE id=? AND COALESCE(banned,0)=0 AND deleted_at IS NULL AND ${NON_GUEST}`).get(id) || fail('Active permanent user required.', 403);
  const owner = id => {
    const user = active(id);
    const membership = db.prepare("SELECT 1 ok FROM organizer_billing_memberships WHERE user_id=? AND role='organizer' AND active=1 AND julianday(expires_at)>julianday(?)").get(id, now());
    if (!membership) fail('Active organizer membership required.', 403);
    return user;
  };
  const row = raw => raw && ({ id: raw.id, organizerId: raw.organizer_id, organizerName: raw.organizer_name, userId: raw.user_id, userName: raw.user_name, quantity: raw.quantity, priceCashChips: raw.price_cash_chips, totalCashChips: raw.quantity * raw.price_cash_chips, state: raw.state, createdAt: raw.created_at, updatedAt: raw.updated_at });
  const select = id => row(db.prepare(`SELECT r.*,o.nick organizer_name,u.nick user_name FROM organizer_diamond_requests r JOIN users o ON o.id=r.organizer_id JOIN users u ON u.id=r.user_id WHERE r.id=?`).get(id));
  const getRaw = id => db.prepare('SELECT * FROM organizer_diamond_requests WHERE id=?').get(id) || fail('Diamond request not found.', 404);
  const catalog = () => ({ enabled, issuanceCostCashChips: DIAMOND_ISSUANCE_COST, offers: db.prepare(`SELECT d.organizer_id organizerId,u.nick organizerName,d.price_cash_chips priceCashChips FROM organizer_diamond_offers d JOIN users u ON u.id=d.organizer_id JOIN organizer_billing_memberships m ON m.user_id=u.id AND m.role='organizer' WHERE COALESCE(u.banned,0)=0 AND u.deleted_at IS NULL AND ${NON_GUEST.replaceAll('login', 'u.login')} AND m.active=1 AND julianday(m.expires_at)>julianday(?) ORDER BY u.nick`).all(now()) });
  const list = userId => {
    active(userId);
    return { enabled, balances: db.prepare(`SELECT b.organizer_id organizerId,o.nick organizerName,b.balance FROM organizer_diamond_balances b JOIN users o ON o.id=b.organizer_id WHERE b.user_id=? ORDER BY o.nick`).all(userId), requests: db.prepare(`SELECT r.*,o.nick organizer_name,u.nick user_name FROM organizer_diamond_requests r JOIN users o ON o.id=r.organizer_id JOIN users u ON u.id=r.user_id WHERE (r.user_id=? OR r.organizer_id=?) AND (r.state='requested' OR r.id IN (SELECT id FROM organizer_diamond_requests WHERE (user_id=? OR organizer_id=?) AND state<>'requested' ORDER BY created_at DESC,id DESC LIMIT 100)) ORDER BY r.created_at DESC,r.id DESC`).all(userId, userId, userId, userId).map(row) };
  };
  const offer = ({ userId, priceCashChips }) => {
    if (!enabled) fail('Diamond issuance is disabled.', 409); owner(userId); whole(priceCashChips, 'priceCashChips');
    db.prepare('INSERT INTO organizer_diamond_offers VALUES(?,?,?) ON CONFLICT(organizer_id) DO UPDATE SET price_cash_chips=excluded.price_cash_chips,updated_at=excluded.updated_at').run(userId, priceCashChips, now());
    return catalog().offers.find(item => item.organizerId === userId);
  };
  const request = ({ userId, organizerId, quantity, priceCashChips, key: requestKey }) => {
    if (!enabled) fail('Diamond issuance is disabled.', 409); active(userId); owner(organizerId); if (userId === organizerId) fail('Organizer cannot request from self.');
    quantity = whole(quantity, 'quantity', 10_000); priceCashChips = whole(priceCashChips, 'priceCashChips'); requestKey = key(requestKey);
    if (quantity * priceCashChips > MAX_TOTAL) fail('Diamond request total is too large.');
    if (!clubs.canEnter(organizerId, userId)) fail('Approved club membership required.', 403);
    const replay = db.prepare('SELECT * FROM organizer_diamond_requests WHERE user_id=? AND key=?').get(userId, requestKey);
    if (replay) { if (replay.organizer_id !== organizerId || replay.quantity !== quantity || replay.price_cash_chips !== priceCashChips) fail('Idempotency key already used with different terms.', 409); return select(replay.id); }
    const current = db.prepare('SELECT price_cash_chips FROM organizer_diamond_offers WHERE organizer_id=?').get(organizerId);
    if (!current || current.price_cash_chips !== priceCashChips) fail('Diamond price changed; refresh the offer.', 409);
    const stamp = now(), id = randomUUID();
    db.prepare("INSERT INTO organizer_diamond_requests VALUES(?,?,?,?,?,'requested',?,?,?)").run(id, organizerId, userId, quantity, priceCashChips, requestKey, stamp, stamp);
    return select(id);
  };
  const action = ({ userId, id, operation }) => {
    const existing = getRaw(id);
    active(userId);
    if (operation === 'cancel' && userId !== existing.user_id) fail('Only the requesting player can cancel.', 403);
    if (operation !== 'cancel' && userId !== existing.organizer_id) fail('Only the organizer can decide this request.', 403);
    if (operation === 'approve' && !enabled) fail('Diamond issuance is disabled.', 409);
    if (existing.state !== 'requested') { if ((operation === 'approve' && existing.state === 'approved') || existing.state === `${operation}ed` || (operation === 'cancel' && existing.state === 'cancelled')) return select(id); fail('Request is already resolved.', 409); }
    if (operation === 'approve') {
      owner(userId); active(existing.user_id);
      if (!clubs.canEnter(existing.organizer_id, existing.user_id)) fail('Approved club membership required.', 403);
      assertMovementAllowed({ organizerId: existing.organizer_id, userId: existing.user_id, kind: 'diamond_purchase' });
      const issuance = existing.quantity * DIAMOND_ISSUANCE_COST, retail = existing.quantity * existing.price_cash_chips;
      if (!Number.isSafeInteger(issuance) || !Number.isSafeInteger(retail)) fail('Diamond total is too large.');
      db.exec('BEGIN IMMEDIATE');
      try {
        const locked = db.prepare('SELECT state FROM organizer_diamond_requests WHERE id=?').get(id);
        if (locked.state !== 'requested') { db.exec('COMMIT'); return select(id); }
        chips.moveInTransaction({ organizerId: existing.organizer_id, from: `wallet:${existing.organizer_id}`, to: 'burn', amount: issuance, kind: 'diamond_issue', reference: `diamond:${id}:issue` });
        chips.moveInTransaction({ organizerId: existing.organizer_id, from: `wallet:${existing.user_id}`, to: `wallet:${existing.organizer_id}`, amount: retail, kind: 'diamond_retail', reference: `diamond:${id}:retail` });
        const prior = db.prepare('SELECT balance FROM organizer_diamond_balances WHERE organizer_id=? AND user_id=?').get(existing.organizer_id, existing.user_id)?.balance || 0;
        if (prior + existing.quantity > MAX_TOTAL) fail('Diamond balance limit exceeded.', 409);
        db.prepare('INSERT INTO organizer_diamond_issuances VALUES(?,?,?,?,?)').run(id, existing.organizer_id, existing.user_id, existing.quantity, now());
        db.prepare('INSERT INTO organizer_diamond_balances VALUES(?,?,?) ON CONFLICT(organizer_id,user_id) DO UPDATE SET balance=balance+excluded.balance').run(existing.organizer_id, existing.user_id, existing.quantity);
        db.prepare("UPDATE organizer_diamond_requests SET state='approved',updated_at=? WHERE id=? AND state='requested'").run(now(), id);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    } else db.prepare('UPDATE organizer_diamond_requests SET state=?,updated_at=? WHERE id=?').run(operation === 'reject' ? 'rejected' : 'cancelled', now(), id);
    return select(id);
  };
  const reconcile = () => db.prepare(`SELECT i.organizer_id organizerId,i.user_id userId,i.issued,COALESCE(b.balance,0) balance FROM (SELECT organizer_id,user_id,SUM(quantity) issued FROM organizer_diamond_issuances GROUP BY organizer_id,user_id) i LEFT JOIN organizer_diamond_balances b ON b.organizer_id=i.organizer_id AND b.user_id=i.user_id WHERE i.issued<>COALESCE(b.balance,0) UNION ALL SELECT b.organizer_id,b.user_id,0 issued,b.balance FROM organizer_diamond_balances b WHERE b.balance<>0 AND NOT EXISTS(SELECT 1 FROM organizer_diamond_issuances i WHERE i.organizer_id=b.organizer_id AND i.user_id=b.user_id)`).all();
  return { catalog, list, offer, request, approve: args => action({ ...args, operation: 'approve' }), reject: args => action({ ...args, operation: 'reject' }), cancel: args => action({ ...args, operation: 'cancel' }), reconcile };
}
