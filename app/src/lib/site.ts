/** Public identity compiled from an explicit allowlist, never the whole environment. */
export type SiteProfile = {
  readonly profile: 'dangg' | 'portable';
  readonly name: string;
  readonly origin: string;
  readonly logo: string;
  readonly bootLogo: string;
  readonly icon: string;
  readonly image: string;
  readonly supportEmail: string;
  readonly pwaName: string;
  readonly shortName: string;
  readonly description: string;
};

export const SITE: SiteProfile = Object.freeze(__APP_SITE_PROFILE__);
