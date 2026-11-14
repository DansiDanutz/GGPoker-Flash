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
