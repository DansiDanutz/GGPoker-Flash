// The creator badge opens a news card: DanGG is going open source on GitHub.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CREATOR_NEWS } from '../src/lib/creator.ts';

test('the news card says the code goes open source on GitHub and anyone can contribute', () => {
  const text = [CREATOR_NEWS.title, ...CREATOR_NEWS.paragraphs].join(' ');
  assert.match(text, /open source/i);
  assert.match(text, /GitHub/);
  assert.match(text, /anyone can contribute/i);
  assert.match(text, /middleman/i);
  assert.match(text, /AI/);
  assert.equal(CREATOR_NEWS.signature, '— Dan');
  assert.ok(Object.isFrozen(CREATOR_NEWS) && Object.isFrozen(CREATOR_NEWS.paragraphs));
});
