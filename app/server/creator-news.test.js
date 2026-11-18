// The creator badge explains the platform, creator and commercial participation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CREATOR_NEWS, sourceRepository } from '../src/lib/creator.ts';

test('the news card distinguishes open source and free testing from paid participation', () => {
  const text = [CREATOR_NEWS.title, ...CREATOR_NEWS.paragraphs].join(' ');
  assert.match(text, /OpenPoker, the open-source platform/);
  assert.match(CREATOR_NEWS.badge, /GitHub/);
  assert.match(text, /Play Money testing are free/);
  assert.match(text, /offers are paid separately/);
  assert.match(text, /does not guarantee income/);
  assert.match(text, /Contributor, Organizer and Marketplace/);
  assert.equal(CREATOR_NEWS.signature, '— DansiDanutz');
  assert.ok(Object.isFrozen(CREATOR_NEWS) && Object.isFrozen(CREATOR_NEWS.paragraphs));
});

test('the GitHub badge links to the repository, not one commit', () => {
  assert.equal(sourceRepository('https://github.com/OpenPoker4all/OpenPoker/tree/0123456789abcdef0123456789abcdef01234567'), 'https://github.com/OpenPoker4all/OpenPoker');
  assert.equal(sourceRepository('https://github.com/OpenPoker4all/OpenPoker'), 'https://github.com/OpenPoker4all/OpenPoker');
  const card = fs.readFileSync(new URL('../src/components/brand/CreatorNews.tsx', import.meta.url), 'utf8');
  assert.match(card, /href=\{sourceRepository\(__APP_SOURCE_URL__\)\} target="_blank" rel="noopener noreferrer">Open GitHub/);
});

test('the news card renders into <body>, so the login footer can never cover Got it', () => {
  const card = fs.readFileSync(new URL('../src/components/brand/CreatorNews.tsx', import.meta.url), 'utf8');
  assert.match(card, /return createPortal\(/);
  assert.match(card, /document\.body,\n\s*\);/);
});
