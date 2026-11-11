import {
  makeDeck, shuffle, cardStr, bestHoldem, bestOmaha, compareScores, estimateEquity,
} from './poker.js';

const BOT_NAMES = [
  'SpewySally', 'NitWizard', 'CallStation', 'RiverRat', 'TiltLord', 'GTOBOT', 'BluffKing',
  'PaperHands', 'ChipMuncher', 'DoubleBarrel', 'SnowLeopard', 'PocketRockets', 'FishInWater',
  'LAGMaster', 'TightTony', 'CheckRaiseU', 'AllInAnna', 'SlowplaySam', 'AggroPanda', 'TheDealer',
  'SpinKing', 'OmahaOwl', 'SharkBait', 'LuckyLuke', 'MrsRiver', 'PumpFake', 'ColdDeckCarl',
];

const MAX_MISSED_TURNS = 2;
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
    this.showdownDelay = 5000;
    this.botSpeed = Number(cfg.botSpeed || 900);
    this.botIterations = Number(cfg.botIterations || 0);
    this.aof = cfg.game === 'aof';
    this.spin = cfg.game === 'spingold';
    this.spinMultiplier = null;
    this.spinPrize = 0;
    this.spinWinner = null;
    this.tournament = cfg.tournament || null;
    this.elimination = this.spin || !!this.tournament;
    this.rakePercent = cfg.rakePercent ?? 5;
    this.rakeCap = cfg.rakeCap ?? 300;
    this.rake = 0;
    this.finished = [];
    if (this.spin) {
      const options = [2, 2, 2, 3, 3, 5, 10, 25, 100];
      this.spinMultiplier = options[Math.floor(Math.random() * options.length)];
      this.spinPrize = Math.round(cfg.min_buyin * this.spinMultiplier);
    }
    this.omaha = cfg.game === 'omaha' || cfg.game === 'omaha5';
    this.potLimit = this.omaha;
    this.holeCount = cfg.game === 'omaha5' ? 5 : this.omaha ? 4 : 2;
    // Chips committed by players who left mid-hand; they stay in the pot as dead money.
    this.ghosts = [];
    this.messageSeq = 0;
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

  sit(player, seatIndex = null, buyin = null) {
    if (this.seatOf(player.id)) return { ok: false, error: 'already seated' };
    let seat = seatIndex != null ? this.seats[seatIndex] : this.seats.find((s) => !s.player);
    if (!seat) return { ok: false, error: 'table full' };
    if (seat.player) return { ok: false, error: 'seat taken' };
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
      if (!s.player) {
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
    this.spinWinner = { nick: w.player.nick, id: w.player.id, prize: this.spinPrize };
    this.emit({ type: 'spin_win', ...this.spinWinner, multiplier: this.spinMultiplier });
    this.street = 'ended';
    this.nextHandAt = 0;
    if (this.hooks.onHandComplete) this.hooks.onHandComplete({ table: this, winner: { id: w.player.id } });
  }

  awardTournamentWinner() {
    const w = this.occupiedSeats().find((s) => s.player && s.player.stack > 0);
    if (!w || !w.player) return;
    const prize = Math.round((this.tournament.prizePool || 0) * 0.5);
    w.player.stack += prize;
    this.tournament.winner = { nick: w.player.nick, id: w.player.id, prize };
    this.emit({ type: 'tourney_win', nick: w.player.nick, id: w.player.id, prize, tableName: this.cfg.name });
    this.street = 'ended';
    this.nextHandAt = 0;
    if (this.hooks.onTournamentEnd) this.hooks.onTournamentEnd(this, this.tournament.winner);
  }

  startHand() {
    this.timeBankUsed = new Set();
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
    if (this.tournament && this.handNo > 0 && this.handNo % (this.tournament.blindEvery || 10) === 0) {
      this.sb = Math.round(this.sb * 1.5);
      this.bb = Math.round(this.bb * 1.5);
      this.minRaise = this.bb;
      this.tournament.level = (this.tournament.level || 1) + 1;
      this.emit({ type: 'blinds_up', sb: this.sb, bb: this.bb, level: this.tournament.level });
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
      p.raiseLocked = false;
      p.folded = !p.inHand;
      p.allIn = false;
      p.bet = 0;
      p.totalBet = 0;
      p.acted = false;
      p.reveal = false;
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
    this.currentBet = this.bb;
    this.minRaise = this.bb;

    // deal
    for (let round = 0; round < this.holeCount; round++) {
      for (const s of postOrder) s.player.cards.push(this.deck.pop());
    }

    this.emit({ type: 'hand_start', handNo: this.handNo, button: this.button, sbSeat: sbSeat.index, bbSeat: bbSeat.index });

    // Pre-flop action starts left of the big blind (the button/small blind when heads-up).
    this.progress(bbSeat.index);
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

  useTimeBank(playerId) {
    const seat = this.seatOf(playerId);
    if (!seat || !seat.player) return { ok: false, error: 'not seated' };
    if (this.actor !== playerId) return { ok: false, error: 'not your turn' };
    if (this.timeBankUsed.has(playerId)) return { ok: false, error: 'time bank already used' };
    this.timeBankUsed.add(playerId);
    this.actionEndsAt += 10000;
    this.emit({ type: 'timebank', playerId, endsAt: this.actionEndsAt });
    return { ok: true, endsAt: this.actionEndsAt };
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
      this.log.push({ nick: p.nick, action: 'fold', street: this.street });
      this.emit({ type: 'action', seat: seat.index, playerId, action: 'fold' });
    } else if (action === 'check') {
      if (call > 0) return { ok: false, error: 'cannot check' };
      p.lastAction = { action: 'Check', amount: 0 };
      p.acted = true;
      this.log.push({ nick: p.nick, action: 'check', street: this.street });
      this.emit({ type: 'action', seat: seat.index, playerId, action: 'check' });
    } else if (action === 'call') {
      if (call <= 0) return this.act(playerId, 'check', 0, opts);
      const paid = this.commit(p, Math.min(call, p.stack));
      if (p.stack === 0) p.allIn = true;
      p.lastAction = { action: 'Call', amount: paid };
      p.acted = true;
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
      if (p.raiseLocked) {
        // Action was not reopened by a short all-in: this player may only call or fold.
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
        if (isFullRaise) { other.acted = false; other.raiseLocked = false; }
        else if (other.acted) other.raiseLocked = true;
      }
      p.acted = true;
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
      if (s.player) { s.player.acted = false; s.player.raiseLocked = false; s.player.lastAction = null; }
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
    for (const s of alive) s.player.reveal = true;
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
      cards: s.player.cards.map(cardStr), folded: s.player.folded,
      win: s.player.winAmount, totalBet: s.player.totalBet,
      seat: s.index, isBot: s.player.isBot, showed: !!s.player.reveal,
    }));
    const hero = this.humans()[0];
    if (this.hooks.onHandSave) {
      this.hooks.onHandSave({
        handNo: this.handNo, tableId: this.cfg.id, tableName: this.cfg.name, game: this.cfg.game,
        players, board: this.board.map(cardStr), pot: summary.pot, result: summary,
        heroCards: hero ? hero.cards.map(cardStr).join(' ') : '',
        actions: this.log || [],
      });
    }
  }

  /* ------------------------------ tick / bots ------------------------------ */

  tick(now = Date.now()) {
    if (this.street === 'ended' || this.street === 'idle') {
      if (this.nextHandAt && now >= this.nextHandAt) {
        this.nextHandAt = 0;
        // remove busted bots, rebuy bots so the table stays alive
        for (const s of this.seats) {
          if (s.player && s.player.isBot && s.player.stack <= 0 && !this.elimination) s.player.stack = this.cfg.max_buyin;
        }
        if (this.elimination) {
          const aliveCount = this.occupiedSeats().filter((x) => x.player && x.player.stack > 0).length;
          let batch = 0;
          for (const s of [...this.seats]) {
            if (s.player && s.player.stack <= 0) {
              const busted = s.player;
              if (this.tournament) {
                const alive = aliveCount;
                const place = alive + 1 + batch;
                batch++;
                const pool = this.tournament.prizePool || 0;
                const pct = place === 2 ? 0.3 : place === 3 ? 0.2 : 0;
                const payout = Math.round(pool * pct);
                this.finished.push({ nick: busted.nick, id: busted.id, place, payout });
                if (payout > 0 && this.hooks.onTournamentPayout) this.hooks.onTournamentPayout(this, { id: busted.id, nick: busted.nick, place, payout });
              }
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
      name: this.cfg.name,
      game: this.game,
      sb: this.sb,
      bb: this.bb,
      ante: this.ante,
      seats: this.cfg.seats,
      minBuyin: this.cfg.min_buyin,
      maxBuyin: this.cfg.max_buyin,
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
          cards: (p.reveal || mine) ? p.cards.map(cardStr) : (p.inHand && !p.folded ? p.cards.map(() => '??') : []),
          lastAction: p.lastAction,
          winAmount: p.winAmount,
          disconnected: p.disconnected,
          timeBank: p.timeBank,
        };
      }),
      log: this.log.slice(-40),
      lastAction: this.lastAction,
      canStart: this.street === 'idle',
      spin: this.spin ? { multiplier: this.spinMultiplier, prize: this.spinPrize, winner: this.spinWinner } : null,
      tournament: this.tournament ? { name: this.cfg.name, prizePool: this.tournament.prizePool, level: this.tournament.level || 1, winner: this.tournament.winner || null } : null,
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
    evt.seq = ++this.messageSeq;
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
