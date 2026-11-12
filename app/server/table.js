import { buildPots, oddChipOrder } from './pots.js';
import { STRADDLE_ASK_MS, straddleCandidates } from './straddle.js';
import { SIT_OUT_KICK_MS, dealMeInMin } from './sitOut.js';
import { badBeatPayout } from './badBeat.js';
import { activeReservations, reserve, withoutPlayer } from './seatReserve.js';
import { TB_CARD_SECONDS, TB_START_CARDS, canSpendCard, refillAfterHand } from './timeBankCards.js';
import {
  makeDeck, shuffle, cardStr, bestHoldem, bestOmaha, compareScores, estimateEquity,
} from './poker.js';
import { randomInt } from 'node:crypto';
import { payoutFor, payoutTable } from './tournament.js';
import { SPIN_SEATS, SPIN_TICKET_TOTAL, isSpinStake, spinBlindLevel, spinOutcome } from './spin.js';
import { ACTION_SECONDS, isRushGame, parseActionSeconds } from './validate.js';

const BOT_NAMES = [
  'SpewySally', 'NitWizard', 'CallStation', 'RiverRat', 'TiltLord', 'GTOBOT', 'BluffKing',
  'PaperHands', 'ChipMuncher', 'DoubleBarrel', 'SnowLeopard', 'PocketRockets', 'FishInWater',
  'LAGMaster', 'TightTony', 'CheckRaiseU', 'AllInAnna', 'SlowplaySam', 'AggroPanda', 'TheDealer',
  'SpinKing', 'OmahaOwl', 'SharkBait', 'LuckyLuke', 'MrsRiver', 'PumpFake', 'ColdDeckCarl',
];

const MAX_MISSED_TURNS = 2;
// A cash-table player who busts gets this long to reload before the next deal.
const REBUY_WINDOW_MS = 10_000;
const OMAHA_EQUITY_ITERATIONS = 60;

let handSeq = Date.now() % 100000;

export function botName(seed) {
  return BOT_NAMES[seed % BOT_NAMES.length];
}

export class PokerTable {
  constructor(cfg, hooks = {}) {
    this.cfg = cfg;
    this.hooks = hooks;
    this.seats = Array.from({ length: cfg.seats }, (_, i) => ({
      index: i,
      player: null,
    }));
    this.button = -1;
    // Seats that posted the blinds this hand (SB/BB markers); -1 before the first deal.
    this.sbSeat = -1;
    this.bbSeat = -1;
    this.handNo = 0;
    this.street = 'idle'; // idle | preflop | flop | turn | river | showdown | ended
    this.board = [];
    this.deck = [];
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = cfg.bb;
    this.actor = null;
    this.actionEndsAt = 0;
    this.timeBankUsed = new Set();
    this.botActAt = 0;
    this.nextHandAt = 0;
    this.rebuyHoldUntil = 0;
    this.streetStartedAt = 0;
    this.lastAggressor = null;
    this.history = [];
    this.log = [];
    this.result = null;
    this.handId = null;
    this.actionTimeMs = (parseActionSeconds(cfg.action_seconds) || ACTION_SECONDS.default) * 1000;
    this.handStartStack = {};
    this.listeners = new Set();
    this.lastAction = null;
    this.paused = false;
    this.runItTwice = false;
    this.tableName = cfg.name;
    this.game = cfg.game;
    this.sb = cfg.sb;
    this.bb = cfg.bb;
    this.ante = cfg.ante || 0;
    this.shortDeck = cfg.game === 'shortdeck';
    this.bomb = !!cfg.bomb_pot;
    if (this.bomb && !this.ante) this.ante = this.bb;
    this.showdownDelay = 5000;
    this.botSpeed = Number(cfg.botSpeed || 900);
    this.botIterations = Number(cfg.botIterations || 0);
    this.aof = cfg.game === 'aof';
    this.rush = isRushGame(cfg.game);
    this.straddle = !!cfg.straddle;
    this.straddleRound = null;
    this.pendingDeal = null;
    this.spin = cfg.game === 'spingold';
    this.spinMultiplier = null;
    this.spinPrize = 0;
    this.spinPayouts = null;
    this.spinWinner = null;
    // Ticket source for the verified outcome table (server/spin.js); tests inject a fixed one.
    this.spinTicket = () => randomInt(SPIN_TICKET_TOTAL);
    // Spin blind clock (P0 slice S1c): started at the draw, read before each deal; tests inject it.
    this.spinClock = () => Date.now();
    this.spinStartedAt = 0;
    this.spinCompletedHands = 0;
    this.spinLevel = 0;
    this.tournament = cfg.tournament || null;
    this.levelStartedAt = this.tournament ? Date.now() : 0;
    if (this.tournament) {
      // Every flight of a multi-table event shares one tournament descriptor,
      // so blinds and the level clock stay in step across tables.
      this.tournament.level = Math.max(1, Number(this.tournament.level) || 1);
      this.tournament.baseSb = Number(this.tournament.baseSb) || Number(cfg.sb);
      this.tournament.baseBb = Number(this.tournament.baseBb) || Number(cfg.bb);
      this.tournament.levelStartedAt = Number(this.tournament.levelStartedAt) || this.levelStartedAt;
      this.appliedLevel = this.tournament.level;
      const level = this.tournament.level - 1;
      this.sb = Math.round(this.tournament.baseSb * 1.5 ** level);
      this.bb = Math.round(this.tournament.baseBb * 1.5 ** level);
      this.minRaise = this.bb;
      this.levelStartedAt = this.tournament.levelStartedAt;
    }
    this.elimination = this.spin || !!this.tournament;
    this.flip = this.tournament?.mode === 'FLIP';
    this.bounty = Number(this.tournament?.bounty || 0);
    this.mystery = this.tournament?.mode === 'MYSTERY';
    this.satellite = this.tournament?.mode === 'SATELLITE';
    this.rakePercent = cfg.rakePercent ?? 5;
    this.rakeCap = Number(cfg.rakeCap) > 0 ? Number(cfg.rakeCap) : 300;
    this.rake = 0;
    this.finished = [];
    this.omahaHole = cfg.game === 'omaha5' ? 5 : cfg.game === 'omaha6' ? 6 : 4;
    // `rushplo` is Rush & Cash PLO: four-card pot-limit Omaha with the Rush quick fold.
    this.omaha = ['omaha', 'omaha5', 'omaha6', 'rushplo'].includes(cfg.game);
    this.potLimit = this.omaha;
    this.holeCount = this.omaha ? this.omahaHole : 2;
    // Chips committed by players who left mid-hand; they stay in the pot as dead money.
    this.ghosts = [];
    this.messageSeq = 0;
    this.tableEpoch = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.tableVersion = 0;
    // Wait-list seat holds: seat index -> the user id the seat is held for (set by index.js).
    this.holds = new Map();
    // Take-seat reservations: seat index -> { playerId, until } (seatReserve.js).
    this.reservations = new Map();
  }

  /* ------------------------------ seating ------------------------------ */

  occupiedSeats() {
    return this.seats.filter((s) => s.player);
  }

  activePlayers() {
    return this.seats.filter((s) => s.player && !s.player.folded && s.player.inHand);
  }

  seatOf(playerId) {
    return this.seats.find((s) => s.player && s.player.id === playerId);
  }

  /** Replace the wait-list holds with `holds` (a Map or [[seatIndex, userId], …]). */
  setHolds(holds) {
    this.holds = new Map(holds);
  }

  /** True when the seat is held (wait list or take-seat reservation) for someone other than `playerId`. */
  isHeldFor(seatIndex, playerId) {
    const holder = this.holds.get(seatIndex);
    if (holder != null && holder !== playerId) return true;
    const r = this.reservations.get(seatIndex);
    return !!r && r.playerId !== playerId && r.until > Date.now();
  }

  /** Native Take Seat: hold an empty seat while the player picks a buy-in. */
  reserveSeat(seatIndex, playerId, now = Date.now()) {
    const seat = this.seats[seatIndex];
    if (!seat) return { ok: false, error: 'no such seat' };
    if (this.seatOf(playerId)) return { ok: false, error: 'already seated' };
    if (this.holds.has(seatIndex) && this.holds.get(seatIndex) !== playerId) return { ok: false, error: 'seat held' };
    const res = reserve(this.reservations, { seat: seatIndex, playerId, now, seatEmpty: !seat.player });
    if (!res.ok) return res;
    this.reservations = res.reservations;
    return { ok: true, seat: seatIndex, until: res.until };
  }

  cancelReservation(playerId) {
    this.reservations = withoutPlayer(this.reservations, playerId);
  }

  /** Drops lapsed reservations; returns how many seats that freed. */
  expireReservations(now = Date.now()) {
    const before = this.reservations.size;
    this.reservations = activeReservations(this.reservations, now);
    return before - this.reservations.size;
  }

  /** Empty seats free to offer to the wait list: no wait-list hold, no live reservation. */
  offerableSeats(now = Date.now()) {
    return this.seats
      .filter((s) => !s.player && !this.holds.has(s.index) && !((this.reservations.get(s.index)?.until || 0) > now))
      .map((s) => s.index);
  }

  /** First empty seat `playerId` may take (held seats only go to their holder). */
  freeSeatFor(playerId) {
    return this.seats.find((s) => !s.player && !this.isHeldFor(s.index, playerId)) || null;
  }

  sit(player, seatIndex = null, buyin = null, sessionId = null) {
    if (this.seatOf(player.id)) return { ok: false, error: 'already seated' };
    const seat = seatIndex != null ? this.seats[seatIndex] : this.freeSeatFor(player.id);
    if (!seat) return { ok: false, error: 'table full' };
    if (seat.player) return { ok: false, error: 'seat taken' };
    if (this.isHeldFor(seat.index, player.id)) return { ok: false, error: 'seat held' };
    const stack = buyin ?? Math.min(this.cfg.max_buyin, Math.max(this.cfg.min_buyin, this.cfg.bb * 100));
    this.reservations = withoutPlayer(this.reservations, player.id);
    seat.player = {
      id: player.id,
      nick: player.nick,
      avatar: player.avatar || '',
      stack,
      isBot: !!player.isBot,
      sittingOut: false,
      disconnected: false,
      inHand: false,
      folded: true,
      allIn: false,
      bet: 0,
      totalBet: 0,
      cards: [],
      acted: false,
      reveal: false,
      lastAction: null,
      winAmount: 0,
      seat: seat.index,
      timeBank: 30,
      // Automatic moves (Rush, tournament balancing) carry the balance; a fresh seat starts full.
      timeBankCards: Number.isInteger(player.timeBankCards) ? player.timeBankCards : TB_START_CARDS,
      timeBankHands: Number.isInteger(player.timeBankHands) ? player.timeBankHands : 0,
      joinedAt: Date.now(),
      handsPlayed: 0,
      won: 0,
      autoMuck: true,
      sitOutNextHand: false,
      insurance: false,
      sessionId,
    };
    this.emit({ type: 'sit', seat: seat.index, nick: player.nick });
    this.maybeStart();
    return { ok: true, seat: seat.index };
  }

  handInProgress() {
    return this.street !== 'idle' && this.street !== 'ended';
  }

  stand(playerId) {
    const seat = this.seatOf(playerId);
    if (!seat) return { ok: false };
    const p = seat.player;
    const wasLive = this.handInProgress() && p.inHand;
    const wasActor = this.actor === p.id;
    if (wasLive) {
      if (!p.folded) {
        p.folded = true;
        this.log.push({ nick: p.nick, action: 'fold', street: this.street });
      }
      // The part of the leaver's bet that nobody matched goes back with their stack (native
      // splitPots: only matched chips can be won), so nobody has to answer a departed bet.
      this.returnLeaverExcess(p);
      // Keep the departed player's matched chips in the pot instead of losing them with the seat.
      this.ghosts.push({ id: p.id, nick: p.nick, bet: p.bet, totalBet: p.totalBet });
    }
    seat.player = null;
    this.emit({ type: 'stand', seat: seat.index });
    if (this.straddleRound) {
      this.straddleRound.asked.delete(p.id);
      if (!this.straddleRound.asked.size) this.closeStraddleRound();
      return { ok: true, stack: p.stack };
    }
    if (wasLive) {
      if (wasActor) this.actor = null;
      this.progress(seat.index, { keepActor: !wasActor });
    }
    return { ok: true, stack: p.stack };
  }

  fillBots(count) {
    // Seat everyone first so the opening hand is dealt to the whole table, not just the first two.
    this.holdStart = true;
    let added = 0;
    for (let i = 0; i < this.seats.length && added < count; i++) {
      const s = this.seats[i];
      // A seat held for a wait-listed player is never given to a bot.
      if (!s.player && !this.holds.has(i) && !this.reservations.has(i)) {
        this.sit({
          id: `bot-${this.cfg.id}-${i}-${handSeq++}`,
          nick: botName(handSeq + i * 3),
          isBot: true,
        }, i);
        added++;
      }
    }
    this.holdStart = false;
    this.maybeStart();
    return added;
  }

  humans() {
    return this.occupiedSeats().filter((s) => s.player && !s.player.isBot).map((s) => s.player);
  }

  /* ------------------------------ hand flow ------------------------------ */

  maybeStart() {
    if (this.holdStart) return;
    if (this.street !== 'idle' && this.street !== 'ended') return;
    if (this.nextHandAt && Date.now() < this.nextHandAt) return;
    if (this.readySeats().length >= 2) this.startHand();
  }

  // Elimination formats deal sitting-out players in (they auto-fold) so nobody can stall a tournament.
  isDealtIn(player) {
    if (this.waitsForBigBlind(player)) return false;
    return player.stack > 0 && (this.elimination || !player.sittingOut);
  }

  /** WaitForBlinds: a returning cash player who owes a blind waits for the big blind instead. */
  waitsForBigBlind(player) {
    return !!(player && player.waitForBlinds && player.missedBlinds && !player.sittingOut && player.stack > 0 && this.owesSitInBlind());
  }

  setWaitForBlinds(userId, value) {
    const seat = this.seatOf(userId);
    if (!seat?.player) return { ok: false, error: 'Take a seat first' };
    seat.player.waitForBlinds = !!value;
    if (!value) this.maybeStart(); // Post now: an idle table can deal again
    return { ok: true };
  }

  /** Deal a waiting player in when the big blind reaches their seat (no extra post). */
  promoteWaitingBigBlind() {
    const waiting = (s) => this.waitsForBigBlind(s.player);
    if (!this.seats.some(waiting)) return;
    const ring = [];
    for (let i = 1; i <= this.seats.length; i++) {
      const s = this.seats[(this.button + i) % this.seats.length];
      if ((s.player && s.player.inHand) || waiting(s)) ring.push(s);
    }
    // A waiter who has sat through a full orbit without the big blind reaching them (e.g. two
    // waiters on alternating seats) comes back and posts like any returning player.
    for (const s of this.seats) {
      if (!waiting(s)) continue;
      s.player.waitedHands = (s.player.waitedHands || 0) + 1;
      if (s.player.waitedHands > this.seats.length) {
        s.player.waitForBlinds = false;
        s.player.waitedHands = 0;
        s.player.inHand = true;
        s.player.folded = false;
      }
    }
    if (ring.length < 3 || waiting(ring[0]) || !waiting(ring[1])) return;
    const p = ring[1].player;
    p.inHand = true;
    p.folded = false;
    p.missedBlinds = false;
    p.waitedHands = 0;
  }

  readySeats() {
    return this.occupiedSeats().filter((s) => this.isDealtIn(s.player));
  }

  /** Spin & Gold runs only at an observed play-money stake (5,000 / 10,000, fixed buy-in). */
  spinStakeValid() {
    return this.spin && isSpinStake(Number(this.cfg.min_buyin), Number(this.cfg.max_buyin));
  }

  /** A Spin has started once its prize is drawn; nobody may join it after that. */
  spinStarted() {
    return this.spin && !!this.spinPayouts;
  }

  /** Draw the multiplier from the verified table when the first hand is dealt. */
  drawSpin() {
    const outcome = spinOutcome(Number(this.cfg.min_buyin), this.spinTicket());
    this.spinMultiplier = outcome.multiplier;
    this.spinPrize = outcome.prizePool;
    this.spinPayouts = Object.freeze([...outcome.prizes]);
    this.spinStartedAt = this.spinClock();
    this.spinCompletedHands = 0;
    this.spinLevel = 0;
    this.emit({ type: 'spin_drawn', multiplier: this.spinMultiplier, prize: this.spinPrize, payouts: this.spinPayouts });
  }

  /**
   * Rank a player out of a Spin and pay that place once. The ledger hook keys the payout on the
   * seat's session, so a later cash-out of the same session cannot pay again.
   */
  recordSpinFinish(player, place) {
    if (!this.spinPayouts || this.finished.some((f) => f.id === player.id)) return null;
    const entry = { nick: player.nick, id: player.id, place, payout: this.spinPayouts[place - 1] || 0 };
    this.finished.push(entry);
    this.emit({ type: 'spin_payout', ...entry });
    try {
      if (this.hooks.onSpinPayout) this.hooks.onSpinPayout(this, { ...entry, sessionId: player.sessionId || null, isBot: !!player.isBot });
    } catch (e) { console.error('spin payout hook', e); }
    return entry;
  }

  /** Leaving a running Spin takes the lowest open place; the chips leave with the seat. */
  leaveSpin(playerId) {
    const seat = this.seatOf(playerId);
    if (seat?.player && this.spinStarted() && !this.spinWinner && seat.player.stack > 0) {
      const alive = this.occupiedSeats().filter((s) => s.player.stack > 0).length;
      this.recordSpinFinish(seat.player, alive);
    }
    const res = this.stand(playerId);
    const alive = this.occupiedSeats().filter((s) => s.player.stack > 0);
    // Between hands nothing else will settle the Spin, so crown the last player now.
    if (this.spinStarted() && !this.spinWinner && alive.length === 1 && !this.handInProgress() && !this.nextHandAt) {
      this.awardSpinWinner();
    }
    return res;
  }

  /** A finished or human-less Spin goes back to a fresh, undrawn table between hands. */
  resetSpinIfIdle() {
    if (!this.spinStarted() || this.handInProgress()) return false;
    if (!this.spinWinner && this.humans().length) return false;
    for (const seat of this.seats) seat.player = null;
    Object.assign(this, {
      handNo: 0, spinMultiplier: null, spinPrize: 0, spinPayouts: null, spinWinner: null, finished: [],
      spinStartedAt: 0, spinCompletedHands: 0, spinLevel: 0,
      sb: this.cfg.sb, bb: this.cfg.bb, minRaise: this.cfg.bb, street: 'idle', nextHandAt: 0,
    });
    return true;
  }

  /**
   * Set the verified Spin blind level before a deal: minute steps for the 2x-5x rows, completed
   * hand steps for 10x and up, capped at the last level (server/spin.js spinBlindLevel).
   */
  applySpinBlinds() {
    // startHand only runs between hands, so every hand dealt since the draw has completed.
    this.spinCompletedHands = this.handNo;
    const { level, smallBlind, bigBlind } = spinBlindLevel(this.spinMultiplier, {
      startedAt: this.spinStartedAt, now: this.spinClock(), completedHands: this.spinCompletedHands,
    });
    const raised = this.spinLevel > 0 && level !== this.spinLevel;
    Object.assign(this, { spinLevel: level, sb: smallBlind, bb: bigBlind, minRaise: bigBlind });
    if (raised) this.emit({ type: 'blinds_up', sb: this.sb, bb: this.bb, level });
  }

  awardSpinWinner() {
    if (this.spinWinner || !this.spinPayouts) return;
    const w = this.occupiedSeats().find((s) => s.player && s.player.stack > 0);
    if (!w || !w.player) return;
    const first = this.recordSpinFinish(w.player, 1);
    if (this.hooks.onMint) this.hooks.onMint(this, 'spin', this.spinPrize);
    this.spinWinner = { nick: w.player.nick, id: w.player.id, prize: first ? first.payout : 0 };
    this.emit({ type: 'spin_win', ...this.spinWinner, multiplier: this.spinMultiplier });
    this.street = 'ended';
    this.nextHandAt = 0;
    if (this.hooks.onHandComplete) this.hooks.onHandComplete({ table: this, winner: { id: w.player.id } });
  }

  /** Clear the per-hand `inHand` flag once a hand is over and its delay ran out. */
  clearHandFlags() {
    for (const seat of this.seats) {
      if (seat.player) seat.player.inHand = false;
    }
  }

  awardTournamentWinner() {
    this.clearHandFlags();
    const w = this.occupiedSeats().find((s) => s.player && s.player.stack > 0);
    if (!w || !w.player) return;
    if (this.tournament?.managed) {
      // The tournament room owns the field: this table only reports that it is
      // down to one player, and the room decides the overall winner.
      this.street = 'ended';
      this.nextHandAt = 0;
      this.emit({ type: 'flight_settled', seat: w.index, nick: w.player.nick });
      if (this.hooks.onFlightSettled) this.hooks.onFlightSettled(this, { id: w.player.id, nick: w.player.nick });
      return;
    }
    if (this.satellite) {
      this.tournament.winner = { nick: w.player.nick, id: w.player.id, prize: 0, ticket: this.tournament.ticket };
      this.emit({ type: 'tourney_win', nick: w.player.nick, id: w.player.id, prize: 0, ticket: this.tournament.ticket, tableName: this.cfg.name });
      this.street = 'ended';
      this.nextHandAt = 0;
      if (this.hooks.onTournamentEnd) this.hooks.onTournamentEnd(this, this.tournament.winner);
      return;
    }
    const prize = payoutFor(this.tournamentPayouts(this.tournamentField()), 1);
    w.player.stack += prize;
    this.tournament.winner = { nick: w.player.nick, id: w.player.id, prize };
    this.emit({ type: 'tourney_win', nick: w.player.nick, id: w.player.id, prize, tableName: this.cfg.name });
    this.street = 'ended';
    this.nextHandAt = 0;
    if (this.hooks.onTournamentEnd) this.hooks.onTournamentEnd(this, this.tournament.winner);
  }

  /** Single-table field size: everyone seated plus everyone already out. */
  tournamentField() {
    return Math.max(Number(this.tournament?.entrants) || 0, this.occupiedSeats().length + this.finished.length);
  }

  /**
   * Paid places for this event (DanGG rule, tournament.js). A multi-table room
   * publishes the field-wide table on `tournament.payouts`; a single table
   * derives it from its own field.
   */
  tournamentPayouts(field = this.tournamentField()) {
    if (!this.tournament) return [];
    if (this.tournament.managed && Array.isArray(this.tournament.payouts)) return this.tournament.payouts;
    return payoutTable(field, this.tournament.prizePool, { mode: this.tournament.mode, ticket: this.tournament.ticket });
  }

  startHand() {
    this.timeBankUsed = new Set();
    // A deferred "sit out next hand" takes effect before this deal.
    for (const seat of this.seats) {
      const p = seat.player;
      if (p?.sitOutNextHand) { p.sittingOut = true; p.sitOutNextHand = false; }
    }
    const ready = this.readySeats();
    if (this.spin && this.handNo > 0 && ready.length === 1) { this.awardSpinWinner(); return; }
    if (this.tournament && this.handNo > 0 && ready.length === 1) { this.awardTournamentWinner(); return; }
    if (ready.length < 2) { this.street = 'idle'; return; }
    if (this.spin && this.handNo === 0) {
      // A Spin deals only at an observed stake and with all three seats filled.
      if (!this.spinStakeValid() || ready.length < SPIN_SEATS) { this.street = 'idle'; return; }
      if (!this.spinPayouts) this.drawSpin();
    }
    if (this.spinStarted()) this.applySpinBlinds();

    this.handNo++;
    this.markMissedBlinds();
    this.deck = shuffle(makeDeck(this.shortDeck));
    this.board = [];
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = this.bb;
    this.lastAggressor = null;
    this.result = null;
    this.showdown = false;
    this.boards = [];
    this.street = 'preflop';
    this.streetStartedAt = Date.now();
    this.history = [];
    this.log = [];
    this.handId = `${this.cfg.id}-${Date.now()}-${this.handNo}`;
    this.handStartStack = {};
    this.ghosts = [];
    this.rake = 0;
    // Blinds in force at the deal; a tournament level change mid-hand must not rewrite this hand's record.
    this.handBlinds = { sb: this.sb, bb: this.bb, ante: this.ante };

    for (const s of this.seats) {
      const p = s.player;
      if (!p) continue;
      p.inHand = this.isDealtIn(p);
      p.folded = !p.inHand;
      p.allIn = false;
      p.bet = 0;
      p.totalBet = 0;
      p.acted = false;
      p.reveal = false;
      p.shown = [];
      p.cards = [];
      p.lastAction = null;
      p.winAmount = 0;
      p.handsPlayed = (p.handsPlayed || 0) + 1;
      this.handStartStack[p.id] = p.stack;
    }

    let inHand = this.seats.filter((s) => s.player && s.player.inHand);
    // move button
    let idx = this.button;
    for (let i = 0; i < this.seats.length; i++) {
      idx = (idx + 1) % this.seats.length;
      const s = this.seats[idx];
      if (s.player && s.player.inHand) { this.button = idx; break; }
    }
    this.promoteWaitingBigBlind();
    inHand = this.seats.filter((s) => s.player && s.player.inHand);
    // empty seats are skipped
    const order = (from, pred = (s) => s.player && s.player.inHand) => {
      const out = [];
      for (let i = 0; i < this.seats.length; i++) {
        const s = this.seats[(from + i) % this.seats.length];
        if (pred(s)) out.push(s);
      }
      return out;
    };

    const postOrder = order(this.button + 1, (s) => s.player && s.player.inHand);
    let sbSeat, bbSeat;
    if (postOrder.length === 2) {
      sbSeat = this.seats[this.button];
      bbSeat = postOrder[0] === sbSeat ? postOrder[1] : postOrder[0];
      if (!sbSeat.player || !sbSeat.player.inHand) sbSeat = postOrder[0];
      if (bbSeat === sbSeat) bbSeat = postOrder[1];
    } else {
      sbSeat = postOrder[0];
      bbSeat = postOrder[1];
    }

    // Antes are dead money: straight into the pot, not part of the live bet to call (native
    // posts the ante and resets bets before the blinds). totalBet keeps them for side pots.
    if (this.ante > 0) {
      for (const s of inHand) {
        const amt = this.commit(s.player, this.ante);
        s.player.bet -= amt;
        this.pot += amt;
        if (s.player.stack === 0) s.player.allIn = true;
      }
    }
    this.postBlind(sbSeat, this.sb, 'SB');
    this.postBlind(bbSeat, this.bb, 'BB');
    this.sbSeat = sbSeat ? sbSeat.index : -1;
    this.bbSeat = bbSeat ? bbSeat.index : -1;
    this.postMissedBlinds(inHand, sbSeat, bbSeat);
    this.currentBet = this.bb;
    this.minRaise = this.bb;
    this.pendingDeal = { postOrder, sbSeat, bbSeat, straddleSeat: null, straddled: new Set() };
    if (this.openStraddleRound(this.bb * 2)) return;
    this.dealAndOpen();
  }

  /** Native straddle: everyone eligible is asked at once; auto-straddlers post without a prompt. */
  openStraddleRound(amount) {
    const d = this.pendingDeal;
    if (!d || !this.straddle || this.tournament || this.spin || this.bomb || (this.flip && this.handNo === 1)) return false;
    if (d.postOrder.filter((s) => s.player && s.player.inHand).length <= 2) return false;
    const candidates = straddleCandidates(this.seats, d.bbSeat.index, d.sbSeat.index, d.straddled);
    const auto = candidates.find((s) => s.player.autoStraddle && amount < s.player.stack + s.player.bet);
    if (auto) {
      this.postStraddle(auto, amount);
      return this.openStraddleRound(amount * 2);
    }
    const asked = candidates.filter((s) => !s.player.isBot && !s.player.sittingOut && !s.player.disconnected);
    if (!asked.length) return false;
    this.straddleRound = { amount, asked: new Set(asked.map((s) => s.player.id)), endsAt: Date.now() + STRADDLE_ASK_MS };
    this.emit({ type: 'straddle_ask', amount, endsAt: this.straddleRound.endsAt });
    return true;
  }

  postStraddle(seat, amountTo) {
    const p = seat.player;
    const add = Math.min(Math.max(0, amountTo - p.bet), p.stack);
    this.commit(p, add);
    p.lastAction = { action: 'Straddle', amount: p.bet };
    if (p.stack === 0) p.allIn = true;
    this.pendingDeal.straddled.add(p.id);
    // Only a straddle that sets the live bet moves the start of preflop action.
    if (p.bet > this.currentBet) {
      this.currentBet = p.bet;
      this.minRaise = p.bet;
      this.pendingDeal.straddleSeat = seat;
    }
  }

  decideStraddle(playerId, decision) {
    const round = this.straddleRound;
    if (!round || !round.asked.has(playerId)) return { ok: false, error: 'No straddle to decide' };
    const seat = this.seatOf(playerId);
    const p = seat.player;
    if (decision === 'no') {
      round.asked.delete(playerId);
      if (!round.asked.size) this.closeStraddleRound();
      return { ok: true };
    }
    const allInTo = p.stack + p.bet;
    if (decision === 'yes' && !(round.amount < allInTo)) return { ok: false, error: 'Not enough chips to straddle' };
    if (decision !== 'yes' && decision !== 'allin') return { ok: false, error: 'Unknown straddle decision' };
    this.straddleRound = null;
    this.postStraddle(seat, decision === 'allin' ? allInTo : round.amount);
    // The next offer doubles the live bet: an all-in above the offer raises it (Codex #58).
    if (!this.openStraddleRound(Math.max(round.amount, this.currentBet) * 2)) this.dealAndOpen();
    return { ok: true };
  }

  closeStraddleRound() {
    this.straddleRound = null;
    this.dealAndOpen();
  }

  dealAndOpen() {
    const { postOrder, sbSeat, bbSeat, straddleSeat } = this.pendingDeal;
    this.pendingDeal = null;
    // deal
    for (let round = 0; round < this.holeCount; round++) {
      for (const s of postOrder) {
        if (s.player && s.player.inHand) s.player.cards.push(this.deck.pop());
      }
    }

    this.emit({ type: 'hand_start', handNo: this.handNo, button: this.button, sbSeat: sbSeat.index, bbSeat: bbSeat.index });

    if (this.flip && this.handNo === 1) {
      for (const s of postOrder) if (s.player && s.player.inHand) s.player.allIn = true;
      this.setActor(null);
      this.runout();
      return;
    }

    if (this.bomb) {
      this.collectBets();
      this.street = 'flop';
      this.board.push(...this.dealStreet('flop'));
      this.currentBet = 0;
      this.minRaise = this.bb;
      this.emit({ type: 'street', street: 'flop', board: this.board.map(cardStr), pot: this.pot });
      const first = this.nextActionSeat(this.button);
      this.setActor(first ? first.player.id : null);
      return;
    }
    // Pre-flop action starts left of the big blind (or of the straddle when one is posted);
    // with two players that is the small blind, as the rules require.
    this.progress(straddleSeat ? straddleSeat.index : bbSeat.index);
  }

  /** Cash games owe a big blind after sitting out (native SitInCommand PostBlinds). */
  owesSitInBlind() {
    return !this.tournament && !this.spin && !this.elimination && !this.aof;
  }

  // A seat sitting out while a hand is dealt owes a big blind when it comes back.
  markMissedBlinds() {
    if (!this.owesSitInBlind()) return;
    for (const s of this.seats) {
      if (s.player && s.player.sittingOut && s.player.stack > 0) s.player.missedBlinds = true;
    }
  }

  // Returning players post a live big blind unless they already pay a blind this hand;
  // heads-up has no extra post.
  postMissedBlinds(inHand, sbSeat, bbSeat) {
    for (const s of inHand) {
      const p = s.player;
      if (!p.missedBlinds) continue;
      p.missedBlinds = false;
      if (s === bbSeat || s === sbSeat || inHand.length < 3) continue;
      this.postBlind(s, this.bb, 'Post Blind(s)');
    }
  }

  postBlind(seat, amount, label) {
    if (!seat || !seat.player) return;
    const p = seat.player;
    const amt = Math.min(amount, p.stack);
    this.commit(p, amt);
    p.lastAction = { action: label, amount: amt };
    if (p.stack === 0) p.allIn = true;
  }

  commit(player, amount) {
    const amt = Math.min(amount, player.stack);
    player.stack -= amt;
    player.bet += amt;
    player.totalBet += amt;
    return amt;
  }

  nextActionSeat(fromIndex) {
    for (let i = 1; i <= this.seats.length; i++) {
      const s = this.seats[(fromIndex + i) % this.seats.length];
      if (s.player && s.player.inHand && !s.player.folded && !s.player.allIn) return s;
    }
    return null;
  }

  nextActiveSeat(fromIndex) {
    for (let i = 1; i <= this.seats.length; i++) {
      const s = this.seats[(fromIndex + i) % this.seats.length];
      if (s.player && s.player.inHand && !s.player.folded) return s;
    }
    return null;
  }

  /**
   * Show one, several or all hole cards to the table after the hand ended.
   * Only a player who was dealt in and did not fold can reveal this way.
   */
  showCards(playerId, indices) {
    if (this.street !== 'ended') return { ok: false, error: 'Show cards at the end of the hand' };
    const seat = this.seatOf(playerId);
    const p = seat?.player;
    if (!p) return { ok: false, error: 'not seated' };
    // Native ShowMuck: anyone dealt into the hand may show, folded or not, once per hand.
    if (!p.inHand || !p.cards.length) return { ok: false, error: 'Only a player dealt into the hand can show cards' };
    if (!Array.isArray(indices) || !indices.length) return { ok: false, error: 'Pick a card first' };
    const picked = [...new Set(indices.map(Number))]
      .filter((i) => Number.isInteger(i) && i >= 0 && i < p.cards.length)
      .sort((a, b) => a - b);
    if (!picked.length) return { ok: false, error: 'Pick a card first' };
    if (p.shown?.length) {
      const same = p.shown.length === picked.length && p.shown.every((i, k) => i === picked[k]);
      return same ? { ok: true, shown: p.shown } : { ok: false, error: 'Cards already selected' };
    }
    p.shown = picked;
    if (p.shown.length >= p.cards.length) p.reveal = true;
    this.emit({
      type: 'cards_shown',
      seat: seat.index,
      playerId: p.id,
      nick: p.nick,
      indices: p.shown,
      cards: p.shown.map((i) => cardStr(p.cards[i])),
    });
    return { ok: true, shown: p.shown };
  }

  /**
   * Sit out now, or finish the current hand first like the native "Sit out next
   * hand" item. Value false sits the player back in immediately.
   */
  requestSitOut(playerId, value) {
    const seat = this.seatOf(playerId);
    const p = seat?.player;
    if (!p) return { ok: false, error: 'not seated' };
    if (!value) {
      // Deal Me In needs dealMeInMin chips; native opens Get Chips instead.
      const min = dealMeInMin({ bb: this.bb, dealMin: Number(this.cfg.deal_min) || 0 });
      if (p.sittingOut && !this.tournament && !this.spin && p.stack < min) {
        return { ok: false, error: `You need at least ${min} chips to be dealt in. Top up first.` };
      }
      p.sittingOut = false;
      p.sitOutNextHand = false;
      this.maybeStart();
      return { ok: true };
    }
    if (this.handInProgress() && p.inHand && !p.folded) p.sitOutNextHand = true;
    else p.sittingOut = true;
    return { ok: true };
  }

  /** Cash sit-out countdown (native KickOutTime): starts when a seat sits out, clears on return. */
  refreshSitOutClocks(now = Date.now(), waiting = 0) {
    const cash = !this.tournament && !this.spin;
    const rate = waiting > 0 ? 2 : 1; // native: twice as fast while players wait for a seat
    for (const seat of this.seats) {
      const p = seat.player;
      if (!p || p.isBot) continue;
      if (!cash || !p.sittingOut) { p.kickOutAt = 0; p.sitOutLeftMs = 0; continue; }
      if (!p.sitOutLeftMs) {
        p.sitOutLeftMs = SIT_OUT_KICK_MS;
      } else {
        p.sitOutLeftMs = Math.max(0, p.sitOutLeftMs - (now - p.sitOutClockAt) * (p.sitOutRate || 1));
      }
      p.sitOutClockAt = now;
      p.sitOutRate = rate;
      p.kickOutAt = now + p.sitOutLeftMs / rate;
    }
  }

  /** Seats whose sit-out time ran out and that are not in a live hand (SitOutTimeExpired). */
  expiredSitOuts(now = Date.now()) {
    if (this.tournament || this.spin) return [];
    return this.seats
      .map((s) => s.player)
      .filter((p) => p && p.sittingOut && p.kickOutAt && now >= p.kickOutAt && !(this.handInProgress() && p.inHand && !p.folded))
      .map((p) => p.id);
  }

  setAutoStraddle(userId, value) {
    const seat = this.seatOf(userId);
    if (!seat?.player) return { ok: false, error: 'Take a seat first' };
    seat.player.autoStraddle = !!value;
    return { ok: true };
  }

  straddleAskFor(viewerId) {
    const round = this.straddleRound;
    if (!round || !viewerId || !round.asked.has(viewerId)) return null;
    const p = this.seatOf(viewerId)?.player;
    if (!p) return null;
    const allInTo = p.stack + p.bet;
    return { amount: round.amount, allInTo, canStraddle: round.amount < allInTo, endsAt: round.endsAt };
  }

  setAutoMuck(userId, value) {
    const seat = this.seatOf(userId);
    if (seat?.player) seat.player.autoMuck = !!value;
    return { ok: true };
  }

  setInsurance(userId, value) {
    if (!this.spin) return { ok: false, error: 'insurance is Spin & Gold only' };
    // Native Spin insurance settlement is unobserved; do not invent premiums/payouts.
    return { ok: false, error: 'Insurance is not available in DanGG' };
    if (this.street !== 'idle' && this.street !== 'ended') return { ok: false, error: 'between hands only' };
    const seat = this.seatOf(userId);
    if (!seat?.player) return { ok: false, error: 'not seated' };
    const p = seat.player;
    if (value && !p.insurance) {
      const premium = Math.round(this.cfg.min_buyin * 0.05);
      if (p.stack <= premium) return { ok: false, error: 'not enough stack for insurance' };
      p.stack -= premium;
      p.insurance = true;
      p.insurancePremium = premium;
      this.emit({ type: 'insurance_bought', seat: seat.index, premium });
    }
    return { ok: true };
  }

  setRunItTwice(value) {
    if (this.street !== 'idle' && this.street !== 'ended') return { ok: false, error: 'between hands only' };
    this.runItTwice = !!value;
    return { ok: true };
  }

  setStraddle(value) {
    if (this.street !== 'idle' && this.street !== 'ended') return { ok: false, error: 'between hands only' };
    this.straddle = !!value;
    return { ok: true };
  }

  setActor(playerId) {
    this.actor = playerId;
    if (!playerId) return;
    const seat = this.seatOf(playerId);
    this.actionEndsAt = Date.now() + this.actionTimeMs;
    if (seat && seat.player && seat.player.isBot) {
      this.botActAt = Date.now() + Math.max(400, this.botSpeed * (0.5 + Math.random()));
    } else {
      this.botActAt = 0;
    }
    // Time Bank Cards are limited per action; a new turn starts a fresh count.
    this.timeBankAction = null;
    const actorCards = this.seatOf(playerId)?.player?.timeBankCards ?? 0;
    this.timeBankUsed = new Set(actorCards > 0 ? [] : [playerId]);
    this.emit({ type: 'turn', playerId, endsAt: this.actionEndsAt });
  }

  /** Spends one Time Bank Card on the current action (native TimeBankCardInfo1/2). */
  useTimeBank(playerId) {
    const seat = this.seatOf(playerId);
    if (!seat || !seat.player) return { ok: false, error: 'not seated' };
    if (this.actor !== playerId) return { ok: false, error: 'not your turn' };
    const p = seat.player;
    const usedThisAction = this.timeBankAction?.playerId === playerId ? this.timeBankAction.used : 0;
    if (!canSpendCard({ cards: p.timeBankCards ?? 0, usedThisAction })) {
      return { ok: false, error: (p.timeBankCards ?? 0) > 0 ? 'time bank limit for this action' : 'no time bank cards' };
    }
    p.timeBankCards -= 1;
    this.timeBankAction = { playerId, used: usedThisAction + 1 };
    if (!canSpendCard({ cards: p.timeBankCards, usedThisAction: usedThisAction + 1 })) this.timeBankUsed.add(playerId);
    this.actionEndsAt += TB_CARD_SECONDS * 1000;
    this.emit({ type: 'timebank', playerId, seconds: TB_CARD_SECONDS, cards: p.timeBankCards, endsAt: this.actionEndsAt });
    return { ok: true, seconds: TB_CARD_SECONDS, cards: p.timeBankCards, endsAt: this.actionEndsAt };
  }

  /** Every dealt-in player moves one hand closer to the next free card. */
  refillTimeBanks() {
    for (const s of this.seats) {
      const p = s.player;
      if (!p?.inHand) continue;
      const next = refillAfterHand({ cards: p.timeBankCards ?? TB_START_CARDS, hands: p.timeBankHands ?? 0 });
      p.timeBankCards = next.cards;
      p.timeBankHands = next.hands;
    }
  }

  toCall(player) {
    return Math.max(0, this.currentBet - player.bet);
  }

  /* ------------------------------ actions ------------------------------ */

  // Largest legal raise-to in a pot-limit game: the bet to call plus the pot after calling.
  potLimitMax(player) {
    const potAfterCall = this.pot + this.totalBets() + this.toCall(player);
    return Math.min(player.bet + player.stack, this.currentBet + potAfterCall);
  }

  // opts.auto marks an action taken by the server (timeout / sit-out) rather than by the player.
  act(playerId, action, amount = 0, opts = {}) {
    const seat = this.seatOf(playerId);
    if (!seat || !seat.player) return { ok: false, error: 'not seated' };
    const p = seat.player;
    if (this.actor !== playerId) return { ok: false, error: 'not your turn' };
    if (p.folded || p.allIn) return { ok: false, error: 'cannot act' };

    if (!opts.auto) p.missedTurns = 0;
    const call = this.toCall(p);
    if (this.aof && action === 'call' && !this.lastAggressor) return { ok: false, error: 'all-in or fold only' };
    if (action === 'fold') {
      p.folded = true;
      p.lastAction = { action: 'Fold', amount: 0 };
      if (this.rush && !p.isBot) p.rushQueued = true;
      this.log.push({ nick: p.nick, action: 'fold', street: this.street });
      this.emit({ type: 'action', seat: seat.index, playerId, action: 'fold' });
    } else if (action === 'check') {
      if (call > 0) return { ok: false, error: 'cannot check' };
      p.lastAction = { action: 'Check', amount: 0 };
      p.acted = true;
      p.actedAtBet = this.currentBet;
      this.log.push({ nick: p.nick, action: 'check', street: this.street });
      this.emit({ type: 'action', seat: seat.index, playerId, action: 'check' });
    } else if (action === 'call') {
      if (call <= 0) return this.act(playerId, 'check', 0, opts);
      const paid = this.commit(p, Math.min(call, p.stack));
      if (p.stack === 0) p.allIn = true;
      p.lastAction = { action: 'Call', amount: paid };
      p.acted = true;
      p.actedAtBet = this.currentBet;
      this.log.push({ nick: p.nick, action: 'call', amount: paid, street: this.street });
      this.emit({ type: 'action', seat: seat.index, playerId, action: 'call', amount: paid, allIn: p.allIn });
    } else if (['bet', 'raise', 'allin'].includes(action)) {
      const maxTarget = p.bet + p.stack;
      let target = action === 'allin' ? maxTarget : Math.round(Number(amount) || 0);
      if (target > maxTarget) target = maxTarget;
      if (this.potLimit) target = Math.min(target, this.potLimitMax(p));
      if (target <= this.currentBet) {
        // An all-in that does not exceed the current bet is a call, never a "raise" that lowers the bet.
        if (action === 'allin' || target >= maxTarget) return this.act(playerId, 'call', 0, opts);
        return { ok: false, error: 'raise too small' };
      }
      const isAllIn = target === maxTarget;
      const raiseSize = target - this.currentBet;
      // A player who already acted may only raise again once the bet has grown by a full raise
      // since their last action; several short all-ins can add up to that.
      const isRaiseLocked = p.acted && this.currentBet - (p.actedAtBet ?? 0) < this.minRaise;
      if (isRaiseLocked) {
        if (action === 'allin') return this.act(playerId, 'call', 0, opts);
        return { ok: false, error: 'raise not allowed after a short all-in' };
      }
      if (this.aof && !isAllIn) return { ok: false, error: 'all-in or fold only' };
      if (!isAllIn && raiseSize < this.minRaise) return { ok: false, error: 'raise too small' };
      const isFullRaise = raiseSize >= this.minRaise;
      const paid = this.commit(p, target - p.bet);
      const previousBet = this.currentBet;
      this.currentBet = p.bet;
      if (isFullRaise) this.minRaise = raiseSize;
      if (p.stack === 0) p.allIn = true;
      for (const s of this.seats) {
        const other = s.player;
        if (!other || !other.inHand || other.folded || other.allIn || other.id === p.id) continue;
        // A short all-in leaves `acted` set: those players still owe a call, but see isRaiseLocked.
        if (isFullRaise) other.acted = false;
      }
      p.acted = true;
      p.actedAtBet = this.currentBet;
      this.lastAggressor = p.id;
      const label = previousBet === 0 ? 'Bet' : 'Raise';
      p.lastAction = { action: label, amount: target };
      this.log.push({ nick: p.nick, action: label.toLowerCase(), amount: target, street: this.street });
      this.emit({
        type: 'action', seat: seat.index, playerId, action: label.toLowerCase(),
        amount: target, paid, allIn: p.allIn, pot: this.pot + this.totalBets(),
      });
    } else {
      return { ok: false, error: 'unknown action' };
    }
    this.afterAction(p);
    return { ok: true };
  }

  totalBets() {
    return this.seats.reduce((a, s) => a + (s.player ? s.player.bet : 0), 0)
      + this.ghosts.reduce((a, g) => a + g.bet, 0);
  }

  afterAction(p) {
    const seat = this.seatOf(p.id);
    this.progress(seat ? seat.index : this.button);
  }

  // Decide what happens after the player at `fromIndex` acted (or left): finish the hand,
  // close the betting round, or hand the action to the next player who owes a decision.
  progress(fromIndex, { keepActor = false } = {}) {
    if (this.straddleRound) return;
    if (!this.handInProgress()) return;
    const alive = this.activePlayers();
    if (alive.length <= 1) { this.finishByFold(alive[0]); return; }
    const contenders = alive.filter((s) => !s.player.allIn);
    const owesAction = (s) => !s.player.acted || s.player.bet < this.currentBet;
    // A lone player with chips behind has nobody left to bet against once the bet is matched.
    const loneAndMatched = contenders.length === 1 && contenders[0].player.bet >= this.currentBet;
    const pending = loneAndMatched ? [] : contenders.filter(owesAction);
    if (pending.length === 0) {
      // All-in or Fold has no post-flop betting: once the shoves are settled the board runs out.
      if (contenders.length <= 1 || this.aof) this.runout();
      else this.endStreet();
      return;
    }
    if (keepActor && this.actor) return;
    for (let i = 1; i <= this.seats.length; i++) {
      const s = this.seats[(fromIndex + i) % this.seats.length];
      if (pending.includes(s)) { this.setActor(s.player.id); return; }
    }
  }

  /** Return a departing player's bet above everyone else's, and lower the bet to match. */
  returnLeaverExcess(p) {
    const others = [
      ...this.seats.filter((s) => s.player && s.player !== p && s.player.inHand).map((s) => s.player.bet),
      ...this.ghosts.map((g) => g.bet),
    ];
    const highest = others.length ? Math.max(...others) : 0;
    const excess = Math.max(0, p.bet - highest);
    if (excess > 0) {
      p.bet -= excess;
      p.totalBet -= excess;
      p.stack += excess;
      this.emit({ type: 'uncalled', seat: p.seat, playerId: p.id, amount: excess });
    }
    this.currentBet = Math.min(this.currentBet, Math.max(highest, p.bet));
  }

  /**
   * Pots for settlement from every contribution this hand, including departed seats.
   * A layer only one live player paid into is credited straight back to them; a departed
   * seat cannot take chips back, so its (rare) unmatched layer stays in the top pot.
   */
  settlementPots() {
    const live = this.seats.filter((s) => s.player && s.player.totalBet > 0).map((s) => s.player);
    const contributions = [
      ...live.map((p) => ({ key: p.id, amount: p.totalBet, folded: !!p.folded })),
      ...this.ghosts.filter((g) => g.totalBet > 0).map((g) => ({ key: g, amount: g.totalBet, folded: true })),
    ];
    const { pots, returns } = buildPots(contributions);
    for (const r of returns) {
      const p = live.find((x) => x.id === r.key);
      if (p) { p.stack += r.amount; this.pot -= r.amount; }
      else if (pots.length) pots[pots.length - 1].amount += r.amount;
    }
    return pots;
  }

  // Give back the part of the largest bet that nobody matched, so it is never raked or contested.
  returnUncalledBet() {
    const bets = [
      ...this.seats.filter((s) => s.player).map((s) => ({ player: s.player, bet: s.player.bet })),
      ...this.ghosts.map((g) => ({ player: null, bet: g.bet })),
    ].sort((a, b) => b.bet - a.bet);
    if (bets.length < 2 || !bets[0].player) return 0;
    const excess = bets[0].bet - bets[1].bet;
    if (excess <= 0) return 0;
    const p = bets[0].player;
    p.bet -= excess;
    p.totalBet -= excess;
    p.stack += excess;
    if (p.stack > 0) p.allIn = false;
    this.emit({ type: 'uncalled', seat: p.seat, playerId: p.id, amount: excess });
    return excess;
  }

  runout() {
    this.collectBets();
    if (this.runItTwice && this.activePlayers().filter((s) => !s.player.folded).length >= 2) {
      this.runoutTwice();
      return;
    }
    this.street = 'showdown';
    this.actor = null;
    while (this.board.length < 5) {
      if (this.board.length === 0) this.board.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
      else this.board.push(this.deck.pop());
    }
    this.emit({ type: 'runout', board: this.board.map(cardStr) });
    this.showdownDelay = 4200;
    this.nextHandAt = Date.now() + this.showdownDelay;
    this.doShowdown();
  }

  runoutTwice() {
    this.street = 'showdown';
    this.actor = null;
    this.collectBets();
    const alive = this.activePlayers().filter((s) => !s.player.folded);
    if (alive.length < 2) { this.doShowdown(); return; }
    const board1 = [];
    const board2 = [];
    while (board1.length < 5) board1.push(this.deck.pop());
    while (board2.length < 5) board2.push(this.deck.pop());
    const evaluate = (board) => alive.map((s) => {
      const p = s.player;
      const best = this.omaha ? bestOmaha(p.cards, board) : bestHoldem(p.cards, board);
      return { seat: s.index, player: p, score: best.score, name: best.name, cards: best.cards };
    });
    const scored = [evaluate(board1), evaluate(board2)];

    // Same native settlement as a single board, including chips left by departed seats.
    const pots = this.settlementPots().map((pot) => ({ amount: pot.amount, ids: pot.eligible }));
    const rake = this.computeRake(this.pot);
    this.rake = rake;
    let remain = rake;
    for (const pot of pots) {
      const take = Math.min(pot.amount, remain);
      pot.amount -= take;
      remain -= take;
      if (remain <= 0) break;
    }

    const results = [];
    const award = (scoredBoard, amount, boardIndex, eligible) => {
      if (amount <= 0 || !eligible.length) return;
      const candidates = scoredBoard.filter((sc) => eligible.includes(sc.player.id));
      if (!candidates.length) return;
      let best = null;
      for (const sc of candidates) if (!best || compareScores(sc.score, best.score) > 0) best = sc;
      const tied = candidates.filter((sc) => compareScores(sc.score, best.score) === 0);
      const order = oddChipOrder(tied.map((sc) => sc.seat), this.button, this.seats.length);
      const winners = order.map((seat) => tied.find((sc) => sc.seat === seat));
      const share = Math.floor(amount / winners.length);
      let remainder = amount - share * winners.length;
      for (const w of winners) {
        let amt = share;
        if (remainder > 0) { amt++; remainder--; }
        w.player.stack += amt;
        w.player.winAmount += amt;
        const prior = results.find((r) => r.id === w.player.id);
        if (prior) {
          prior.amount += amt;
          prior.boards = [...new Set([...(prior.boards || []), boardIndex])];
        } else {
          results.push({
            id: w.player.id, nick: w.player.nick, seat: w.seat, amount: amt,
            hand: w.name, cards: w.cards.map(cardStr), board: boardIndex, boards: [boardIndex],
          });
        }
      }
    };

    for (const pot of pots) {
      const half = Math.floor(pot.amount / 2);
      award(scored[0], half, 0, pot.ids);
      award(scored[1], pot.amount - half, 1, pot.ids);
    }

    const doubleWinnerIds = new Set(results.map((r) => r.id));
    for (const sc of alive) {
      const p = sc.player;
      if (doubleWinnerIds.has(p.id) || !p.autoMuck) p.reveal = true;
    }
    this.board = board1;
    this.boards = [board1, board2];
    const summary = {
      pot: this.pot, rake, board: board1.map(cardStr), boards: [board1.map(cardStr), board2.map(cardStr)],
      winners: results, runItTwice: true, reason: 'showdown',
      hands: alive.map((s) => ({ seat: s.index, nick: s.player.nick, cards: s.player.cards.map(cardStr) })),
    };
    this.result = this.publicShowdown(summary);
    this.street = 'ended';
    this.nextHandAt = Date.now() + this.showdownDelay;
    this.emit({ type: 'win', ...this.result });
    this.saveHand(summary);
    this.updateMissionProgress(results[0] || null);
  }

  collectBets() {
    this.returnUncalledBet();
    for (const s of this.seats) {
      if (!s.player) continue;
      this.pot += s.player.bet;
      s.player.bet = 0;
    }
    for (const g of this.ghosts) {
      this.pot += g.bet;
      g.bet = 0;
    }
    this.currentBet = 0;
  }

  endStreet() {
    this.collectBets();
    this.actor = null;
    if (this.street === 'river') { this.doShowdown(); return; }
    if (this.street === 'preflop') this.street = 'flop';
    else if (this.street === 'flop') this.street = 'turn';
    else if (this.street === 'turn') this.street = 'river';
    this.board.push(...this.dealStreet(this.street));
    for (const s of this.seats) {
      if (s.player) { s.player.acted = false; s.player.lastAction = null; }
    }
    this.currentBet = 0;
    this.minRaise = this.bb;
    this.lastAggressor = null;
    this.emit({ type: 'street', street: this.street, board: this.board.map(cardStr), pot: this.pot });
    this.progress(this.button);
  }

  dealStreet(street) {
    const out = [];
    if (street === 'flop') out.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
    else out.push(this.deck.pop());
    return out;
  }

  // "No flop, no drop": hands that end before the flop are not raked.
  rakeFor(pot) {
    return this.board.length >= 3 ? this.computeRake(pot) : 0;
  }

  computeRake(pot) {
    if (this.tournament || this.spin) return 0;
    const raw = Math.floor((pot * this.rakePercent) / 100);
    return Math.min(raw, this.rakeCap);
  }

  finishByFold(winnerSeat) {
    if (!this.handInProgress()) return;
    this.collectBets();
    const winner = winnerSeat ? winnerSeat.player : null;
    const rake = winner ? this.rakeFor(this.pot) : 0;
    this.rake = rake;
    const award = this.pot - rake;
    if (winner) {
      winner.stack += award;
      winner.winAmount = award;
    }
    const summary = {
      pot: this.pot,
      rake,
      winners: winner ? [{ id: winner.id, nick: winner.nick, amount: award, hand: null }] : [],
      board: this.board.map(cardStr),
      reason: 'fold',
    };
    for (const s of this.seats) if (s.player) s.player.insurance = false;
    this.result = summary;
    this.street = 'ended';
    this.actor = null;
    this.nextHandAt = Date.now() + (winner && winner.isBot ? 1800 : 3000);
    this.emit({ type: 'win', ...summary });
    this.saveHand(summary);
    this.updateMissionProgress(winner);
  }

  doShowdown() {
    this.collectBets();
    const alive = this.activePlayers().filter((s) => !s.player.folded);
    const scored = alive.map((s) => {
      const p = s.player;
      const best = this.omaha ? bestOmaha(p.cards, this.board) : bestHoldem(p.cards, this.board, this.shortDeck);
      return { seat: s.index, player: p, score: best.score, name: best.name, cards: best.cards };
    });
    // Native settlement (server/pots.js): merged contribution layers, unmatched layers returned.
    const pots = this.settlementPots().map((pot) => ({
      amount: pot.amount,
      eligible: scored.filter((sc) => pot.eligible.includes(sc.player.id)),
    }));
    const rake = this.rakeFor(this.pot);
    this.rake = rake;
    if (rake > 0 && pots.length) {
      let remain = rake;
      for (const pot of pots) {
        const take = Math.min(pot.amount, remain);
        pot.amount -= take;
        remain -= take;
        if (remain <= 0) break;
      }
    }
    const results = [];
    for (const [potIndex, pot] of pots.entries()) {
      if (!pot.eligible.length) continue;
      let best = null;
      for (const sc of pot.eligible) {
        if (!best || compareScores(sc.score, best.score) > 0) best = sc;
      }
      const tied = pot.eligible.filter((sc) => compareScores(sc.score, best.score) === 0);
      // Odd chips go clockwise from the first winner left of the button (native settlePots).
      const order = oddChipOrder(tied.map((sc) => sc.seat), this.button, this.seats.length);
      const winners = order.map((seat) => tied.find((sc) => sc.seat === seat));
      const share = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount - share * winners.length;
      for (const w of winners) {
        let amt = share;
        if (remainder > 0) { amt++; remainder--; }
        w.player.stack += amt;
        w.player.winAmount += amt;
        results.push({
          id: w.player.id, nick: w.player.nick, seat: w.seat, amount: amt,
          hand: w.name, cards: w.cards.map(cardStr), pot: pot.amount, potIndex,
        });
      }
    }
    // Winners show at showdown; losing hands muck unless the player turned
    // auto-muck off.
    const winnerIds = new Set(results.map((r) => r.id));
    for (const sc of scored) {
      const p = sc.player;
      if (winnerIds.has(p.id) || !p.autoMuck) p.reveal = true;
    }
    const summary = {
      pot: this.pot,
      rake,
      board: this.board.map(cardStr),
      winners: results,
      hands: scored.map((s) => ({
        seat: s.seat, nick: s.player.nick, cards: s.player.cards.map(cardStr), hand: s.name,
      })),
      reason: 'showdown',
    };
    const badBeat = this.payBadBeatJackpot(scored, pots, results);
    if (badBeat) summary.badBeat = badBeat;
    this.result = this.publicShowdown(summary);
    this.street = 'ended';
    this.actor = null;
    this.nextHandAt = Date.now() + this.showdownDelay;
    this.emit({ type: 'win', ...this.result });
    this.saveHand(summary);
    this.updateMissionProgress(results[0]);
  }

  /** Cash Hold'em/Omaha only: native excludes AoF and featured tables (HandHistory.getBadBeatJackpotSummaryVo). */
  badBeatEligible() {
    return !this.elimination && !this.aof && !this.shortDeck && typeof this.hooks.jackpotPool === 'function';
  }

  /** Pays the Bad Beat Jackpot into stacks when a qualifying hand loses at showdown. */
  payBadBeatJackpot(scored, pots, results) {
    if (!this.badBeatEligible() || scored.length < 2) return null;
    // Players who folded and left mid-hand are kept as ghosts; they were dealt in too.
    const departed = new Map(this.ghosts.map((g) => [g.id, g]));
    const seated = this.seats.filter((s) => s.player?.inHand).map((s) => s.player.id);
    const payout = badBeatPayout({
      pool: this.hooks.jackpotPool(),
      omaha: this.omaha,
      pots: pots.map((pot, potIndex) => ({
        eligibleIds: pot.eligible.map((sc) => sc.player.id),
        winnerIds: results.filter((r) => r.potIndex === potIndex).map((r) => r.id),
      })),
      dealtIn: [...new Set([...seated, ...departed.keys()])],
      scored: scored.map((sc) => ({
        id: sc.player.id, score: sc.score, hole: sc.player.cards.map(cardStr), best: sc.cards.map(cardStr),
      })),
    });
    if (!payout) return null;
    // Seated recipients are paid into their stack; departed ones through onBadBeatJackpot (wallet).
    const shares = payout.shares.map((share) => {
      const seat = this.seatOf(share.id);
      if (seat?.player) {
        seat.player.stack += share.amount;
        return { ...share, nick: seat.player.nick, seat: seat.index, departed: false };
      }
      return { ...share, nick: departed.get(share.id)?.nick || '', seat: -1, departed: true };
    });
    const badBeat = { total: payout.total, shares };
    this.hooks.onBadBeatJackpot?.(this, badBeat);
    this.emit({ type: 'bad_beat_jackpot', ...badBeat });
    return badBeat;
  }

  updateMissionProgress(winner) {
    this.refillTimeBanks();
    if (this.hooks.onHandComplete) {
      this.hooks.onHandComplete({ table: this, winner, summary: this.result });
    }
  }

  /**
   * The showdown summary every listener may see: hands that were mucked keep their
   * seat (for the reveal order) but lose their cards. The full summary is only saved
   * to hand history, which filters per viewer on read.
   */
  publicShowdown(summary) {
    const revealed = (seat) => !!this.seats[seat]?.player?.reveal;
    return {
      ...summary,
      hands: (summary.hands || []).map((h) => (revealed(h.seat) ? h : { ...h, cards: null, hand: null })),
    };
  }

  saveHand(summary) {
    const players = this.seats.filter((s) => s.player).map((s) => ({
      id: s.player.id, nick: s.player.nick, stack: s.player.stack,
      cards: s.player.cards.map(cardStr), folded: s.player.folded, inHand: s.player.inHand,
      win: s.player.winAmount, totalBet: s.player.totalBet,
      seat: s.index, isBot: s.player.isBot, showed: !!s.player.reveal || (s.player.shown || []).length > 0,
    }));
    const hero = this.humans()[0];
    if (this.hooks.onHandSave) {
      this.hooks.onHandSave({
        handId: this.handId, handNo: this.handNo, tableId: this.cfg.id, tableName: this.cfg.name, game: this.cfg.game,
        players, board: this.board.map(cardStr), pot: summary.pot, result: summary,
        heroCards: hero ? hero.cards.map(cardStr).join(' ') : '',
        actions: this.log || [],
        meta: { button: this.button, blinds: this.handBlinds || null },
      });
    }
  }

  /* ------------------------------ tick / bots ------------------------------ */

  /**
   * Cash tables pause the next deal for a busted human so they can reload.
   * Returns true when a window was opened (and nextHandAt pushed out by it).
   */
  openRebuyWindow(now = Date.now()) {
    if (this.tournament || this.spin) return false;
    const busted = this.humans().filter((p) => p.stack <= 0 && !p.rebuyPrompted);
    if (!busted.length) return false;
    const until = now + REBUY_WINDOW_MS;
    this.rebuyHoldUntil = until;
    this.nextHandAt = Math.max(this.nextHandAt || 0, until);
    for (const p of busted) {
      p.rebuyPrompted = true;
      this.emit({
        type: 'rebuy_offer',
        playerId: p.id,
        nick: p.nick,
        until,
        min: Math.max(0, Number(this.cfg.min_buyin) - p.stack),
        max: Math.max(0, Number(this.cfg.max_buyin) - p.stack),
      });
    }
    return true;
  }

  /** A reload clears the prompt; when every busted player reloaded, deal sooner. */
  clearRebuyHold(playerId) {
    const seat = this.seatOf(playerId);
    if (seat?.player) seat.player.rebuyPrompted = false;
    this.rebuyHoldUntil = 0;
    const stillWaiting = this.humans().some((p) => p.stack <= 0 && p.rebuyPrompted);
    if (stillWaiting) return;
    if (this.nextHandAt && (this.street === 'ended' || this.street === 'idle')) {
      this.nextHandAt = Math.min(this.nextHandAt, Date.now() + 1500);
    }
  }

  /** Recompute this flight's blinds when the shared tournament level moved. */
  applyTournamentLevel() {
    if (!this.tournament) return;
    const level = Math.max(1, Number(this.tournament.level) || 1);
    if (this.appliedLevel === level) return;
    this.appliedLevel = level;
    const baseSb = Number(this.tournament.baseSb) || this.sb;
    const baseBb = Number(this.tournament.baseBb) || this.bb;
    this.sb = Math.round(baseSb * 1.5 ** (level - 1));
    this.bb = Math.round(baseBb * 1.5 ** (level - 1));
    this.minRaise = this.bb;
    this.levelStartedAt = Number(this.tournament.levelStartedAt) || this.levelStartedAt;
    const nextBlindAt = this.levelStartedAt + Number(this.tournament.blindEvery || 0) * 60000;
    this.emit({ type: 'blinds_up', sb: this.sb, bb: this.bb, level, nextBlindAt });
  }

  tick(now = Date.now()) {
    this.expireReservations(now);
    if (this.tournament) {
      // Flights share one level clock; the first table to tick advances it and
      // every other flight picks the new level up on its own next tick.
      const interval = Number(this.tournament.blindEvery) * 60000;
      const startedAt = Number(this.tournament.levelStartedAt) || this.levelStartedAt;
      if (interval > 0 && now - startedAt >= interval) {
        const levels = Math.floor((now - startedAt) / interval);
        this.tournament.level = (Number(this.tournament.level) || 1) + levels;
        this.tournament.levelStartedAt = startedAt + levels * interval;
      }
      this.applyTournamentLevel();
    }
    if (this.street === 'ended' || this.street === 'idle') {
      if (this.nextHandAt && now >= this.nextHandAt) {
        // Give a fresh bust a reload window before the next deal.
        if (this.openRebuyWindow(now)) return;
        this.nextHandAt = 0;
        // The hand is fully resolved: nobody is in it any more, so the room
        // may balance or break this table before the next deal.
        this.clearHandFlags();
        // remove busted bots, rebuy bots so the table stays alive
        for (const s of this.seats) {
          if (s.player && s.player.isBot && s.player.stack <= 0 && !this.elimination) {
            s.player.stack = this.cfg.max_buyin;
            if (this.hooks.onMint) this.hooks.onMint(this, 'bot', this.cfg.max_buyin);
          }
        }
        if (this.elimination) {
          const aliveCount = this.occupiedSeats().filter((x) => x.player && x.player.stack > 0).length;
          // Busted seats are cleared inside the loop, so size the field first.
          const field = this.tournamentField();
          let batch = 0;
          for (const s of [...this.seats]) {
            if (s.player && s.player.stack <= 0) {
              const busted = s.player;
              if (this.tournament && !this.tournament.managed) {
                // Single-table events rank and pay out inside this table; a
                // multi-table event ranks the whole field in its room instead.
                const alive = aliveCount;
                const place = alive + 1 + batch;
                batch++;
                const payout = payoutFor(this.tournamentPayouts(field), place);
                this.finished.push({ nick: busted.nick, id: busted.id, place, payout });
                if (payout > 0 && this.hooks.onTournamentPayout) this.hooks.onTournamentPayout(this, { id: busted.id, nick: busted.nick, place, payout });
              } else if (this.spin) {
                this.recordSpinFinish(busted, aliveCount + 1 + batch);
                batch++;
              }
              if (this.bounty > 0 && (this.mystery || this.tournament.mode === 'BOUNTY')) {
                const killerSeat = this.lastAggressor ? this.seatOf(this.lastAggressor) : null;
                const killer = killerSeat?.player && killerSeat.player.stack > 0
                  ? killerSeat.player
                  : this.occupiedSeats().find((x) => x.player && x.player.stack > 0)?.player;
                if (killer && killer.id !== busted.id) {
                  const tiers = [0.1, 0.25, 0.5, 1, 2, 5, 10];
                  const amount = this.mystery
                    ? Math.round(this.bounty * tiers[Math.floor(Math.random() * tiers.length)])
                    : this.bounty;
                  this.hooks.onBounty?.(this, {
                    winnerId: killer.id, winnerNick: killer.nick,
                    bustedId: busted.id, bustedNick: busted.nick,
                    amount, mystery: this.mystery,
                  });
                  this.emit({
                    type: 'bounty', seat: s.index, winnerId: killer.id, winnerNick: killer.nick,
                    bustedNick: busted.nick, amount, mystery: this.mystery,
                  });
                }
              }
              try { if (this.hooks.onSeatBusted) this.hooks.onSeatBusted(this, busted); } catch (e) { console.error('seat busted hook', e); }
              if (this.tournament && this.hooks.onTournamentBust) this.hooks.onTournamentBust(this, { id: busted.id, nick: busted.nick });
              s.player = null;
              this.emit({ type: 'stand', seat: s.index });
            }
          }
        }
        const alive = this.occupiedSeats().filter((s) => s.player && s.player.stack > 0);
        if (this.readySeats().length >= 2) this.startHand();
        else if (this.tournament && alive.length === 1 && this.handNo > 0) this.awardTournamentWinner();
        else if (this.spin && alive.length === 1 && this.handNo > 0) this.awardSpinWinner();
      }
      return;
    }
    if (this.straddleRound) {
      if (now >= this.straddleRound.endsAt) this.closeStraddleRound();
      return;
    }
    // Self-heal: a live hand must always have someone to act.
    if (!this.actor) { this.progress(this.button); return; }
    const seat = this.seatOf(this.actor);
    if (!seat || !seat.player) { this.actor = null; this.progress(this.button); return; }
    const p = seat.player;
    if (p.sittingOut) {
      this.act(p.id, this.toCall(p) > 0 ? 'fold' : 'check', 0, { auto: true });
      return;
    }
    if (p.isBot) {
      if (now >= this.botActAt) this.botAct(p);
      return;
    }
    if (now >= this.actionEndsAt) {
      // Two timeouts in a row sit the player out so an absent player cannot stall the table.
      p.missedTurns = (p.missedTurns || 0) + 1;
      if (p.missedTurns >= MAX_MISSED_TURNS && !p.sittingOut) {
        p.sittingOut = true;
        this.emit({ type: 'sit_out', seat: seat.index, playerId: p.id, reason: 'timeout' });
      }
      this.act(p.id, this.toCall(p) > 0 ? 'fold' : 'check', 0, { auto: true });
    }
  }

  botAct(p) {
    const seat = this.seatOf(p.id);
    if (!seat) return;
    const call = this.toCall(p);
    const pot = this.pot + this.totalBets();
    const opponents = this.activePlayers().filter((s) => !s.player.folded && s.player.id !== p.id).length;
    let equity = 0.5;
    try {
      if (this.omaha) {
        equity = estimateEquity(p.cards, this.board, Math.max(1, opponents), false, this.botIterations || OMAHA_EQUITY_ITERATIONS, true);
      } else {
        equity = estimateEquity(p.cards, this.board, Math.max(1, opponents), this.shortDeck, this.botIterations || 180);
      }
    } catch { equity = 0.45; }
    const rnd = Math.random();
    const potOdds = call > 0 ? call / (pot + call) : 0;
    const aggression = 0.55 + ((p.nick.length * 7) % 30) / 100; // stable personality
    let action = 'check';
    let amount = 0;

    if (this.aof) {
      // all-in or fold; the big blind takes a free showdown when nobody shoved
      const play = equity > 0.5 + (rnd - 0.5) * 0.2;
      const res = this.act(p.id, play ? 'allin' : call > 0 ? 'fold' : 'check');
      if (!res.ok) this.act(p.id, 'fold');
      return;
    }

    if (call > 0) {
      if (equity > Math.min(0.82, potOdds + 0.28) && equity > 0.55) {
        const size = Math.round((this.currentBet + Math.max(this.minRaise, pot * 0.55)) / this.bb) * this.bb;
        action = 'raise';
        amount = Math.min(p.bet + p.stack, Math.max(this.currentBet + this.minRaise, size));
        if (amount >= p.bet + p.stack) action = 'allin';
      } else if (equity > potOdds + 0.05 || rnd < 0.08) {
        action = 'call';
      } else {
        action = 'fold';
      }
    } else {
      if (equity > 0.62 + (1 - aggression) * 0.12 || rnd < 0.10) {
        action = 'raise';
        const size = Math.round((pot * (0.45 + rnd * 0.5)) / this.bb) * this.bb + this.bb;
        amount = Math.max(this.bb, Math.min(p.bet + p.stack, size));
        if (amount >= p.bet + p.stack) action = 'allin';
      } else {
        action = 'check';
      }
    }
    if (action === 'raise' && amount <= this.currentBet) action = 'call';
    const res = this.act(p.id, action, amount);
    if (!res.ok) {
      // fallback to a legal action
      if (call > 0) this.act(p.id, 'fold');
      else this.act(p.id, 'check');
    }
  }

  /* ------------------------------ serialization ------------------------------ */

  snapshotFor(viewerId = null) {
    const now = Date.now();
    return {
      id: this.cfg.id,
      tableEpoch: this.tableEpoch,
      handId: this.handId || null,
      tableVersion: this.tableVersion,
      name: this.cfg.name,
      game: this.game,
      sb: this.sb,
      bb: this.bb,
      ante: this.ante,
      seats: this.cfg.seats,
      minBuyin: this.cfg.min_buyin,
      maxBuyin: this.cfg.max_buyin,
      ownerId: this.cfg.owner_id || null,
      private: !!this.cfg.private,
      bombPot: !!this.bomb,
      button: this.button,
      sbSeat: this.sbSeat,
      bbSeat: this.bbSeat,
      handNo: this.handNo,
      street: this.street,
      board: this.board.map(cardStr),
      pot: this.pot + this.totalBets(),
      collectedPot: this.pot,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      potLimit: this.potLimit,
      allInOrFold: this.aof,
      maxRaiseTo: this.maxRaiseToFor(viewerId),
      rake: this.rake,
      actionTimeMs: this.actionTimeMs,
      actor: this.actor,
      actionEndsAt: this.actionEndsAt,
      timeBankUsed: [...this.timeBankUsed],
      now,
      botActAt: this.botActAt,
      result: this.result,
      players: this.seats.map((s) => {
        if (!s.player) {
          const r = this.reservations.get(s.index);
          if (!r || r.until <= now) return { seat: s.index, empty: true };
          return { seat: s.index, empty: true, reserved: true, mine: viewerId != null && r.playerId === viewerId };
        }
        const p = s.player;
        const mine = viewerId != null && p.id === viewerId;
        return {
          seat: s.index,
          id: p.id,
          nick: p.nick,
          avatar: p.avatar,
          stack: p.stack,
          bet: p.bet,
          totalBet: p.totalBet,
          folded: p.folded,
          allIn: p.allIn,
          inHand: p.inHand,
          sittingOut: p.sittingOut,
          isBot: p.isBot,
          isMe: mine,
          reveal: p.reveal || mine,
          shown: p.reveal ? p.cards.map((_, i) => i) : (p.shown || []),
          cards: (p.reveal || mine)
            ? p.cards.map(cardStr)
            : (p.inHand && !p.folded
              ? p.cards.map((c, i) => ((p.shown || []).includes(i) ? cardStr(c) : '??'))
              : []),
          lastAction: p.lastAction,
          winAmount: p.winAmount,
          disconnected: p.disconnected,
          sitOutNext: !!p.sitOutNextHand,
          timeBank: p.timeBank,
          timeBankCards: p.timeBankCards ?? 0,
          ...(mine ? { autoStraddle: !!p.autoStraddle, sitOutEndsAt: p.kickOutAt || 0, waitForBlinds: !!p.waitForBlinds, waitingForBigBlind: this.waitsForBigBlind(p) } : {}),
        };
      }),
      log: this.log.slice(-40),
      lastAction: this.lastAction,
      canStart: this.street === 'idle',
      spin: this.spin ? {
        multiplier: this.spinMultiplier, prize: this.spinPrize, buyIn: Number(this.cfg.min_buyin),
        payouts: this.spinPayouts, finished: this.finished, winner: this.spinWinner,
        blindLevel: this.spinLevel || null,
        smallBlind: this.spinLevel ? this.sb : null,
        bigBlind: this.spinLevel ? this.bb : null,
      } : null,
      straddle: this.straddle,
      straddleAsk: this.straddleAskFor(viewerId),
      runItTwice: this.runItTwice,
      boards: this.boards?.length ? this.boards.map((b) => b.map(cardStr)) : null,
      tournament: this.tournament ? {
        id: this.cfg.tournamentId || null,
        name: this.cfg.name,
        prizePool: this.tournament.prizePool,
        level: this.tournament.level || 1,
        mode: this.tournament.mode || 'STANDARD',
        bounty: this.tournament.bounty || 0,
        ticket: this.tournament.ticket || '',
        winner: this.tournament.winner || null,
        nextBlindAt: this.levelStartedAt ? this.levelStartedAt + Number(this.tournament.blindEvery || 10) * 60000 : null,
        managed: !!this.tournament.managed,
        tableIndex: Number(this.cfg.flightIndex) || 1,
        tables: Number(this.cfg.flightCount) || 1,
        playersLeft: this.tournament.playersLeft ?? null,
        payouts: this.tournamentPayouts(),
      } : null,
    };
  }

  maxRaiseToFor(viewerId) {
    const seat = viewerId != null ? this.seatOf(viewerId) : null;
    if (!seat) return 0;
    const p = seat.player;
    return this.potLimit ? this.potLimitMax(p) : p.bet + p.stack;
  }

  emit(evt) {
    evt.tableId = this.cfg.id;
    this.tableVersion += 1;
    evt.seq = ++this.messageSeq;
    evt.tableEpoch = this.tableEpoch;
    evt.tableVersion = this.tableVersion;
    evt.at = Date.now();
    if (evt.type === 'win') this.lastResult = evt;
    for (const fn of this.listeners) {
      try { fn(evt); } catch { /* noop */ }
    }
    if (this.hooks.onEvent) {
      try { this.hooks.onEvent(this, evt); } catch { /* noop */ }
    }
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}
