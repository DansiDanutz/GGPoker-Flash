import test from 'node:test';
import assert from 'node:assert/strict';
import { marketplaceAuthDestination, resolveEntryRoute } from '../src/lib/entryRoute.ts';

test('clean marketplace and owner URLs survive a direct visit or refresh', () => {
  assert.equal(resolveEntryRoute('', '/marketplace', '', '/'), '/marketplace');
  assert.equal(resolveEntryRoute('', '/marketplace/', '', '/'), '/marketplace');
  assert.equal(resolveEntryRoute('', '/marketplace/admin', '', '/'), '/admin?section=marketplace');
  assert.equal(resolveEntryRoute('', '/admin', '?section=users', '/'), '/admin?section=users');
});

test('explicit hash navigation wins over the clean URL, including login and game routes', () => {
  assert.equal(resolveEntryRoute('#/login?returnTo=marketplace', '/marketplace', '', '/'), '/login?returnTo=marketplace');
  assert.equal(resolveEntryRoute('#/table/holdem-1', '/marketplace', '', '/'), '/table/holdem-1');
  assert.equal(resolveEntryRoute('#/', '/marketplace', '', '/'), '/');
  assert.equal(resolveEntryRoute('', '/', '', '/?tab=home'), '/?tab=home');
});

test('authentication resumes only supported internal destinations', () => {
  assert.equal(marketplaceAuthDestination('/login?returnTo=marketplace'), '/marketplace');
  assert.equal(marketplaceAuthDestination('/admin?section=marketplace'), '/admin?section=marketplace');
  assert.equal(marketplaceAuthDestination('/login?returnTo=https%3A%2F%2Fexample.com'), null);
  assert.equal(marketplaceAuthDestination('/login?returnTo=//example.com'), null);
  assert.equal(marketplaceAuthDestination('/'), null);
});

test('login resumes only the private tournament named by the invitation', () => {
  assert.equal(marketplaceAuthDestination('/login?returnTo=tournaments&id=cup&invite=abc'), '/tournaments?id=cup&invite=abc');
  assert.equal(marketplaceAuthDestination('/login?returnTo=tournaments&id=cup'), null);
  assert.equal(marketplaceAuthDestination('/tournaments?id=cup&invite=abc'), '/tournaments?id=cup&invite=abc');
});
