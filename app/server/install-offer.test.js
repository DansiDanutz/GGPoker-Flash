// Login "Get the app" button: what it promises per phone, and that it hides inside the installed app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { appOfferCaption } from '../src/lib/install.ts';

test('the caption names the phone the player is on', () => {
  assert.equal(appOfferCaption('ios', false), 'Add DanGG to your iPhone Home Screen');
  assert.equal(appOfferCaption('android', false), 'Install DanGG on your Android phone');
  assert.equal(appOfferCaption('other', false), 'For iPhone and Android');
});

test('no offer inside the installed app', () => {
  assert.equal(appOfferCaption('ios', true), null);
  assert.equal(appOfferCaption('android', true), null);
});

test('an independent room name appears literally in the install offer', () => {
  assert.equal(appOfferCaption('ios', false, 'River $& Club'), 'Add River $& Club to your iPhone Home Screen');
  assert.equal(appOfferCaption('android', false, 'OpenPoker'), 'Install OpenPoker on your Android phone');
});
