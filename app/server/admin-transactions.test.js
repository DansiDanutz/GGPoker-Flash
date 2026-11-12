// Admin transactions: GET /api/admin/transactions filters (q, kind, limit), format=csv and /kinds.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './test-helpers.js';
import {
  parseLimit, parseTransactionsQuery, toTransactionsCsv, DEFAULT_LIMIT, MAX_LIMIT, CSV_COLUMNS,
} from './admin-transactions.js';
import { transactionsQuery } from '../src/lib/api.ts';

let srv;
let adminToken;
let playerToken;
let aliceId;
let bobId;

const BULK_ROWS = 1100;
const CSV_HEADER = 'id,user_id,login,nick,kind,amount,currency,memo,created_at';
const TRICKY_MEMO = 'paid "x", then\nleft';
const FORMULA_MEMO = '=HYPERLINK("http://x")';

async function register(login, nick) {
  const reg = await srv.post('/api/auth/register', { body: { login, nick, password: 'secret12' } });
  assert.equal(reg.status, 200, JSON.stringify(reg.data));
  const me = await srv.get('/api/me', { token: reg.data.token });
  return { token: reg.data.token, id: me.data.user.id };
}

// Rows written straight into the server's database so every filter has a known answer.
function seedTransactions(dataDir) {
  const db = new DatabaseSync(path.join(dataDir, 'ggpoker.db'));
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    const insert = db.prepare('INSERT INTO transactions (user_id,kind,currency,amount,balance_after,memo) VALUES (?,?,?,?,?,?)');
    db.exec('BEGIN IMMEDIATE');
    for (let i = 0; i < BULK_ROWS; i += 1) insert.run(bobId, 'txt_bulk', 'USD', 1, i, `bulk ${i}`);
    insert.run(aliceId, 'txt_deposit', 'USD', 500, 500, 'card top-up');
    insert.run(aliceId, 'txt_buyin', 'USD', -200, 300, 'table 42');
    insert.run(bobId, 'txt_deposit', 'USD', 100, 100, 'alice referral');
    insert.run(bobId, 'txt_memo', 'USD', -50, 50, TRICKY_MEMO);
    insert.run(bobId, 'txt_memo', 'USD', 25, 75, FORMULA_MEMO);
    insert.run(bobId, 'txt_memo', 'USD', 1, 76, '100% sure_thing');
    db.exec('COMMIT');
  } finally {
    db.close();
  }
}

before(async () => {
  srv = await startServer();
  adminToken = await srv.login('admin', 'admin123');
  playerToken = (await register('txn_player', 'Txn Player')).token;
  aliceId = (await register('txn_alice', 'Alice Txn')).id;
  bobId = (await register('txn_bob', 'Bob Txn')).id;
  seedTransactions(srv.dataDir);
});
after(async () => { await srv.stop(); });

const txns = (query = '', token = adminToken) => srv.get(`/api/admin/transactions${query}`, { token });
const stripBom = (text) => (text.startsWith('\uFEFF') ? text.slice(1) : text);

test('parseLimit and parseTransactionsQuery validate input', () => {
  assert.equal(parseLimit(null), DEFAULT_LIMIT);
  assert.equal(parseLimit('abc'), DEFAULT_LIMIT);
  assert.equal(parseLimit('0'), DEFAULT_LIMIT);
  assert.equal(parseLimit('2.5'), DEFAULT_LIMIT);
  assert.equal(parseLimit('5'), 5);
  assert.equal(parseLimit('99999'), MAX_LIMIT);
  const ok = parseTransactionsQuery(new URLSearchParams('q=%20bob%20&kind=deposit&format=csv'));
  assert.deepEqual(ok, { ok: true, filters: { q: 'bob', kind: 'deposit', limit: DEFAULT_LIMIT, format: 'csv' } });
  assert.equal(parseTransactionsQuery(new URLSearchParams('format=xml')).ok, false);
  assert.equal(parseTransactionsQuery(new URLSearchParams(`kind=${'x'.repeat(201)}`)).ok, false);
});

test('anonymous is 401 and a non-admin is 403, for JSON, CSV and kinds', async () => {
  for (const route of ['/api/admin/transactions', '/api/admin/transactions?format=csv', '/api/admin/transactions?kind=txt_memo', '/api/admin/transactions/kinds']) {
    assert.equal((await srv.get(route)).status, 401, route);
    const player = await srv.get(route, { token: playerToken });
    assert.equal(player.status, 403, route);
    assert.ok(!String(player.headers.get('content-type')).includes('text/csv'), route);
  }
});

test('no filters keeps the existing shape: transactions array, newest first, default limit 300', async () => {
  const res = await txns();
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data.transactions));
  assert.equal(res.data.transactions.length, DEFAULT_LIMIT);
  const ids = res.data.transactions.map((r) => r.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => b - a));
  const expectedKeys = ['id', 'user_id', 'kind', 'currency', 'amount', 'balance_after', 'memo', 'created_at', 'login', 'nick'];
  for (const key of expectedKeys) assert.ok(key in res.data.transactions[0], key);
  assert.equal(res.data.transactions[0].login, 'txn_bob');
  assert.equal(res.data.transactions[0].nick, 'Bob Txn');
  assert.deepEqual(res.data.filters, { q: '', kind: '', limit: DEFAULT_LIMIT });
});

test('q matches login, nick or memo; kind matches exactly', async () => {
  const byLogin = await txns('?q=TXN_ALICE');
  assert.deepEqual(byLogin.data.transactions.filter((r) => r.kind.startsWith('txt_')).map((r) => r.memo), ['table 42', 'card top-up']);

  const byNick = await txns('?q=alice%20txn');
  assert.ok(byNick.data.transactions.every((r) => r.user_id === aliceId));

  // "alice" also hits Bob's memo "alice referral".
  const byMemo = await txns('?q=alice&kind=txt_deposit');
  assert.deepEqual(byMemo.data.transactions.map((r) => r.memo), ['alice referral', 'card top-up']);

  const byKind = await txns('?kind=txt_memo');
  assert.equal(byKind.data.transactions.length, 3);
  assert.ok(byKind.data.transactions.every((r) => r.kind === 'txt_memo'));
  assert.deepEqual((await txns('?kind=txt_mem')).data.transactions, [], 'kind is exact, not a prefix');

  // LIKE wildcards are literal; injection strings match nothing.
  assert.deepEqual((await txns(`?q=${encodeURIComponent('100%')}`)).data.transactions.map((r) => r.memo), ['100% sure_thing']);
  assert.deepEqual((await txns('?q=_thing')).data.transactions.map((r) => r.memo), ['100% sure_thing']);
  const injection = await txns(`?kind=${encodeURIComponent("x' OR '1'='1")}`);
  assert.equal(injection.status, 200);
  assert.deepEqual(injection.data.transactions, []);
});

test('combined filters AND together; bad format is 400', async () => {
  const res = await txns('?q=txn_bob&kind=txt_deposit');
  assert.deepEqual(res.data.transactions.map((r) => r.memo), ['alice referral']);
  assert.deepEqual((await txns('?q=txn_alice&kind=txt_memo')).data.transactions, []);
  assert.equal((await txns('?format=pdf')).status, 400);
});

test('limit is honoured and clamped to 1000', async () => {
  assert.equal((await txns('?kind=txt_bulk&limit=5')).data.transactions.length, 5);
  const clamped = await txns('?kind=txt_bulk&limit=5000');
  assert.equal(clamped.data.transactions.length, MAX_LIMIT);
  assert.equal(clamped.data.filters.limit, MAX_LIMIT);
  assert.equal((await txns('?kind=txt_bulk&limit=-3')).data.transactions.length, DEFAULT_LIMIT);
});

test('kinds endpoint lists distinct kinds alphabetically', async () => {
  const kinds = await srv.get('/api/admin/transactions/kinds', { token: adminToken });
  assert.equal(kinds.status, 200);
  const seeded = kinds.data.kinds.filter((k) => k.startsWith('txt_'));
  assert.deepEqual(seeded, ['txt_bulk', 'txt_buyin', 'txt_deposit', 'txt_memo']);
  assert.deepEqual(kinds.data.kinds, [...new Set(kinds.data.kinds)].sort());
});

test('toTransactionsCsv keeps numbers raw and escapes text', () => {
  assert.equal(toTransactionsCsv([]), `${CSV_HEADER}\r\n`);
  assert.equal(CSV_COLUMNS.join(','), CSV_HEADER);
  const row = { id: 1, user_id: 2, login: null, nick: 'a,b', kind: 'k', amount: -50, currency: 'USD', memo: '@cmd', created_at: 't' };
  assert.equal(toTransactionsCsv([row]), `${CSV_HEADER}\r\n1,2,,"a,b",k,-50,USD,'@cmd,t\r\n`);
});

test('format=csv sends transactions.csv with BOM, header and correct quoting', async () => {
  const res = await txns('?format=csv&kind=txt_memo');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/csv/);
  assert.equal(res.headers.get('content-disposition'), 'attachment; filename="transactions.csv"');
  // fetch's text() drops a leading BOM, so check the raw bytes.
  const raw = await fetch(`${srv.base}/api/admin/transactions?format=csv&kind=txt_memo`, { headers: { authorization: `Bearer ${adminToken}` } });
  assert.deepEqual([...new Uint8Array(await raw.arrayBuffer()).slice(0, 3)], [0xef, 0xbb, 0xbf], 'starts with a UTF-8 BOM');
  const body = stripBom(res.data);
  assert.ok(body.startsWith(`${CSV_HEADER}\r\n`));
  const records = body.split('\r\n').filter(Boolean);
  assert.equal(records.length, 4, 'header + 3 memo rows');
  assert.match(records[1], new RegExp(`^\\d+,${bobId},txn_bob,Bob Txn,txt_memo,1,USD,100% sure_thing,\\d{4}-`));
  assert.match(records[2], new RegExp(`^\\d+,${bobId},txn_bob,Bob Txn,txt_memo,25,USD,"'=HYPERLINK\\(""http://x""\\)",`));
  assert.match(records[3], new RegExp(`^\\d+,${bobId},txn_bob,Bob Txn,txt_memo,-50,USD,"paid ""x"", then\\nleft",\\d{4}-`));
});

test('format=csv applies the same filters and limit', async () => {
  const res = await txns('?format=csv&kind=txt_bulk&limit=3');
  const records = stripBom(res.data).split('\r\n').filter(Boolean);
  assert.equal(records.length, 4);
  assert.deepEqual(records.slice(1).map((r) => r.split(',')[7]), ['bulk 1099', 'bulk 1098', 'bulk 1097']);
  const empty = await txns('?format=csv&kind=nothing');
  assert.equal(stripBom(empty.data), `${CSV_HEADER}\r\n`);
});

test('client transactionsQuery drops blank filters and adds format=csv', () => {
  assert.equal(transactionsQuery({}), '');
  assert.equal(transactionsQuery({ q: ' bob ', kind: '', limit: 500 }), 'q=bob&limit=500');
  assert.equal(transactionsQuery({ q: 'a&b', kind: 'deposit', limit: 300 }, 'csv'), 'q=a%26b&kind=deposit&limit=300&format=csv');
});
