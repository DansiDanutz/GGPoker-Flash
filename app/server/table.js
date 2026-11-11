import {
  makeDeck, shuffle, cardStr, bestHoldem, bestOmaha, compareScores, estimateEquity, handName,
} from './poker.js';

const BOT_NAMES = [
  'SpewySally', 'NitWizard', 'CallStation', 'RiverRat', 'TiltLord', 'GTOBOT', 'BluffKing',
  'PaperHands', 'ChipMuncher', 'DoubleBarrel', 'SnowLeopard', 'PocketRockets', 'FishInWater',
  'LAGMaster', 'TightTony', 'CheckRaiseU', 'AllInAnna', 'SlowplaySam', 'AggroPanda', 'TheDealer',
  'SpinKing', 'OmahaOwl', 'SharkBait', 'LuckyLuke', 'MrsRiver', 'PumpFake', 'ColdDeckCarl',
];

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
    this.aof = cfg.game === 'aof';
    this.rush = cfg.game === 'rush';
    this.straddle = !!cfg.straddle;
    this.spin = cfg.game === 'spingold';
    this.spinMultiplier = null;
    this.spinPrize = 0;
    this.spinWinner = null;
    this.tournament = cfg.tournament || null;
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
    this.omaha = cfg.game === 'omaha' || cfg.game === 'omaha5' || cfg.game === 'omaha6';
    this.messageSeq = 0;
    this.tableEpoch = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.tableVersion = 0;
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

  sit(player, seatIndex = null, buyin = null, sessionId = null) {
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
      autoMuck: false,
      insurance: false,
      sessionId,
    };
    this.emit({ type: 'sit', seat: seat.index, nick: player.nick });
    this.maybeStart();
    return { ok: true, seat: seat.index };
  }

  stand(playerId) {
    const seat = this.seatOf(playerId);
    if (!seat) return { ok: false };
    const p = seat.player;
    if (p.inHand && !p.folded) {
      // folding on stand to keep the hand valid
      p.folded = true;
      if (this.actor === p.id) this.afterAction(p);
    }
    seat.player = null;
    this.emit({ type: 'stand', seat: seat.index });
    if (this.activePlayers().length < 2 && this.street !== 'idle') this.finishByFold();
    return { ok: true, stack: p.stack };
  }

  fillBots(count) {
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
    return added;
  }

  humans() {
    return this.occupiedSeats().filter((s) => s.player && !s.player.isBot).map((s) => s.player);
  }

  /* ------------------------------ hand flow ------------------------------ */

  maybeStart() {
    if (this.street !== 'idle' && this.street !== 'ended') return;
    if (this.nextHandAt && Date.now() < this.nextHandAt) return;
    const ready = this.occupiedSeats().filter((s) => s.player && s.player.stack > 0 && !s.player.sittingOut);
    if (ready.length >= 2) this.startHand();
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

  awardTournamentWinner() {
    const w = this.occupiedSeats().find((s) => s.player && s.player.stack > 0);
    if (!w || !w.player) return;
    if (this.satellite) {
      this.tournament.winner = { nick: w.player.nick, id: w.player.id, prize: 0, ticket: this.tournament.ticket };
      this.emit({ type: 'tourney_win', nick: w.player.nick, id: w.player.id, prize: 0, ticket: this.tournament.ticket, tableName: this.cfg.name });
      this.street = 'ended';
      this.nextHandAt = 0;
      if (this.hooks.onTournamentEnd) this.hooks.onTournamentEnd(this, this.tournament.winner);
      return;
    }
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
    const ready = this.occupiedSeats().filter((s) => s.player && s.player.stack > 0 && !s.player.sittingOut);
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
    this.boards = [];
    this.street = 'preflop';
    this.streetStartedAt = Date.now();
    this.history = [];
    this.log = [];
    this.handId = `${this.cfg.id}-${Date.now()}-${this.handNo}`;
    this.handStartStack = {};

    for (const s of this.seats) {
      const p = s.player;
      if (!p) continue;
      p.inHand = p.stack > 0 && !p.sittingOut;
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
    const dealOrder = postOrder;
    for (let round = 0; round < 2; round++) {
      for (const s of dealOrder) {
        if (s.player && s.player.inHand) {
          s.player.cards.push(this.deck.pop());
        }
      }
    }
    if (this.omaha) {
      for (const s of dealOrder) {
        if (s.player && s.player.inHand) {
          for (let i = 0; i < this.omahaHole - 2; i++) s.player.cards.push(this.deck.pop());
        }
      }
    }

    this.emit({ type: 'hand_start', handNo: this.handNo, button: this.button, sbSeat: sbSeat.index, bbSeat: bbSeat.index });

    if (this.flip && this.handNo === 1) {
      for (const s of inHand) s.player.allIn = true;
      this.setActor(null);
      this.runout();
      return;
    }

    if (this.aof) {
      // Each player chooses all-in or fold; no postflop betting rounds.
      const first = this.nextActionSeat(this.button);
      this.setActor(first ? first.player.id : null);
      return;
    }

    const firstToAct = this.nextActionSeat(straddleSeat ? straddleSeat.index : this.button);
    this.setActor(firstToAct ? firstToAct.player.id : null);
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

  act(playerId, action, amount = 0) {
    const seat = this.seatOf(playerId);
    if (!seat || !seat.player) return { ok: false, error: 'not seated' };
    const p = seat.player;
    if (this.actor !== playerId) return { ok: false, error: 'not your turn' };
    if (p.folded || p.allIn) return { ok: false, error: 'cannot act' };

    if (this.aof) {
      if (action === 'fold') {
        p.folded = true;
        p.acted = true;
        p.lastAction = { action: 'Fold', amount: 0 };
        this.emit({ type: 'action', seat: seat.index, playerId, action: 'fold' });
      } else if (action === 'allin') {
        const paid = this.commit(p, p.stack);
        p.allIn = true;
        p.acted = true;
        p.lastAction = { action: 'All-in', amount: p.bet };
        this.lastAggressor = p.id;
        this.emit({ type: 'action', seat: seat.index, playerId, action: 'allin', amount: p.bet, paid, allIn: true });
      } else {
        return { ok: false, error: 'all-in or fold only' };
      }
      const pending = this.seats.filter((x) => x.player && x.player.inHand && !x.player.folded && !x.player.allIn && !x.player.acted);
      const live = this.seats.filter((x) => x.player && x.player.inHand && !x.player.folded);
      if (live.length <= 1) {
        this.setActor(null);
        this.finishByFold();
      } else if (!pending.length) {
        this.setActor(null);
        this.runout();
      } else {
        this.setActor(pending[0].player.id);
      }
      return { ok: true };
    }

    const call = this.toCall(p);
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
      this.log.push({ nick: p.nick, action: 'check', street: this.street });
      this.emit({ type: 'action', seat: seat.index, playerId, action: 'check' });
    } else if (action === 'call') {
      if (call <= 0) return this.act(playerId, 'check');
      const paid = this.commit(p, Math.min(call, p.stack));
      if (p.stack === 0) p.allIn = true;
      p.lastAction = { action: 'Call', amount: paid };
      p.acted = true;
      this.log.push({ nick: p.nick, action: 'call', amount: paid, street: this.street });
      this.emit({ type: 'action', seat: seat.index, playerId, action: 'call', amount: paid, allIn: p.allIn });
    } else if (['bet', 'raise', 'allin'].includes(action)) {
      let target = Math.round(Number(amount) || 0);
      const maxTarget = p.bet + p.stack;
      if (action === 'allin') target = maxTarget;
      if (target <= this.currentBet && action !== 'allin') {
        if (target >= maxTarget) target = maxTarget;
        else return { ok: false, error: 'raise too small' };
      }
      if (target > maxTarget) target = maxTarget;
      const isAllIn = target === maxTarget;
      const raiseSize = target - this.currentBet;
      if (!isAllIn && raiseSize < this.minRaise) return { ok: false, error: 'raise too small' };
      const paid = this.commit(p, target - p.bet);
      const previousBet = this.currentBet;
      this.currentBet = p.bet;
      if (raiseSize >= this.minRaise) this.minRaise = raiseSize;
      if (p.stack === 0) p.allIn = true;
      for (const s of this.seats) {
        if (s.player && s.player.inHand && !s.player.folded && s.player.id !== p.id && !s.player.allIn) {
          s.player.acted = false;
        }
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
    return this.seats.reduce((a, s) => a + (s.player ? s.player.bet : 0), 0);
  }

  afterAction(p) {
    // only one player left in the hand
    const alive = this.activePlayers().filter((s) => !s.player.folded);
    if (alive.length <= 1) {
      this.finishByFold(alive[0]);
      return;
    }
    // round complete?
    const contenders = this.activePlayers().filter((s) => !s.player.folded && !s.player.allIn);
    const allMatched = contenders.every((s) => s.player.bet === this.currentBet);
    const allActed = contenders.every((s) => s.player.acted);
    if (contenders.length === 0) {
      this.endStreetAllIn();
      return;
    }
    if (allMatched && allActed) {
      this.endStreet();
      return;
    }
    // next actor
    const seat = this.seatOf(p.id);
    let next = this.nextActionSeat(seat ? seat.index : this.button);
    // skip players who already matched and acted
    let guard = 0;
    while (next && next.player.bet === this.currentBet && next.player.acted && guard++ < 20) {
      const more = this.nextActionSeat(next.index);
      if (more === next) { next = null; break; }
      next = more;
    }
    if (!next) { this.endStreet(); return; }
    this.setActor(next.player.id);
  }

  endStreetAllIn() {
    // no more betting possible -> run out the rest of the board
    this.collectBets();
    this.runout();
  }

  runout() {
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
    this.collectBets();
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
    for (const s of this.seats) {
      if (!s.player) continue;
      this.pot += s.player.bet;
      s.player.bet = 0;
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
    this.emit({ type: 'street', street: this.street, board: this.board.map(cardStr), pot: this.pot });
    const first = this.nextActionSeat(this.button);
    if (!first) { this.runout(); return; }
    this.setActor(first.player.id);
  }

  dealStreet(street) {
    const out = [];
    if (street === 'flop') out.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
    else out.push(this.deck.pop());
    return out;
  }

  computeRake(pot) {
    if (this.tournament || this.spin) return 0;
    const raw = Math.floor((pot * this.rakePercent) / 100);
    return Math.min(raw, this.rakeCap);
  }

  finishByFold(winnerSeat) {
    this.collectBets();
    const winner = winnerSeat ? winnerSeat.player : null;
    const rake = this.computeRake(this.pot);
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
      const best = this.omaha ? bestOmaha(p.cards, this.board) : bestHoldem(p.cards, this.board);
      return { seat: s.index, player: p, score: best.score, name: best.name, cards: best.cards };
    });
    // side pots from totalBet contributions
    const contributions = this.seats
      .filter((s) => s.player && s.player.totalBet > 0)
      .map((s) => ({ seat: s.index, player: s.player, amount: s.player.totalBet, folded: s.player.folded }));
    const levels = [...new Set(contributions.map((c) => c.amount))].sort((a, b) => a - b);
    let prev = 0;
    const pots = [];
    for (const level of levels) {
      let amount = 0;
      for (const c of contributions) {
        amount += Math.max(0, Math.min(c.amount, level) - prev);
      }
      const eligible = scored.filter((sc) => contributions.find((c) => c.player.id === sc.player.id && c.amount >= level));
      if (amount > 0) pots.push({ amount, eligible });
      prev = level;
    }
    // handle any dead money
    const totalContrib = contributions.reduce((a, c) => a + c.amount, 0);
    const potsTotal = pots.reduce((a, p) => a + p.amount, 0);
    if (totalContrib > potsTotal) {
      pots.push({ amount: totalContrib - potsTotal, eligible: scored });
    }
    const rake = this.computeRake(this.pot);
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
          if (s.player && s.player.isBot && s.player.stack <= 0 && !this.elimination) {
            s.player.stack = this.cfg.max_buyin;
            if (this.hooks.onMint) this.hooks.onMint(this, 'bot', this.cfg.max_buyin);
          }
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
              s.player = null;
              this.emit({ type: 'stand', seat: s.index });
            }
          }
        }
        const alive = this.occupiedSeats().filter((s) => s.player && s.player.stack > 0);
        if (alive.length >= 2) this.startHand();
        else if (this.tournament && alive.length === 1 && this.handNo > 0) this.awardTournamentWinner();
        else if (this.spin && alive.length === 1 && this.handNo > 0) this.awardSpinWinner();
      }
      return;
    }
    if (!this.actor) return;
    const seat = this.seatOf(this.actor);
    if (!seat || !seat.player) { this.setActor(null); return; }
    const p = seat.player;
    if (p.sittingOut) {
      this.act(p.id, this.toCall(p) > 0 ? 'fold' : 'check');
      return;
    }
    if (p.isBot) {
      if (now >= this.botActAt) this.botAct(p);
      return;
    }
    if (now >= this.actionEndsAt) {
      const call = this.toCall(p);
      if (call > 0) this.act(p.id, 'fold');
      else this.act(p.id, 'check');
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
        // approximate with the best two cards for speed
        const two = p.cards.slice(0, 2);
        equity = estimateEquity(two, this.board, Math.max(1, opponents), this.shortDeck, 140);
      } else {
        equity = estimateEquity(p.cards, this.board, Math.max(1, opponents), this.shortDeck, 180);
      }
    } catch { equity = 0.45; }
    const rnd = Math.random();
    const potOdds = call > 0 ? call / (pot + call) : 0;
    const aggression = 0.55 + ((p.nick.length * 7) % 30) / 100; // stable personality
    let action = 'check';
    let amount = 0;

    if (this.aof) {
      // all-in or fold
      const play = equity > 0.5 + (rnd - 0.5) * 0.2;
      this.act(p.id, play ? 'allin' : 'fold');
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
      tableVersion: this.tableVersion,
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
          cards: (p.reveal || mine) ? p.cards.map(cardStr) : (p.inHand && !p.folded ? ['??', '??'] : []),
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
      straddle: this.straddle,
      runItTwice: this.runItTwice,
      boards: this.boards?.length ? this.boards.map((b) => b.map(cardStr)) : null,
      tournament: this.tournament ? { name: this.cfg.name, prizePool: this.tournament.prizePool, level: this.tournament.level || 1, mode: this.tournament.mode || 'STANDARD', bounty: this.tournament.bounty || 0, ticket: this.tournament.ticket || '', winner: this.tournament.winner || null } : null,
    };
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
