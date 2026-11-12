// Private player-note label titles and native note colours over HTTP.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';

const register = async (srv, login) => {
  const res = await srv.post('/api/auth/register', { body: { login, nick: `Nick ${login}`, password: 'secret12' } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.token;
};

test('labels: owner-private, validated, and returned with notes', async () => {
  const srv = await startServer();
  try {
    const alice = await register(srv, 'pl_alice');
    const bob = await register(srv, 'pl_bob');
    assert.equal((await srv.put('/api/notes/labels', { body: { labels: Array(10).fill('') } })).status, 401);
    const titles = Array(10).fill('');
    titles[6] = 'Maniac';
    const saved = await srv.put('/api/notes/labels', { token: alice, body: { labels: titles } });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.data.labels, titles);
    const bad = await srv.put('/api/notes/labels', { token: alice, body: { labels: titles.map((t, i) => (i ? t : 'x'.repeat(21))) } });
    assert.equal(bad.status, 400);
    assert.deepEqual((await srv.get('/api/notes', { token: alice })).data.labels, titles, 'rejected write left titles intact');
    assert.deepEqual((await srv.get('/api/notes', { token: bob })).data.labels, Array(10).fill(''));
  } finally { await srv.stop(); }
});

test('notes: native colour ids stored, legacy names mapped, junk rejected', async () => {
  const srv = await startServer();
  try {
    const token = await register(srv, 'pl_carol');
    assert.equal((await srv.post('/api/notes', { token, body: { target: 'Villain', note: 'x', color: 'c6' } })).status, 200);
    assert.equal((await srv.post('/api/notes', { token, body: { target: 'Fish', note: 'y', color: 'blue' } })).status, 200);
    assert.equal((await srv.post('/api/notes', { token, body: { target: 'Bad', note: 'z', color: 'c99' } })).status, 400);
    const notes = Object.fromEntries((await srv.get('/api/notes', { token })).data.notes.map((n) => [n.target, n.color]));
    assert.deepEqual(notes, { Villain: 'c6', Fish: 'c1' });
  } finally { await srv.stop(); }
});
