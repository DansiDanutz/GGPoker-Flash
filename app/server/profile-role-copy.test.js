import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/components/ProfileRoleGuide.tsx', import.meta.url), 'utf8');
const organizerPanels = [
  '../src/components/OrganizerBilling.tsx',
  '../src/components/OrganizerChips.tsx',
  '../src/components/MarketplacePublisher.tsx',
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');

test('profile role guide states the implemented organizer and contributor terms', () => {
  for (const claim of [
    '$9 per calendar month includes 100,000 organizer Cash Chips',
    'Control schedules, rake, Cash Chips, tickets, and active hours',
    'Build and test locally or in Play Money for free',
    'Keep ownership of your work',
    '20% commission',
    'quote and manual access',
    'Approval and earnings are not guaranteed',
  ]) assert.match(source, new RegExp(claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('profile role guide avoids unsupported ownership and income claims', () => {
  assert.doesNotMatch(source, /shareholder|company equity|passive income|guaranteed income|everyone will use|first platform/i);
});

test('profile organizer panels contain no Romanian UI copy', () => {
  assert.doesNotMatch(organizerPanels, /[ăâîșțĂÂÎȘȚ]|\b(?:Organizator|Actualizează|Plată|Cereri|Niciun|Închide|Deschide)\b/);
});
