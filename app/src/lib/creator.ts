// The creator credit shown on the loading screen and login page: the community should know who
// built DanGG and that it is free.

export const PROJECT_NAME = 'No More Middleman';
export const CREATOR_NAME = 'Dan';
export const CREATOR_AVATAR = '/assets/brand/creator.webp';

/** The credit line under the project name. */
export function creatorCredit(creator: string = CREATOR_NAME): string {
  const name = creator.trim() || CREATOR_NAME;
  return `Built free for the community by ${name}`;
}

export const CREATOR_AVATAR_LARGE = '/assets/brand/creator-lg.webp';

/** The news card that opens when a player taps the creator badge. */
export const CREATOR_NEWS = Object.freeze({
  kicker: 'News from Dan',
  title: 'DanGG is going open source',
  paragraphs: Object.freeze([
    'The full code of this game will be published on GitHub, free for anyone to read, use and improve.',
    "Why? Because players shouldn't always need a middleman between them and the game. No company standing in the way, no closed doors: a community building the poker room it wants to play in.",
    'Anyone can contribute. Fix a bug, design a table, translate a screen, suggest a feature. Players need their own software, and AI is here to help sustain it, so a small community can build and run what used to take a whole company.',
    'Play free, build together. No more middleman.',
  ]),
  badge: 'Coming soon on GitHub',
  signature: '— Dan',
  close: 'Got it',
});
