// Game Information panel content (reference section 12). Every value mirrors the
// server: ACTION_SECONDS (validate.js), timeBankCards.js, DISCONNECT_GRACE_MS,
// badBeat.js BBJ_TRIGGER / badBeatEligible(), table.js run-it-twice and straddle.
import { GAME_LABEL, money, type LobbyTable } from './api';

export type RuleRow = { label: string; value: string; note?: string };
export type FeatureRow = RuleRow & { icon: string };
export type GameRules = {
  title: string;
  rows: RuleRow[];
  features: FeatureRow[];
  rulesTitle: string;
  rulesText: string[];
  handRanks?: string[];
};

export type RulesFamily = 'holdem' | 'plo' | 'shortdeck' | 'aof' | 'rush';

const TIME_TO_ACT_S = 15;
const TIME_BANK = { start: 3, max: 5, seconds: 15, perDecision: 2, refillHands: 20 };
const DISCONNECT_GRACE_S = 60;

/** Map a lobby tab or server game id to the rules family it shows. */
export function rulesFamily(game: string): RulesFamily {
  if (game === 'aof') return 'aof';
  if (game === 'rush' || game === 'rushplo') return 'rush';
  if (game === 'shortdeck' || game === 'short') return 'shortdeck';
  if (game.startsWith('omaha') || game === 'plo') return 'plo';
  return 'holdem';
}

const FAMILY_TITLE: Record<RulesFamily, string> = {
  holdem: "Hold'em", plo: 'PLO', shortdeck: 'Short Deck', aof: 'All-in or Fold', rush: 'Rush & Cash',
};

function blindsRow(table: LobbyTable | null): RuleRow {
  if (!table) return { label: 'Blinds', value: 'SB, BB, Ante', note: 'Small blind, big blind and, on some tables, an ante' };
  const parts = [`${money(table.sb)} / ${money(table.bb)}`];
  if (table.ante > 0) parts.push(`ante ${money(table.ante)}`);
  return { label: 'Blinds', value: table.ante > 0 ? 'SB, BB, Ante' : 'SB, BB', note: parts.join(', ') };
}

function baseRows(family: RulesFamily, table: LobbyTable | null): RuleRow[] {
  const gameType = table ? (GAME_LABEL[table.game] || FAMILY_TITLE[family]) : family === 'plo' ? 'PLO, PLO-5, PLO-6' : FAMILY_TITLE[family];
  return [
    { label: 'Currency', value: 'Play money', note: 'No real money, deposits or cash value' },
    { label: 'Game Type', value: gameType },
    { label: 'Table Max', value: table ? `${table.seats} Players` : '6 or 9 Players' },
    blindsRow(table),
    ...(table ? [{ label: 'Buy-in', value: `${money(table.min_buyin)} – ${money(table.max_buyin)}` }] : []),
    { label: 'Time to act', value: `${TIME_TO_ACT_S} seconds`, note: 'Players should act within this time unless a time bank card is used' },
    {
      label: 'Time Bank Card', value: `${TIME_BANK.start}~${TIME_BANK.max} cards`,
      note: `Each card adds ${TIME_BANK.seconds} seconds, up to ${TIME_BANK.perDecision} per decision. 1 card is added every ${TIME_BANK.refillHands} hands, up to ${TIME_BANK.max}.`,
    },
    { label: 'Disconnect Extra Time', value: `${DISCONNECT_GRACE_S} seconds`, note: 'Your seat is kept this long after you lose connection' },
    { label: 'Minimum Players', value: '2 Players', note: 'Dealing only starts when the minimum number of players is met' },
  ];
}

function features(family: RulesFamily): FeatureRow[] {
  const out: FeatureRow[] = [];
  if (family === 'holdem' || family === 'rush') {
    out.push({ icon: '★', label: 'Jackpot', value: 'Bad Beat Jackpot', note: 'Lose at showdown with four 8s or better, using both hole cards' });
  }
  if (family === 'plo') {
    out.push({ icon: '★', label: 'Jackpot', value: 'Bad Beat Jackpot', note: 'Lose at showdown with a straight flush or better' });
  }
  if (family !== 'aof' && family !== 'rush') {
    out.push({ icon: '⇉', label: 'Run It Twice', value: 'On', note: 'Can be switched on between hands; all-in boards are then dealt twice' });
    out.push({ icon: '↟', label: 'Straddle', value: 'Table option', note: 'On tables that allow it, players left of the big blind are offered a straddle before the deal' });
  }
  if (family === 'rush') {
    out.push({ icon: '⚡', label: 'Fast Fold', value: 'On', note: 'Fold any time and move straight to a new hand at another table' });
  }
  out.push({ icon: '🐇', label: 'Rabbit Hunt', value: 'On', note: 'See the cards that would have come when a hand ends early' });
  out.push({ icon: '⏱', label: 'Time Bank', value: 'On', note: 'Use a time bank card when the action clock runs low' });
  return out;
}

const RULES_TEXT: Record<RulesFamily, string[]> = {
  holdem: [
    "Texas Hold'em is played with a standard 52-card deck. Every player gets two hole cards face down. Over four betting rounds — pre-flop, flop, turn and river — five community cards are dealt face up.",
    'Players make the best five-card hand from any combination of their hole cards and the community cards. The strongest hand at showdown wins the pot.',
  ],
  plo: [
    "Pot-Limit Omaha is dealt like Hold'em, but every player gets four hole cards (five in PLO-5, six in PLO-6).",
    'At showdown you must use exactly two of your hole cards and exactly three community cards. The largest bet or raise allowed is the size of the pot.',
  ],
  shortdeck: [
    "Short Deck (6+ Hold'em) removes the 2s through 5s, leaving a 36-card deck. Each player gets two hole cards and plays like Hold'em.",
    'With fewer cards per suit, a flush is rarer and beats a full house. The lowest straight is A-6-7-8-9.',
  ],
  aof: [
    'All-in or Fold is No-Limit Hold\'em where the only choices are to fold or to move all-in. When someone is already all-in you can call.',
    'Stacks are short, so every hand is a single decision and hands are dealt quickly.',
  ],
  rush: [
    "Rush & Cash is fast-fold Hold'em: as soon as you fold you join a new hand with new opponents from the player pool.",
    'Blinds, hand rankings and betting are the same as regular No-Limit Hold\'em.',
  ],
};

const SHORT_DECK_RANKS = [
  'Royal flush', 'Straight flush', 'Four of a kind', 'Flush', 'Full house', 'Straight', 'Three of a kind', 'Two pair', 'One pair', 'High card',
];

export function gameRules(gameOrTab: string, table: LobbyTable | null = null): GameRules {
  const family = rulesFamily(table?.game || gameOrTab);
  return {
    title: `${FAMILY_TITLE[family]} Information`,
    rows: baseRows(family, table),
    features: features(family),
    rulesTitle: `${FAMILY_TITLE[family]} Rules`,
    rulesText: RULES_TEXT[family],
    handRanks: family === 'shortdeck' ? SHORT_DECK_RANKS : undefined,
  };
}
