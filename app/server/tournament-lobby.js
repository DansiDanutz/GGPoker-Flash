// The tournament lobby's live view (reference section 16): blind structure, blind
// clock, ranked players, stack stats and tables. Pure functions over the tournament
// row and its TournamentRoom so the lobby shows exactly what the tables play.
import { MAX_TOURNAMENT_LEVEL, tournamentLevelBlinds } from './tournament-blinds.js';

/** Tables never move faster than this, whatever the row says (see tournamentDescriptor). */
const MIN_LEVEL_MINUTES = 5;
const DEFAULT_LEVEL_MINUTES = 10;
const MINUTE = 60_000;

export function levelMinutes(t) {
  return Math.max(MIN_LEVEL_MINUTES, Number(t.blind_speed) || DEFAULT_LEVEL_MINUTES);
}

/** Base blinds as the flight tables set them: the big blind is 1/50 of the starting stack. */
export function baseBlinds(t) {
  const sb = Math.max(20, Math.round(Number(t.starting_stack || 10000) / 100));
  return { baseSb: sb, baseBb: sb * 2, baseAnte: 0 };
}

export function blindStructure(t) {
  const base = baseBlinds(t);
  const minutes = levelMinutes(t);
  return Array.from({ length: MAX_TOURNAMENT_LEVEL }, (_, i) => ({ level: i + 1, ...tournamentLevelBlinds(base, i + 1), minutes }));
}

/** When late registration closes, and the blind level running at that moment. */
export function lateRegistration(t, now = Date.now()) {
  const startAt = Date.parse(t.start_at);
  const lateMinutes = Math.max(0, Number(t.late_reg) || 0);
  const endsAt = Number.isFinite(startAt) ? startAt + lateMinutes * MINUTE : null;
  return {
    minutes: lateMinutes,
    endsAt,
    closesAtLevel: Math.min(MAX_TOURNAMENT_LEVEL, Math.floor(lateMinutes / levelMinutes(t)) + 1),
    open: endsAt != null && now <= endsAt && ['registering', 'running'].includes(t.status),
  };
}

const cleanCountry = (c) => (/^[A-Za-z]{2}$/.test(String(c || '')) ? String(c).toUpperCase() : '');

function blindClock(room, t) {
  const d = room.tournament || {};
  const level = Math.max(1, Math.min(MAX_TOURNAMENT_LEVEL, Number(d.level) || 1));
  const base = d.baseBb ? d : baseBlinds(t);
  const minutes = Math.max(MIN_LEVEL_MINUTES, Number(d.blindEvery) || levelMinutes(t));
  const startedAt = Number(d.levelStartedAt) || null;
  return {
    level,
    ...tournamentLevelBlinds(base, level),
    next: level < MAX_TOURNAMENT_LEVEL ? { level: level + 1, ...tournamentLevelBlinds(base, level + 1) } : null,
    levelEndsAt: startedAt ? startedAt + minutes * MINUTE : null,
    minutes,
  };
}

function stackStats(stacks, starting) {
  if (!stacks.length) return null;
  const total = stacks.reduce((a, b) => a + b, 0);
  return { starting, largest: Math.max(...stacks), average: Math.round(total / stacks.length), smallest: Math.min(...stacks) };
}

function livePlayers(room, countryOf) {
  return room.alivePlayers()
    .map((p) => ({ id: p.id, nick: p.nick, stack: Number(p.stack) || 0, table: p.index, isBot: !!p.isBot, country: p.isBot ? '' : cleanCountry(countryOf(p.id)) }))
    .sort((a, b) => b.stack - a.stack || String(a.nick).localeCompare(String(b.nick)))
    .map((p, i) => ({ rank: i + 1, ...p }));
}

function liveTables(room) {
  return room.flightState().map((f) => {
    const stacks = f.players.map((p) => Number(p.stack) || 0);
    return {
      index: f.index, id: f.id, players: f.players.length, seats: room.seats,
      largest: stacks.length ? Math.max(...stacks) : 0, smallest: stacks.length ? Math.min(...stacks) : 0,
    };
  });
}

/**
 * @param {{ t: object, room: object|null, registrants: {id:number,nick:string,country?:string}[], now?: number, countryOf?: (id:number)=>string }} input
 */
export function tournamentLobby({ t, room, registrants = [], now = Date.now(), countryOf = () => '' }) {
  const starting = Number(t.starting_stack) || 0;
  const structure = blindStructure(t);
  const lateReg = lateRegistration(t, now);
  if (room && t.status === 'running') {
    const players = livePlayers(room, countryOf);
    return { structure, lateReg, clock: blindClock(room, t), players, stacks: stackStats(players.map((p) => p.stack), starting), tables: liveTables(room) };
  }
  if (t.status === 'registering') {
    const players = registrants.map((r, i) => ({ rank: i + 1, id: r.id, nick: r.nick, stack: starting, table: null, isBot: false, country: cleanCountry(r.country) }));
    return { structure, lateReg, clock: null, players, stacks: stackStats([starting], starting), tables: [] };
  }
  return { structure, lateReg, clock: null, players: [], stacks: null, tables: [] };
}

const FORMAT_GAME = { NLH: 'holdem', PLO: 'omaha', 'Short Deck': 'shortdeck' };
const TOURNAMENT_GAMES = new Set(['holdem', 'omaha', 'shortdeck']);

/** The game a tournament's flight tables deal: the advertised format wins over the legacy game column. */
export function tournamentGame(t = {}) {
  if (FORMAT_GAME[t.format]) return FORMAT_GAME[t.format];
  return TOURNAMENT_GAMES.has(t.game) ? t.game : 'holdem';
}
