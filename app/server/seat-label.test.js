// Native NewPlayerLabel3D (REA seat-labels / stack-status): nicknames longer than 15 UTF-16
// units show their first 14 plus "..", and a zero balance reads "All-In" instead of $0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seatNick, NICK_MAX, isAllInStatus } from '../src/game/seatLabel.ts';

test('names up to 15 units are shown whole', () => {
  assert.equal(NICK_MAX, 15);
  assert.equal(seatNick('DansiDanutz'), 'DansiDanutz');
  assert.equal(seatNick('abcdefghijklmno'), 'abcdefghijklmno');
});

test('longer names keep 14 units plus two dots', () => {
  assert.equal(seatNick('abcdefghijklmnop'), 'abcdefghijklmn..');
  assert.equal(seatNick(''), '');
  assert.equal(seatNick(undefined), '');
});

test('a seated player with a zero balance shows All-In', () => {
  assert.equal(isAllInStatus({ nick: 'a', stack: 0 }), true);
  assert.equal(isAllInStatus({ nick: 'a', stack: 1 }), false, 'positive balance clears All-In');
  assert.equal(isAllInStatus({ nick: null, stack: 0 }), false, 'empty seats have no status');
  assert.equal(isAllInStatus({ nick: 'a', stack: undefined }), false);
});
