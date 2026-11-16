// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { AVATAR_COUNT, AVATAR_NAMES, avatarPresetPath, normalizeAvatarSource, resolveAvatarPreset } from '../config/avatar-presets.js';

test('every saved avatar ordinal and legacy ID resolves to its corresponding original SVG', () => {
  assert.equal(AVATAR_NAMES.length, AVATAR_COUNT);
  for (let number = 1; number <= AVATAR_COUNT; number++) {
    const digits = String(number).padStart(2, '0');
    const expected = `/assets/avatars/openpoker-${digits}.svg`;
    assert.equal(avatarPresetPath(number), expected);
    for (const input of [`/assets/avatars/gg-${digits}.jpg`, `gg-${digits}`, expected]) {
      assert.equal(resolveAvatarPreset(input), expected);
      assert.equal(normalizeAvatarSource(input), expected);
    }
  }
});

test('avatar presets reject unavailable numbers and arbitrary paths without altering uploaded avatars', () => {
  for (const value of ['/assets/avatars/gg-00.jpg', '/assets/avatars/gg-21.jpg', 'gg-99', '/assets/avatars/openpoker-99.svg', '/assets/avatars/../logo.svg', 'https://example.com/avatar.svg', {}, null]) {
    assert.equal(resolveAvatarPreset(value), null);
  }
  for (const number of [0, 21, 1.5, NaN]) assert.throws(() => avatarPresetPath(number), RangeError);
  assert.equal(normalizeAvatarSource('data:image/png;base64,c2F2ZWQ='), 'data:image/png;base64,c2F2ZWQ=');
  assert.equal(normalizeAvatarSource(''), '');
  assert.equal(normalizeAvatarSource(null), '');
});
