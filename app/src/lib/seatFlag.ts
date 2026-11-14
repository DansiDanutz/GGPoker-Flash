import { countryFlag } from './rushPools';

// Bots have no country, so they get a stable decorative flag from their nickname.
const BOT_FLAGS = ['🇷🇴', '🇬🇧', '🇩🇪', '🇫🇷', '🇪🇸', '🇧🇷', '🇨🇦', '🇯🇵', '🇰🇷', '🇦🇺', '🇸🇪', '🇵🇱', '🇮🇹', '🇳🇱', '🇦🇷', '🇺🇦'];

/** A seat's flag: the player's real country when known, otherwise a stable pick from the nick. */
export function seatFlag(nick?: string | null, country?: string | null): string {
  if (country && /^[A-Za-z]{2}$/.test(country)) return countryFlag(country);
  const sum = [...(nick || 'p')].reduce((a, c) => a + c.charCodeAt(0), 0);
  return BOT_FLAGS[sum % BOT_FLAGS.length];
}
