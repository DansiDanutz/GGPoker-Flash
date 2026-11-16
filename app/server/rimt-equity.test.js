import test from 'node:test';
import assert from 'node:assert/strict';
import { holdemEquity, holdemRank7 } from './rimt-equity.js';

test('exact turn equity enumerates every remaining river', () => {
  assert.deepEqual(holdemEquity(['Ac', 'Ad'], ['Kc', 'Kd'], ['2c', '3d', '7h', '9s']), { wins: [42, 2], ties: 0, total: 44 });
  assert.deepEqual(holdemEquity(['Kc', 'Kd'], ['Ac', 'Ad'], ['2c', '3d', '7h', '9s']), { wins: [2, 42], ties: 0, total: 44 });
});

test('equity includes tied runouts and tied board straights', () => {
  assert.deepEqual(holdemEquity(['2c', '3d'], ['4c', '5d'], ['Tc', 'Jd', 'Qh', 'Ks', 'Ac']), { wins: [0, 0], ties: 1, total: 1 });
  const tied = holdemEquity(['Ac', 'Ad'], ['Ah', 'As'], []);
  assert.ok(tied.ties > 0);
  assert.equal(tied.total, 1712304);
});

test('exhaustive preflop enumeration uses every two-card combination', () => {
  const result = holdemEquity(['Ac', 'Ad'], ['Kc', 'Kd'], []);
  assert.equal(result.total, 1712304);
  assert.equal(result.wins[0] + result.wins[1] + result.ties, result.total);
  assert.ok(result.wins[0] > result.wins[1]);
});

test('rank and equity reject duplicate, malformed and incomplete cards', () => {
  assert.throws(() => holdemRank7(['Ac', 'Ac', 'Ah', 'As', 'Kc', '2c', '3d']));
  assert.throws(() => holdemEquity(['Ac', 'Ac'], ['Kc', 'Kd'], []));
  assert.throws(() => holdemEquity(['Ac', 'Ad'], ['Kc', 'Kd'], ['2c']));
  assert.throws(() => holdemEquity(['Ac', 'Ad', 'Ah'], ['Kc', 'Kd'], []));
});
