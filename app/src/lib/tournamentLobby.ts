// Tournament lobby content (reference section 16). Every row and explainer mirrors
// what the server implements: tournament-lobby.js (structure, late reg, clock),
// table.js (bounty, mystery tiers, Quick Flip first hand) and tournament.js (payouts).
import { money, type TournamentDetail } from './api';
import { ordinal } from './tournamentPrizes';

export type LobbyTheme = 'standard' | 'bounty' | 'mystery' | 'satellite' | 'flip' | 'shortdeck' | 'plo';
export type InfoRow = { label: string; value: string; explain?: Explainer };
export type Explainer = { title: string; body: string };

/** Mystery bounty multipliers, as table.js draws them. */
export const MYSTERY_TIERS = [0.1, 0.25, 0.5, 1, 2, 5, 10];
const BLIND_GROWTH = 1.5;
const STARTING_BIG_BLINDS = 50;

export function lobbyTheme(t: any): LobbyTheme {
  if (t.mode === 'MYSTERY') return 'mystery';
  if (t.mode === 'BOUNTY') return 'bounty';
  if (t.mode === 'SATELLITE') return 'satellite';
  if (t.mode === 'FLIP') return 'flip';
  if (t.format === 'Short Deck') return 'shortdeck';
  if (t.format === 'PLO') return 'plo';
  return 'standard';
}

const GAME_NAME: Record<string, string> = { NLH: "No Limit Hold'em", PLO: 'Pot Limit Omaha', 'Short Deck': "Short Deck Hold'em" };
export const gameName = (t: any) => GAME_NAME[t.format] || "No Limit Hold'em";

const MODE_NAME: Record<string, string> = { BOUNTY: 'Bounty', MYSTERY: 'Mystery Bounty', SATELLITE: 'Satellite', FLIP: 'Quick Flip' };
export const modeName = (t: any) => MODE_NAME[t.mode] || 'Freezeout';

export const timeOf = (ms: number | string) =>
  new Date(ms).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function explainers(t: any, d: TournamentDetail | null): Record<string, Explainer> {
  const minutes = d?.structure[0]?.minutes ?? t.blind_speed;
  const lastLevel = d?.structure.length ?? 20;
  return {
    bounty: {
      title: 'Bounty',
      body: `Every player carries a fixed ${money(t.bounty || 0)} bounty. Knock a player out and the bounty is paid to your balance straight away, on top of any prize.`,
    },
    mystery: {
      title: 'Mystery Bounty',
      body: `Each knockout pays a random bounty of ${MYSTERY_TIERS.map((x) => `${x}×`).join(', ')} the ${money(t.bounty || 0)} base — up to ${money((t.bounty || 0) * 10)}. It is paid to your balance as soon as the player is out.`,
    },
    flip: {
      title: 'Quick Flip',
      body: 'The first hand at every table is dealt with everyone all-in, no decisions. From the second hand on it is a normal tournament.',
    },
    satellite: {
      title: 'Satellite',
      body: `There are no chip prizes. The winner gets a seat ticket${t.ticket ? ` to ${t.ticket}` : ''}, credited to their account.`,
    },
    lateReg: {
      title: 'Late Registration',
      body: d?.lateReg.endsAt
        ? `You can still register until ${timeOf(d.lateReg.endsAt)}, during level ${d.lateReg.closesAtLevel}. Late entrants get the full starting stack.`
        : 'Late entrants get the full starting stack.',
    },
    blinds: {
      title: 'Blind Levels',
      body: `Play starts ${STARTING_BIG_BLINDS} big blinds deep. Blinds rise ×${BLIND_GROWTH} every ${minutes} minutes and stop rising at level ${lastLevel}.`,
    },
    bubble: {
      title: 'Bubble',
      body: 'The bubble is the last player out before the prize places. Everyone from the bubble down finishes without a prize.',
    },
  };
}

/** The centre "Info" table. */
export function infoRows(t: any, d: TournamentDetail | null): InfoRow[] {
  const ex = explainers(t, d);
  const rows: InfoRow[] = [
    { label: 'Game Type', value: `${gameName(t)} · ${modeName(t)}` },
    { label: 'Buy-in', value: t.buyin === 0 && t.fee === 0 ? 'Freeroll' : `${money(t.buyin)} + ${money(t.fee)}` },
    { label: 'Starting Chips', value: `${Number(t.starting_stack).toLocaleString()} (${STARTING_BIG_BLINDS} BB)` },
  ];
  if (t.mode === 'BOUNTY') rows.push({ label: 'Bounty', value: money(t.bounty || 0), explain: ex.bounty });
  if (t.mode === 'MYSTERY') rows.push({ label: 'Mystery Bounty', value: `up to ${money((t.bounty || 0) * 10)}`, explain: ex.mystery });
  if (t.mode === 'SATELLITE') rows.push({ label: 'Prize', value: `${t.ticket || 'Seat'} ticket`, explain: ex.satellite });
  if (t.mode === 'FLIP') rows.push({ label: 'First Hand', value: 'Everyone all-in', explain: ex.flip });
  rows.push({ label: 'Starting Time', value: timeOf(t.start_at) });
  if (d) rows.push({ label: 'Late Reg.', value: d.lateReg.endsAt ? `Until ${timeOf(d.lateReg.endsAt)} (Level ${d.lateReg.closesAtLevel})` : 'None', explain: ex.lateReg });
  if (d) rows.push({ label: 'Blind Interval', value: `${d.structure[0]?.minutes ?? t.blind_speed} minutes`, explain: ex.blinds });
  const seats = d?.tables[0]?.seats;
  if (seats) rows.push({ label: 'Table Type', value: `${seats}-max` });
  rows.push({ label: 'Min ~ Max Players', value: `2 ~ ${Number(t.max_players).toLocaleString()}` });
  rows.push({ label: 'Entries', value: `${Number(t.entrants).toLocaleString()} · one stack per registration` });
  if (d && d.payouts.length > 0 && t.mode !== 'SATELLITE') {
    rows.push({ label: 'Places Paid', value: `${d.placesPaid}` });
    if (d.bubble) rows.push({ label: 'Bubble', value: `${ordinal(d.bubble)} place`, explain: ex.bubble });
  }
  return rows;
}

/** Chips as big blinds at the current level (or the starting level before the start). */
export function bigBlinds(stack: number, d: TournamentDetail | null): string {
  const bb = d?.clock?.bb || d?.structure[0]?.bb || 0;
  return bb ? `${(stack / bb).toFixed(1)}` : '—';
}

export function statusLabel(t: any, d: TournamentDetail | null, now = Date.now()): string {
  if (t.status === 'completed') return 'Finished';
  if (t.status === 'running') return d?.lateReg.open ? 'Late Reg.' : 'Running';
  return Date.parse(t.start_at) > now ? 'Registering' : 'Starting';
}
