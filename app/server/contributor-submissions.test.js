// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createContributorSubmissions, verifyContribution, pullNumber } from './contributor-submissions.js';
import { ensureMarketplaceSchema } from './marketplace.js';

const SHA = 'a'.repeat(40), OTHER = 'b'.repeat(40);
const registration = { id: 'test-plugin', name: 'Test Plugin', summary: 'A reviewed test plugin', version: '1.0.0', prNumber: 123, playPath: '/?play=1' };
function fixture(installed = true) {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1),(2); CREATE TABLE audit_log(actor TEXT,action TEXT,detail TEXT)');
  ensureMarketplaceSchema(db);
  let active = true, approved = true, merged = false, sha = SHA, duringVerify;
  const service = createContributorSubmissions({ db, registrations: installed ? [registration] : [],
    billing: { account: () => ({ memberships: { contributor: { active } } }) },
    commerce: { publisherForUser: (id) => ({ id: `publisher-${id}`, status: approved ? 'approved' : 'pending' }) },
    verify: async (number) => { duringVerify?.(); return { pr_number: number, head_sha: sha, author: 'test-author', merged, ci_url: 'https://github.com/OpenPoker4all/OpenPoker/actions/runs/1' }; },
  });
  return { db, service, set: (values) => { if ('active' in values) active = values.active; if ('approved' in values) approved = values.approved; if ('merged' in values) merged = values.merged; if ('sha' in values) sha = values.sha; if ('duringVerify' in values) duringVerify = values.duringVerify; } };
}
const body = { pluginId: 'test-plugin', prUrl: 'https://github.com/OpenPoker4all/OpenPoker/pull/123', notes: 'Tested locally with chip conservation and disconnect checks.' };
const review = (action, extra = {}) => ({ action, reason: 'Reviewed the implementation and test evidence.', authorConfirmed: true, ...extra });

test('membership and approved publisher are required even when local billing is disabled', async (t) => {
  const f = fixture(); t.after(() => f.db.close());
  f.set({ active: false }); await assert.rejects(f.service.submit(1, body), { status: 402 });
  f.set({ active: true, approved: false }); await assert.rejects(f.service.submit(1, body), { status: 403 });
  assert.equal(f.service.list(1).length, 0);
});

test('submission fixes the commit, is owner scoped, and replays without duplication', async (t) => {
  const f = fixture(); t.after(() => f.db.close());
  const one = await f.service.submit(1, body);
  assert.equal((await f.service.submit(1, body)).id, one.id);
  assert.equal(f.service.list(2).length, 0);
  await assert.rejects(f.service.submit(2, body), { status: 409 });
  f.set({ merged: true, sha: OTHER });
  await assert.rejects(f.service.review(one.id, review('approve'), 'admin'), /Changed commits/);
  assert.equal(f.service.list(1)[0].head_sha, SHA);
});

test('approval requires merge and author verification; publication is separate and revocable', async (t) => {
  const f = fixture(); t.after(() => f.db.close());
  const one = await f.service.submit(1, body);
  await assert.rejects(f.service.review(one.id, review('approve'), 'admin'), /must be merged/);
  f.set({ merged: true });
  await assert.rejects(f.service.review(one.id, review('publish'), 'admin'), /status approved/);
  await assert.rejects(f.service.review(one.id, review('approve', { authorConfirmed: false }), 'admin'), /Confirm/);
  await f.service.review(one.id, review('approve'), 'admin');
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM marketplace_products WHERE id='contrib-test-plugin'").get().n, 0);
  await f.service.review(one.id, review('publish'), 'admin');
  assert.equal(f.db.prepare("SELECT status FROM marketplace_products WHERE id='contrib-test-plugin'").get().status, 'available');
  assert.equal(f.service.list(1)[0].status, 'published');
  await assert.rejects(f.service.review(one.id, review('publish'), 'admin'), /status approved/);
  await f.service.review(one.id, review('revoke'), 'admin');
  assert.equal(f.db.prepare("SELECT status FROM marketplace_products WHERE id='contrib-test-plugin'").get().status, 'archived');
});

test('merged plugins cannot activate until their registration is in the running release', async (t) => {
  const f = fixture(false); t.after(() => f.db.close());
  const one = await f.service.submit(1, body); f.set({ merged: true });
  await f.service.review(one.id, review('approve'), 'admin');
  await assert.rejects(f.service.review(one.id, review('publish'), 'admin'), /Deploy the merged plugin/);
  assert.equal(f.service.list(1)[0].status, 'approved');
});

test('eligibility and status are checked again after asynchronous GitHub verification', async (t) => {
  const f = fixture(); t.after(() => f.db.close());
  f.set({ duringVerify: () => f.set({ active: false }) });
  await assert.rejects(f.service.submit(1, body), { status: 402 });
  f.set({ duringVerify: undefined, active: true, merged: true });
  const one = await f.service.submit(1, body);
  await Promise.all([f.service.review(one.id, review('approve'), 'admin'), assert.rejects(f.service.review(one.id, review('approve'), 'admin'), { status: 409 })]);
});

test('review and publication roll back if their audit cannot be recorded', async (t) => {
  const f = fixture(); t.after(() => f.db.close());
  const one = await f.service.submit(1, body); f.set({ merged: true });
  await f.service.review(one.id, review('approve'), 'admin');
  f.db.exec("CREATE TRIGGER fail_review BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT,'audit failed'); END");
  await assert.rejects(f.service.review(one.id, review('publish'), 'admin'), /audit failed/);
  assert.equal(f.service.list(1)[0].status, 'approved');
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM marketplace_products WHERE id='contrib-test-plugin'").get().n, 0);
});

test('PR URLs cannot select another host, repository, fragment or query', () => {
  assert.equal(pullNumber(body.prUrl), 123);
  for (const url of ['http://localhost/pull/123', body.prUrl + '?x=1', body.prUrl + '#x', body.prUrl.replace('OpenPoker4all', 'attacker')]) assert.throws(() => pullNumber(url));
});

test('GitHub verification uses the latest CI for the exact head and fails closed', async () => {
  let latest = 'success', wrong = false, calls = [];
  const fetcher = async (url, options) => {
    calls.push(url); assert.equal(options.redirect, 'error');
    return { ok: true, json: async () => url.includes('/pulls/') ? { base: { ref: 'main', repo: { full_name: 'OpenPoker4all/OpenPoker' } }, head: { sha: SHA }, user: { login: 'alice' }, merged: true }
      : { workflow_runs: [{ id: 2, head_sha: wrong ? OTHER : SHA, event: 'pull_request', status: 'completed', conclusion: latest }, { id: 1, head_sha: OTHER, event: 'pull_request', status: 'completed', conclusion: 'success' }] } };
  };
  assert.equal((await verifyContribution(123, { fetcher })).head_sha, SHA);
  assert.ok(calls[1].includes(`head_sha=${SHA}`));
  latest = 'failure'; await assert.rejects(verifyContribution(123, { fetcher }), /latest OpenPoker CI/);
  latest = 'success'; wrong = true; await assert.rejects(verifyContribution(123, { fetcher }), /latest OpenPoker CI/);
  await assert.rejects(verifyContribution(123, { fetcher: async () => ({ ok: false }) }), { status: 502 });
});
