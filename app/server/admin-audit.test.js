// Admin audit log: GET /api/admin/audit filters (actor, action, q, limit) and format=csv.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './test-helpers.js';
import {
  parseLimit, parseAuditQuery, csvField, toAuditCsv, DEFAULT_LIMIT, MAX_LIMIT, CSV_COLUMNS,
} from './admin-audit.js';
import { auditQuery } from '../src/lib/api.ts';

let srv;
let adminToken;
let playerToken;

const BULK_ROWS = 1100;
const TRICKY_DETAIL = 'said "hi", then\nleft';
const FORMULA_DETAIL = '=HYPERLINK("http://x")';

// Rows written straight into the server's database so every filter has a known answer.
function seedAudit(dataDir) {
  const db = new DatabaseSync(path.join(dataDir, 'ggpoker.db'));
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    const insert = db.prepare('INSERT INTO audit_log (actor,action,detail) VALUES (?,?,?)');
    db.exec('BEGIN IMMEDIATE');
    for (let i = 0; i < BULK_ROWS; i += 1) insert.run('aud_bulk', 'bulk', `row ${i}`);
    insert.run('aud_alice', 'credit', 'user 7 500');
    insert.run('aud_alice', 'mute', 'user 8');
    insert.run('aud_bob', 'credit', 'user 9 100');
    insert.run('aud_bob', 'report', TRICKY_DETAIL);
    insert.run('aud_bob', 'report', FORMULA_DETAIL);
    insert.run('aud_carol', 'note', '100% sure_thing');
    insert.run('aud_carol', 'note', '100 percent');
    db.exec('COMMIT');
  } finally {
    db.close();
  }
}

before(async () => {
  srv = await startServer();
  adminToken = await srv.login('admin', 'admin123');
  const reg = await srv.post('/api/auth/register', { body: { login: 'aud_player', nick: 'Audit Player', password: 'secret12' } });
  assert.equal(reg.status, 200, JSON.stringify(reg.data));
  playerToken = reg.data.token;
  seedAudit(srv.dataDir);
});
after(async () => { await srv.stop(); });

const audit = (query = '', token = adminToken) => srv.get(`/api/admin/audit${query}`, { token });
const stripBom = (text) => (text.startsWith('﻿') ? text.slice(1) : text);

test('parseLimit and parseAuditQuery validate input', () => {
  assert.equal(parseLimit(null), DEFAULT_LIMIT);
  assert.equal(parseLimit('abc'), DEFAULT_LIMIT);
  assert.equal(parseLimit('0'), DEFAULT_LIMIT);
  assert.equal(parseLimit('2.5'), DEFAULT_LIMIT);
  assert.equal(parseLimit('5'), 5);
  assert.equal(parseLimit('99999'), MAX_LIMIT);
  const ok = parseAuditQuery(new URLSearchParams('actor=%20bob%20&format=csv'));
  assert.deepEqual(ok, { ok: true, filters: { actor: 'bob', action: '', q: '', limit: DEFAULT_LIMIT, format: 'csv' } });
  assert.equal(parseAuditQuery(new URLSearchParams('format=xml')).ok, false);
  assert.equal(parseAuditQuery(new URLSearchParams(`q=${'x'.repeat(201)}`)).ok, false);
});

test('anonymous is 401 and a non-admin is 403, for JSON and CSV', async () => {
  for (const query of ['', '?format=csv', '?actor=aud_bob']) {
    const anon = await srv.get(`/api/admin/audit${query}`);
    assert.equal(anon.status, 401, query);
    const player = await audit(query, playerToken);
    assert.equal(player.status, 403, query);
    assert.equal(typeof player.data, 'object');
    assert.ok(!String(player.headers.get('content-type')).includes('text/csv'));
  }
});

test('no filters keeps the old shape: newest first, default limit 200', async () => {
  const res = await audit();
  assert.equal(res.status, 200);
  assert.equal(res.data.log.length, DEFAULT_LIMIT);
  const ids = res.data.log.map((r) => r.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => b - a));
  assert.deepEqual(Object.keys(res.data.log[0]).sort(), [...CSV_COLUMNS].sort());
  assert.deepEqual(res.data.filters, { actor: '', action: '', q: '', limit: DEFAULT_LIMIT });
});

test('actor, action and q each filter on their own', async () => {
  const byActor = await audit('?actor=aud_alice');
  assert.deepEqual(byActor.data.log.map((r) => r.action), ['mute', 'credit']);

  const byAction = await audit('?action=credit');
  assert.deepEqual(byAction.data.log.map((r) => r.actor), ['aud_bob', 'aud_alice']);

  const byDetail = await audit('?q=USER%209');
  assert.deepEqual(byDetail.data.log.map((r) => r.detail), ['user 9 100']);

  // LIKE wildcards in q are literal characters, not patterns.
  const percent = await audit(`?q=${encodeURIComponent('100%')}`);
  assert.deepEqual(percent.data.log.map((r) => r.detail), ['100% sure_thing']);
  const underscore = await audit('?q=_thing');
  assert.deepEqual(underscore.data.log.map((r) => r.detail), ['100% sure_thing']);

  // A value that would break naive string-built SQL matches nothing and errors nothing.
  const injection = await audit(`?actor=${encodeURIComponent("x' OR '1'='1")}`);
  assert.equal(injection.status, 200);
  assert.deepEqual(injection.data.log, []);
});

test('combined filters AND together', async () => {
  const res = await audit('?actor=aud_bob&action=credit&q=user');
  assert.deepEqual(res.data.log.map((r) => r.detail), ['user 9 100']);
  const none = await audit('?actor=aud_alice&action=report');
  assert.deepEqual(none.data.log, []);
  const bad = await audit('?format=pdf');
  assert.equal(bad.status, 400);
});

test('limit is honoured and clamped to 1000', async () => {
  assert.equal((await audit('?actor=aud_bulk&limit=5')).data.log.length, 5);
  const clamped = await audit('?actor=aud_bulk&limit=5000');
  assert.equal(clamped.data.log.length, MAX_LIMIT);
  assert.equal(clamped.data.filters.limit, MAX_LIMIT);
  assert.equal((await audit('?actor=aud_bulk&limit=-3')).data.log.length, DEFAULT_LIMIT);
});

test('csvField and toAuditCsv quote, escape and defuse formulas', () => {
  assert.equal(csvField(null), '');
  assert.equal(csvField('plain'), 'plain');
  assert.equal(csvField('a,b'), '"a,b"');
  assert.equal(csvField('say "x"'), '"say ""x"""');
  assert.equal(csvField('two\nlines'), '"two\nlines"');
  assert.equal(csvField('=1+1'), "'=1+1");
  assert.equal(csvField('-5'), "'-5");
  assert.equal(toAuditCsv([]), 'id,actor,action,detail,created_at\r\n');
});

test('format=csv sends audit.csv with a header row and correct quoting', async () => {
  const res = await audit('?format=csv&actor=aud_bob');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/csv/);
  assert.equal(res.headers.get('content-disposition'), 'attachment; filename="audit.csv"');
  const body = stripBom(res.data);
  assert.ok(body.startsWith('id,actor,action,detail,created_at\r\n'));
  const records = body.split('\r\n').filter(Boolean);
  assert.equal(records.length, 4, 'header + 3 bob rows');
  assert.match(records[1], /^\d+,aud_bob,report,"'=HYPERLINK\(""http:\/\/x""\)",/);
  assert.match(records[2], /^\d+,aud_bob,report,"said ""hi"", then\nleft",\d{4}-/);
  assert.match(records[3], /^\d+,aud_bob,credit,user 9 100,\d{4}-/);
});

test('format=csv applies the same filters and limit', async () => {
  const res = await audit('?format=csv&actor=aud_bulk&limit=3');
  const records = stripBom(res.data).split('\r\n').filter(Boolean);
  assert.equal(records.length, 4);
  assert.deepEqual(records.slice(1).map((r) => r.split(',')[3]), ['row 1099', 'row 1098', 'row 1097']);
  const empty = await audit('?format=csv&actor=nobody');
  assert.equal(stripBom(empty.data), 'id,actor,action,detail,created_at\r\n');
});

test('client auditQuery drops blank filters and adds format=csv', () => {
  assert.equal(auditQuery({}), '');
  assert.equal(auditQuery({ actor: ' admin ', action: '', q: 'a&b', limit: 500 }), 'actor=admin&q=a%26b&limit=500');
  assert.equal(auditQuery({ actor: '', action: 'credit', q: '', limit: 200 }, 'csv'), 'action=credit&limit=200&format=csv');
});
