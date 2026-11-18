// Shared installed identity and creator credit distinguish free play from paid services.

export const PROJECT_NAME = 'DanGG';
export const CREATOR_NAME = 'DansiDanutz';
export const CREATOR_AVATAR = '/assets/brand/creator.webp';

/** The credit line under the project name. */
export function creatorCredit(creator: string = CREATOR_NAME): string {
  const name = creator.trim() || CREATOR_NAME;
  return `Play Money is free · Built by ${name}`;
}

export const CREATOR_AVATAR_LARGE = '/assets/brand/creator-lg.webp';

/** Movement under this many pixels is a tap, not a slide. */
export const SWIPE_TAP_PX = 6;
/** Share of the track the avatar must cross for the news card to open. */
export const SWIPE_OPEN_RATIO = 0.5;

/** Where the avatar sits while dragged: right only, never past the end of the pill. */
export function swipeOffset(dx: number, max: number): number {
  return Math.min(Math.max(0, max), Math.max(0, dx));
}

/** Whether releasing the avatar at this offset opens the news card. */
export function swipeOpens(offset: number, max: number): boolean {
  return max > 0 && offset >= max * SWIPE_OPEN_RATIO;
}

/** The public repository behind a corresponding-source URL such as `<repo>/tree/<commit>`. */
export function sourceRepository(sourceUrl: string): string {
  return sourceUrl.replace(/\/tree\/[^/]+\/?$/, '');
}

/** The news card that opens when a player taps the creator badge. */
export const CREATOR_NEWS = Object.freeze({
  kicker: 'News from Dan',
  title: 'Play, organise, contribute',
  paragraphs: Object.freeze([
    'DanGG is built on OpenPoker, the open-source platform. Read, use and improve its code under the published licence. Local development and Play Money testing are free.',
    'Organizer services and configured marketplace offers are paid separately. Each offer explains its creator, availability and terms; game chips and service credits remain separate.',
    'Build it. Test it. Get approved. Earn when customers pay to use your plugin or customisation. Contributor approval does not guarantee income, company equity or automatic royalties.',
    'Open Profile to find Contributor, Organizer and Marketplace. See the public Contributors directory for approved publishers and their published work.',
  ]),
  badge: 'Star on GitHub',
  signature: '— DansiDanutz',
  close: 'Got it',
});
