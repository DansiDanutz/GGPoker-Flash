// Admin table duplicate: POST /api/admin/tables/duplicate copies a cash table to a new, disabled, "(copy)" table.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';
import { COPY_SUFFIX, MAX_ID_LENGTH, copyId } from './admin-table-duplicate.js';

const COPIED_COLUMNS = ['game', 'category', 'sb', 'bb', 'ante', 'min_buyin', 'max_buyin', 'seats', 'speed', 'featured', 'sort', 'min_players', 'private', 'bomb_pot'];
const ROUTE = '/api/admin/tables/duplicate';

let srv;
let adminToken;
let playerToken;
let source;
let firstCopy;

const tables = async () => (await srv.get('/api/admin/tables', { token: adminToken })).data.tables;
const duplicate = (body, token = adminToken) => srv.post(ROUTE, { token, body });
const duplicateAudit = async () => (await srv.get('/api/admin/audit?action=duplicate_table', { token: adminToken })).data.log;

before(async () => {
  srv = await startServer();
  adminToken = await srv.login('admin', 'admin123');
  const reg = await srv.post('/api/auth/register', { body: { login: 'dup_player', nick: 'Dup Player', password: 'secret12' } });
  assert.equal(reg.status, 200, JSON.stringify(reg.data));
  playerToken = reg.data.token;
  source = (await tables())[0];
  assert.ok(source, 'seeded tables exist');
});
after(async () => {
  await srv?.stop();
});

test('copyId takes the first free "-copy" id and stays within the id limit', () => {
  assert.equal(copyId('holdem-gold', () => false), `holdem-gold${COPY_SUFFIX}`);
  assert.equal(copyId('holdem-gold', (id) => id === 'holdem-gold-copy'), 'holdem-gold-copy-2');
  const long = 'x'.repeat(MAX_ID_LENGTH);
  const taken = new Set();
  for (let i = 0; i < 3; i += 1) {
    const id = copyId(long, (candidate) => taken.has(candidate));
    assert.ok(id.length <= MAX_ID_LENGTH, id);
    assert.equal(taken.has(id), false);
    taken.add(id);
  }
});

test('anonymous is 401 and a player is 403, and no table is created', async () => {
  const count = (await tables()).length;
  assert.equal((await duplicate({ id: source.id }, null)).status, 401);
  assert.equal((await duplicate({ id: source.id }, playerToken)).status, 403);
  assert.equal((await tables()).length, count);
});

test('GET is 405 for an admin', async () => {
  assert.equal((await srv.get(ROUTE, { token: adminToken })).status, 405);
});

test('duplicate copies the settings under a new id, named "(copy)", and leaves it disabled', async () => {
  const res = await duplicate({ id: source.id });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.notEqual(res.data.id, source.id);
  assert.equal(res.data.name, `${source.name} (copy)`);
  firstCopy = res.data;

  const rows = await tables();
  const copy = rows.find((t) => t.id === res.data.id);
  const original = rows.find((t) => t.id === source.id);
  assert.ok(copy, 'copy is listed');
  assert.equal(copy.enabled, 0, 'copy starts disabled');
  assert.equal(copy.name, `${source.name} (copy)`);
  for (const key of COPIED_COLUMNS) assert.deepEqual(copy[key], original[key], key);
  assert.deepEqual(original, source, 'original table is untouched');
});

test('each duplicate gets its own id and the copy is audited with both ids', async () => {
  const again = await duplicate({ id: source.id });
  assert.equal(again.status, 200);
  assert.notEqual(again.data.id, firstCopy.id);
  assert.notEqual(again.data.id, source.id);
  assert.equal((await tables()).filter((t) => t.id === again.data.id).length, 1);

  const rows = await duplicateAudit();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].actor, 'admin');
  assert.equal(rows[0].detail, `${source.id} -> ${again.data.id}`);
});

test('an unknown or missing table id is 404 or 400 and creates nothing', async () => {
  const count = (await tables()).length;
  assert.equal((await duplicate({ id: 'no-such-table' })).status, 404);
  assert.equal((await duplicate({ id: '' })).status, 400);
  assert.equal((await duplicate({})).status, 400);
  assert.equal((await tables()).length, count);
});
