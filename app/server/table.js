import {
  makeDeck, shuffle, cardStr, bestHoldem, bestOmaha, compareScores, estimateEquity,
} from './poker.js';
import { payoutFor, payoutTable } from './tournament.js';
import { isRushGame } from './validate.js';

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
    this.actionTimeMs = 15000;
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
    this.spin = cfg.game === 'spingold';
    this.spinMultiplier = null;
    this.spinPrize = 0;
    this.spinWinner = null;
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
    if (this.spin) {
      const options = [2, 2, 2, 3, 3, 5, 10, 25, 100];
      this.spinMultiplier = options[Math.floor(Math.random() * options.length)];
      this.spinPrize = Math.round(cfg.min_buyin * this.spinMultiplier);
    }
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

  /** True when the seat is held for a wait-listed player other than `playerId`. */
  isHeldFor(seatIndex, playerId) {
    const holder = this.holds.get(seatIndex);
    return holder != null && holder !== playerId;
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
      // Keep the departed player's chips in the pot instead of losing them with the seat.
      this.ghosts.push({ id: p.id, nick: p.nick, bet: p.bet, totalBet: p.totalBet });
    }
    seat.player = null;
    this.emit({ type: 'stand', seat: seat.index });
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
      if (!s.player && !this.holds.has(i)) {
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
    return player.stack > 0 && (this.elimination || !player.sittingOut);
  }

  readySeats() {
    return this.occupiedSeats().filter((s) => this.isDealtIn(s.player));
  }

  awardSpinWinner() {
    const w = this.occupiedSeats().find((s) => s.player && s.player.stack > 0);
    if (!w || !w.player) return;
    w.player.stack += this.spinPrize;
    if (this.hooks.onMint) this.hooks.onMint(this, 'spin', this.spinPrize);
    this.spinWinner = { nick: w.player.nick, id: w.player.id, prize: this.spinPrize };
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
    if (this.spin && this.handNo > 0 && this.handNo % 8 === 0) {
      this.sb = Math.round(this.sb * 1.5);
      this.bb = Math.round(this.bb * 1.5);
      this.minRaise = this.bb;
      this.emit({ type: 'blinds_up', sb: this.sb, bb: this.bb });
    }

    this.handNo++;
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

    const inHand = this.seats.filter((s) => s.player && s.player.inHand);
    // move button
    let idx = this.button;
    for (let i = 0; i < this.seats.length; i++) {
      idx = (idx + 1) % this.seats.length;
      const s = this.seats[idx];
      if (s.player && s.player.inHand) { this.button = idx; break; }
    }
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

    // antes
    if (this.ante > 0) {
      for (const s of inHand) {
        const amt = Math.min(this.ante, s.player.stack);
        this.commit(s.player, amt);
        if (s.player.stack === 0) s.player.allIn = true;
      }
    }
    this.postBlind(sbSeat, this.sb, 'SB');
    this.postBlind(bbSeat, this.bb, 'BB');
    let straddleSeat = null;
    if (this.straddle) {
      const candidate = this.seats[(bbSeat.index + 1) % this.seats.length];
      if (candidate?.player && candidate.player.inHand && candidate.player.stack > 0) {
        straddleSeat = candidate;
        this.postBlind(straddleSeat, this.bb * 2, 'Straddle');
      }
    }
    this.currentBet = straddleSeat ? this.bb * 2 : this.bb;
    this.minRaise = straddleSeat ? this.bb * 2 : this.bb;

    // deal
    for (let round = 0; round < this.holeCount; round++) {
      for (const s of postOrder) {
        if (s.player && s.player.inHand) s.player.cards.push(this.deck.pop());
      }
    }

    this.emit({ type: 'hand_start', handNo: this.handNo, button: this.button, sbSeat: sbSeat.index, bbSeat: bbSeat.index });

    if (this.flip && this.handNo === 1) {
      for (const s of inHand) s.player.allIn = true;
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
    if (!p.inHand || p.folded) return { ok: false, error: 'Only a player still in the hand can show cards' };
    if (!Array.isArray(indices) || !indices.length) return { ok: false, error: 'Pick a card first' };
    const picked = [...new Set(indices.map(Number))]
      .filter((i) => Number.isInteger(i) && i >= 0 && i < p.cards.length);
    if (!picked.length) return { ok: false, error: 'Pick a card first' };
    p.shown = [...new Set([...(p.shown || []), ...picked])].sort((a, b) => a - b);
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
      p.sittingOut = false;
      p.sitOutNextHand = false;
      this.maybeStart();
      return { ok: true };
    }
    if (this.handInProgress() && p.inHand && !p.folded) p.sitOutNextHand = true;
    else p.sittingOut = true;
    return { ok: true };
  }

  setAutoMuck(userId, value) {
    const seat = this.seatOf(userId);
    if (seat?.player) seat.player.autoMuck = !!value;
    return { ok: true };
  }

  setInsurance(userId, value) {
    if (!this.spin) return { ok: false, error: 'insurance is Spin & Gold only' };
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
    this.emit({ type: 'turn', playerId, endsAt: this.actionEndsAt });
  }

  useTimeBank(playerId, seconds = 10) {
    const seat = this.seatOf(playerId);
    if (!seat || !seat.player) return { ok: false, error: 'not seated' };
    if (this.actor !== playerId) return { ok: false, error: 'not your turn' };
    if (this.timeBankUsed.has(playerId)) return { ok: false, error: 'time bank already used' };
    const add = Math.max(5, Math.min(60, Math.round(Number(seconds) || 10)));
    this.timeBankUsed.add(playerId);
    this.actionEndsAt += add * 1000;
    this.emit({ type: 'timebank', playerId, seconds: add, endsAt: this.actionEndsAt });
    return { ok: true, seconds: add, endsAt: this.actionEndsAt };
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

    const contributions = this.seats
      .filter((s) => s.player && s.player.totalBet > 0)
      .map((s) => ({ player: s.player, amount: s.player.totalBet, folded: s.player.folded }));
    const levels = [...new Set(contributions.map((c) => c.amount))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const level of levels) {
      let amount = 0;
      for (const c of contributions) amount += Math.max(0, Math.min(c.amount, level) - prev);
      const ids = contributions
        .filter((c) => !c.folded && c.amount >= level)
        .map((c) => c.player.id);
      if (amount > 0 && ids.length) pots.push({ amount, ids });
      prev = level;
    }
    const totalContrib = contributions.reduce((a, c) => a + c.amount, 0);
    const potsTotal = pots.reduce((a, p) => a + p.amount, 0);
    if (totalContrib > potsTotal) pots.push({ amount: totalContrib - potsTotal, ids: alive.map((s) => s.player.id) });
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
      const winners = candidates.filter((sc) => compareScores(sc.score, best.score) === 0);
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
    this.result = summary;
    this.street = 'ended';
    this.nextHandAt = Date.now() + this.showdownDelay;
    this.emit({ type: 'win', ...summary });
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
    // side pots from totalBet contributions
    const contributions = [
      ...this.seats.filter((s) => s.player && s.player.totalBet > 0)
        .map((s) => ({ id: s.player.id, amount: s.player.totalBet })),
      ...this.ghosts.filter((g) => g.totalBet > 0).map((g) => ({ id: g.id, amount: g.totalBet })),
    ];
    const levels = [...new Set(contributions.map((c) => c.amount))].sort((a, b) => a - b);
    let prev = 0;
    const pots = [];
    for (const level of levels) {
      let amount = 0;
      for (const c of contributions) {
        amount += Math.max(0, Math.min(c.amount, level) - prev);
      }
      const eligible = scored.filter((sc) => contributions.find((c) => c.id === sc.player.id && c.amount >= level));
      if (amount > 0) pots.push({ amount, eligible });
      prev = level;
    }
    // handle any dead money
    const totalContrib = contributions.reduce((a, c) => a + c.amount, 0);
    const potsTotal = pots.reduce((a, p) => a + p.amount, 0);
    if (totalContrib > potsTotal) {
      pots.push({ amount: totalContrib - potsTotal, eligible: scored });
    }
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
    for (const pot of pots) {
      if (!pot.eligible.length) continue;
      let best = null;
      for (const sc of pot.eligible) {
        if (!best || compareScores(sc.score, best.score) > 0) best = sc;
      }
      const winners = pot.eligible.filter((sc) => compareScores(sc.score, best.score) === 0);
      const share = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount - share * winners.length;
      for (const w of winners) {
        let amt = share;
        if (remainder > 0) { amt++; remainder--; }
        w.player.stack += amt;
        w.player.winAmount += amt;
        results.push({
          id: w.player.id, nick: w.player.nick, seat: w.seat, amount: amt,
          hand: w.name, cards: w.cards.map(cardStr), pot: pot.amount,
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
    this.result = summary;
    this.street = 'ended';
    this.actor = null;
    this.nextHandAt = Date.now() + this.showdownDelay;
    this.emit({ type: 'win', ...summary });
    this.saveHand(summary);
    this.updateMissionProgress(results[0]);
  }

  updateMissionProgress(winner) {
    if (this.hooks.onHandComplete) {
      this.hooks.onHandComplete({ table: this, winner, summary: this.result });
    }
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
        if (!s.player) return { seat: s.index, empty: true };
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
        };
      }),
      log: this.log.slice(-40),
      lastAction: this.lastAction,
      canStart: this.street === 'idle',
      spin: this.spin ? { multiplier: this.spinMultiplier, prize: this.spinPrize, winner: this.spinWinner } : null,
      straddle: this.straddle,
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
