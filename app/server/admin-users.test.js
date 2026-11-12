// Admin role management (P1 slice A1): POST /api/admin/users/:id { action: 'set_admin', admin }.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';

const PUBLIC_USER_KEYS = [
  'avatar', 'balance', 'banned', 'chat_muted', 'country', 'created_at', 'elo', 'email', 'gems', 'id',
  'is_admin', 'login', 'nick', 'play_chips', 'tickets', 'vip_level', 'vip_points', 'xp',
].sort();

const register = async (srv, login) => {
  const res = await srv.post('/api/auth/register', { body: { login, nick: `Nick ${login}`, password: 'secret12' } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return { token: res.data.token, id: res.data.user.id };
};
const setAdmin = (srv, token, id, admin) => srv.post(`/api/admin/users/${id}`, { token, body: { action: 'set_admin', admin } });
const auditRows = async (srv, token) => (await srv.get('/api/admin/audit', { token })).data.log;
const userRow = async (srv, token, login) => (await srv.get(`/api/admin/users?q=${login}`, { token })).data.users.find((u) => u.login === login);

test('set_admin: anonymous gets 401, non-admin gets 403 and nothing changes', async () => {
  const srv = await startServer();
  try {
    const plain = await register(srv, 'au_plain');
    const anon = await setAdmin(srv, undefined, plain.id, true);
    assert.equal(anon.status, 401);
    const self = await setAdmin(srv, plain.token, plain.id, true);
    assert.equal(self.status, 403);
    const me = await srv.get('/api/me', { token: plain.token });
    assert.equal(me.data.user.is_admin, false);
  } finally { await srv.stop(); }
});

test('set_admin: grant and revoke update the role and write audit rows', async () => {
  const srv = await startServer();
  try {
    const admin = await srv.login('admin', 'admin123');
    const target = await register(srv, 'au_target');

    const grant = await setAdmin(srv, admin, target.id, true);
    assert.equal(grant.status, 200, JSON.stringify(grant.data));
    assert.equal(grant.data.user.is_admin, true);
    assert.equal((await userRow(srv, admin, 'au_target')).is_admin, true);
    // The new admin can now reach admin routes.
    assert.equal((await srv.get('/api/admin/users', { token: target.token })).status, 200);

    const revoke = await setAdmin(srv, admin, target.id, false);
    assert.equal(revoke.status, 200, JSON.stringify(revoke.data));
    assert.equal(revoke.data.user.is_admin, false);
    assert.equal((await srv.get('/api/admin/users', { token: target.token })).status, 403);

    const log = await auditRows(srv, admin);
    const grantRow = log.find((r) => r.action === 'grant_admin');
    const revokeRow = log.find((r) => r.action === 'revoke_admin');
    assert.ok(grantRow && revokeRow, 'both audit rows exist');
    assert.equal(grantRow.actor, 'admin');
    assert.equal(revokeRow.actor, 'admin');
    assert.match(grantRow.detail, new RegExp(`user ${target.id} \\(au_target\\)`));
    assert.match(revokeRow.detail, new RegExp(`user ${target.id} \\(au_target\\)`));
  } finally { await srv.stop(); }
});

test('set_admin: a no-op change succeeds without an audit row', async () => {
  const srv = await startServer();
  try {
    const admin = await srv.login('admin', 'admin123');
    const target = await register(srv, 'au_noop');
    const res = await setAdmin(srv, admin, target.id, false);
    assert.equal(res.status, 200);
    assert.equal(res.data.changed, false);
    const log = await auditRows(srv, admin);
    assert.equal(log.filter((r) => r.action === 'revoke_admin' || r.action === 'grant_admin').length, 0);
  } finally { await srv.stop(); }
});

test('set_admin: refuses to remove the last remaining admin with 409', async () => {
  const srv = await startServer();
  try {
    const admin = await srv.login('admin', 'admin123');
    const me = (await srv.get('/api/me', { token: admin })).data.user;

    const last = await setAdmin(srv, admin, me.id, false);
    assert.equal(last.status, 409);
    assert.match(last.data.error, /last remaining admin/i);
    assert.equal((await srv.get('/api/me', { token: admin })).data.user.is_admin, true);

    // With a second admin in place, the first may step down; then the second is the last one.
    const second = await register(srv, 'au_second');
    assert.equal((await setAdmin(srv, admin, second.id, true)).status, 200);
    assert.equal((await setAdmin(srv, admin, me.id, false)).status, 200);
    const again = await setAdmin(srv, second.token, second.id, false);
    assert.equal(again.status, 409);
    assert.equal((await auditRows(srv, second.token)).filter((r) => r.action === 'revoke_admin').length, 1);
  } finally { await srv.stop(); }
});

test('set_admin: validates the target and the admin flag', async () => {
  const srv = await startServer();
  try {
    const admin = await srv.login('admin', 'admin123');
    assert.equal((await setAdmin(srv, admin, 999999, true)).status, 404);
    const target = await register(srv, 'au_bad');
    for (const bad of ['yes', 1, null, undefined]) {
      const res = await setAdmin(srv, admin, target.id, bad);
      assert.equal(res.status, 400, `admin=${JSON.stringify(bad)}`);
    }
    assert.equal((await userRow(srv, admin, 'au_bad')).is_admin, false);
  } finally { await srv.stop(); }
});

test('publicUser exposes only the documented fields (no password or extras)', async () => {
  const srv = await startServer();
  try {
    const admin = await srv.login('admin', 'admin123');
    const target = await register(srv, 'au_leak');
    const grant = await setAdmin(srv, admin, target.id, true);
    assert.deepEqual(Object.keys(grant.data.user).sort(), PUBLIC_USER_KEYS);
    const listed = await userRow(srv, admin, 'au_leak');
    assert.deepEqual(Object.keys(listed).sort(), PUBLIC_USER_KEYS);
    assert.equal(listed.password, undefined);
  } finally { await srv.stop(); }
});
