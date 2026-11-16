import { PokerTable } from './table.js';
import { tournamentLevelBlinds } from './tournament-blinds.js';
import { buildQualificationPlan, buildShootoutGroups, evaluateShootoutRound } from './battle-qualification.js';
import { createBattleRoom, ensureBattleRuntimeStore, persistBattleRoom, restoreBattleRoom } from './battle-store.js';
import { withGameReceipt } from './game-receipts.js';
import { addTransactionEx } from './db.js';
import { awardBattleBounties, battleBountyState } from './battle-bounty.js';
import { battleEventState } from './battle-event.js';
import { terminalGameCheckpoint } from './game-checkpoints.js';

function event(db, eventId) {
  const row = db.prepare('SELECT * FROM battle_events WHERE event_id = ?').get(eventId);
  if (!row) throw Object.assign(new Error('Battle event not found'), { status: 404 });
  return row;
}

export function battleTimestamp(value) {
  if (!value) return null;
  return Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value);
}

function deadlineExpired(row, now = Date.now()) {
  const deadline = battleTimestamp(row.deadline);
  return deadline != null && deadline <= now;
}

function revision(db, eventId) {
  return event(db, eventId).revision;
}

function updateRevision(db, eventId) {
  const next = revision(db, eventId) + 1;
  db.prepare('UPDATE battle_events SET revision = ? WHERE event_id = ?').run(next, eventId);
  return next;
}

function largestRemainder(pool, shares) {
  const units = shares.map((share) => BigInt(pool) * BigInt(share));
  const amounts = units.map((unit) => Number(unit / 100n));
  const order = shares.map((_, index) => index).sort((a, b) => Number((units[b] % 100n) - (units[a] % 100n)) || a - b);
  const remainder = pool - amounts.reduce((sum, amount) => sum + amount, 0);
  for (const index of order.slice(0, remainder)) amounts[index]++;
  return amounts;
}

export function battlePrizeAwards(places, amounts) {
  const awards = new Map();
  for (let index = 0; index < places.length;) {
    const place = places[index].place;
    let end = index + 1;
    while (end < places.length && places[end].place === place) end++;
    const nextPlace = end < places.length ? places[end].place : amounts.length + 1;
    const tiedPool = amounts.slice(place - 1, nextPlace - 1).reduce((sum, amount) => sum + amount, 0);
    const tiedCount = end - index;
    const tiedAwards = places.slice(index, end).map((_, offset) => Math.floor(tiedPool / tiedCount) + Number(offset < tiedPool % tiedCount));
    for (const [offset, amount] of tiedAwards.entries()) awards.set(places[index + offset].account_id, amount);
    index = end;
  }
  return awards;
}

export class BattleCoordinator {
  constructor(db, eventId, { onChange = null, autoStart = true } = {}) {
    this.db = db;
    this.eventId = eventId;
    this.onChange = onChange;
    this.autoStart = autoStart;
    this.tables = new Map();
    ensureBattleRuntimeStore(db);
  }

  get event() { return event(this.db, this.eventId); }
  get config() { return JSON.parse(this.event.config_json); }

  state(actorId = null) {
    const stage = this.event.status === 'draining' ? 'rush' : this.event.status;
    const rooms = [...this.tables.values()].filter((table) => table.cfg.id.split(':')[1] === stage).map((table) => ({
      roomId: table.cfg.id, stage, round: Number(table.cfg.id.split(':')[2]), revision: table.cfg.battleRevision || 0,
      clock: table.battleClock || null, table: table.snapshotFor(actorId),
    }));
    const prizes = this.db.prepare('SELECT account_id,place,amount FROM battle_prizes WHERE event_id = ? ORDER BY place').all(this.eventId)
      .map((row) => ({ accountId: row.account_id, place: row.place, amount: row.amount }));
    return { ...battleEventState(this.db, this.eventId, actorId), rooms, prizes, bounty: battleBountyState(this.db, this.eventId) };
  }

  tableHooks() {
    return {
      onEvent: (table) => this.persist(table, 'event'),
      onHandComplete: ({ table }) => this.settleTable(table),
      onFlightSettled: (table) => { this.persist(table, 'stage-complete'); this.advance(); },
    };
  }

  start() {
    if (!this.tables.size && this.event.status === 'rush') {
      const contenders = this.registrations();
      if (contenders.length <= this.config.finalSeats) {
        for (const qualifier of contenders) this.db.prepare('INSERT OR IGNORE INTO battle_qualification (event_id,account_id,created_at) VALUES (?,?,datetime(\'now\'))').run(this.eventId, qualifier.id);
        this.db.prepare("UPDATE battle_registrations SET status = 'qualified' WHERE event_id = ? AND status = 'active'").run(this.eventId);
        this.db.prepare("UPDATE battle_events SET status = 'final' WHERE event_id = ?").run(this.eventId);
        updateRevision(this.db, this.eventId);
        this.createFinal(contenders);
      } else this.createTables('rush', contenders, 1);
    }
    return this;
  }

  registrations() {
    return this.db.prepare("SELECT account_id,entry_order,stack FROM battle_registrations WHERE event_id = ? AND status IN ('active','qualified') ORDER BY entry_order").all(this.eventId)
      .map((row) => ({ id: row.account_id, stack: row.stack, entryOrder: row.entry_order }));
  }

  createTables(stage, contenders, round) {
    if (stage === 'shootout') {
      for (const [roomId, table] of this.tables) if (table.cfg.id.split(':')[1] === 'shootout') this.tables.delete(roomId);
    }
    const groups = stage === 'shootout' ? buildShootoutGroups(contenders, this.config.tableSize) : (() => {
      const groups = [];
      for (let index = 0; index < contenders.length; index += this.config.tableSize) groups.push({ players: contenders.slice(index, index + this.config.tableSize), bye: [] });
      return groups;
    })();
    let tableIndex = 0;
    for (const group of groups) {
      if (!group.players.length) continue;
      this.createTable(stage, group.players, round, tableIndex++);
    }
    this.advance();
  }

  createTable(stage, contenders, round, tableIndex) {
    const level = stage === 'rush' ? this.config.rushStartLevel : stage === 'shootout' ? this.config.shootoutStartLevel : this.config.finalStartLevel;
    const blinds = tournamentLevelBlinds({ baseSb: this.config.smallBlind, baseBb: this.config.bigBlind }, level);
    const roomId = `${this.eventId}:${stage}:${round}:${tableIndex}`;
    const table = new PokerTable({
      id: roomId, name: `${this.config.name} · ${stage}`, game: 'holdem', category: 'Battle', aof: stage === 'shootout', sb: blinds.sb, bb: blinds.bb,
      ante: blinds.ante, min_buyin: 20, max_buyin: 1000000, seats: contenders.length, speed: 'Fast', rimt_mode: 'off',
      tableIndex,
      tournament: { mode: 'STANDARD', managed: true, entrants: contenders.length, prizePool: 0, payouts: [], level, blindEvery: 5, baseSb: this.config.smallBlind, baseBb: this.config.bigBlind, baseAnte: blinds.ante, levelStartedAt: Date.now() },
    }, this.tableHooks());
    table.cfg.battleRevision = 0;
    table.holdStart = true;
    for (const [seat, contender] of contenders.entries()) {
      const user = this.db.prepare('SELECT id,nick,avatar FROM users WHERE id = ?').get(contender.id);
      table.sit({ id: contender.id, nick: user?.nick || `Player ${contender.id}`, avatar: user?.avatar || '' }, seat, contender.stack, `battle:${this.eventId}:${contender.id}`);
    }
    table.holdStart = false;
    this.tables.set(roomId, table);
    createBattleRoom(this.db, { eventId: this.eventId, stage, tableIndex, round, roomId });
    this.persist(table, 'create');
    this.syncClock(table, Date.now());
    if (this.autoStart) table.maybeStart();
    this.persist(table, 'start');
  }

  persist(table, transition) {
    if (this.event.status === 'finished') {
      terminalGameCheckpoint(this.db, table.cfg.id, 'battle', 'finished');
      this.db.prepare("UPDATE battle_rooms SET status = 'complete' WHERE room_id = ?").run(table.cfg.id);
      return null;
    }
    persistBattleRoom(this.db, { table, eventId: this.eventId, stage: table.tournament?.battleStage || table.cfg.id.split(':')[1], round: Number(table.cfg.id.split(':')[2]), transition, revision: transition === 'clock' ? Math.max(1, table.cfg.battleRevision || 0) : (table.cfg.battleRevision || 0) + 1 });
    this.onChange?.(this, table);
  }

  syncClock(table, now) {
    const actor = table.actor;
    if (!actor) { table.battleClock = null; return; }
    if (table.battleClock?.actorId !== actor) {
      table.battleClock = { actorId: actor, actionStartedAt: now, actionEndsAt: now + 15000, bankStartedAt: null, bankRemainingMs: 30000, originalBankMs: 30000 };
      table.actionEndsAt = table.battleClock.actionEndsAt;
    }
    const clock = table.battleClock;
    if (now >= clock.actionEndsAt && clock.bankStartedAt === null && clock.bankRemainingMs > 0) {
      clock.bankStartedAt = clock.actionEndsAt;
      clock.actionEndsAt += clock.bankRemainingMs;
      table.actionEndsAt = clock.actionEndsAt;
    }
    if (clock.bankStartedAt !== null) clock.bankRemainingMs = Math.max(0, clock.originalBankMs - (now - clock.bankStartedAt));
    this.persist(table, 'clock');
  }

  settleTable(table) {
    awardBattleBounties(this.db, { eventId: this.eventId, table });
    for (const seat of table.seats) {
      if (!seat.player) continue;
      this.db.prepare('UPDATE battle_registrations SET stack = ? WHERE event_id = ? AND account_id = ?').run(Math.max(0, seat.player.stack), this.eventId, seat.player.id);
      if (seat.player.stack <= 0) this.db.prepare("UPDATE battle_registrations SET status = 'eliminated' WHERE event_id = ? AND account_id = ?").run(this.eventId, seat.player.id);
    }
    const stage = table.cfg.id.split(':')[1];
    if (stage === 'final') {
      const alive = table.occupiedSeats().filter((seat) => seat.player && seat.player.stack > 0).length;
      for (const seat of table.seats) if (seat.player && seat.player.stack <= 0) this.recordFinish(stage, { id: seat.player.id, place: alive + 1 });
    }
    table.nextHandAt = 0;
    table.tick();
    for (const finish of table.finished) this.recordFinish(table.cfg.id.split(':')[1], finish);
    this.persist(table, 'settle');
    this.advance();
  }

  recordFinish(stage, finish) {
    if (stage !== 'final') return;
    this.db.prepare('INSERT OR IGNORE INTO battle_finishes (event_id,account_id,place,created_at) VALUES (?,?,?,datetime(\'now\'))').run(this.eventId, finish.id, finish.place);
  }

  closeRush() {
    if (this.event.status !== 'rush') return;
    for (const table of this.tables.values()) table.holdStart = true;
    this.db.prepare("UPDATE battle_events SET status = 'draining' WHERE event_id = ?").run(this.eventId);
    updateRevision(this.db, this.eventId);
  }

  roomsSettled(tables) {
    return [...tables].every((table) => !table.handInProgress() && (table.handNo > 0 || table.readySeats().length < 2));
  }

  advance() {
    const status = this.event.status;
    if (status === 'rush' || status === 'draining') {
      if (!this.roomsSettled(this.tables.values())) return;
      const survivors = this.registrations().filter((player) => player.stack > 0);
      if (survivors.length <= this.config.finalSeats || deadlineExpired(this.event) || status === 'draining') {
        const plan = buildQualificationPlan(survivors, this.config);
        for (const qualifier of plan.direct) this.db.prepare('INSERT OR IGNORE INTO battle_qualification (event_id,account_id,created_at) VALUES (?,?,datetime(\'now\'))').run(this.eventId, qualifier.id);
        if (plan.phase === 'final-ready') {
          this.db.prepare("UPDATE battle_registrations SET status = 'qualified' WHERE event_id = ? AND stack > 0").run(this.eventId);
          this.db.prepare("UPDATE battle_events SET status = 'final' WHERE event_id = ?").run(this.eventId);
          updateRevision(this.db, this.eventId);
          if (survivors.length === 1) this.finish();
          else this.createFinal(survivors);
        } else {
          this.db.prepare("UPDATE battle_events SET status = 'shootout' WHERE event_id = ?").run(this.eventId);
          updateRevision(this.db, this.eventId);
          const contenders = plan.groups.flatMap((group) => [...group.players, ...group.bye]);
          this.createTables('shootout', contenders, 1);
        }
      }
      return;
    }
    if (status === 'shootout') {
      if (!this.roomsSettled(this.tables.values())) return;
      const direct = this.db.prepare('SELECT account_id FROM battle_qualification WHERE event_id = ?').all(this.eventId).map((row) => ({ id: row.account_id }));
      const directIds = new Set(direct.map((player) => player.id));
      const survivors = this.registrations().filter((player) => !directIds.has(player.id) && player.stack > 0);
      const round = Number(this.db.prepare("SELECT COALESCE(MAX(round),1) AS round FROM battle_rooms WHERE event_id = ? AND stage = 'shootout'").get(this.eventId).round);
      const result = evaluateShootoutRound({ direct, survivors, tableSize: this.config.tableSize, round });
      if (result.phase === 'final-ready') {
        const qualified = this.registrations().filter((player) => result.qualified.some((q) => q.id === player.id || q.account_id === player.id));
        this.db.prepare(`UPDATE battle_registrations SET status = 'qualified' WHERE event_id = ? AND account_id IN (${qualified.map(() => '?').join(',')})`).run(this.eventId, ...qualified.map((player) => player.id));
        this.db.prepare("UPDATE battle_events SET status = 'final' WHERE event_id = ?").run(this.eventId);
        updateRevision(this.db, this.eventId);
        this.createFinal(qualified);
      } else {
        this.createTables('shootout', survivors, round + 1);
      }
      return;
    }
    if (status === 'final') {
      const tables = [...this.tables.values()].filter((table) => table.cfg.id.split(':')[1] === 'final');
      if (tables.some((table) => table.handInProgress())) return;
      const survivors = tables.flatMap((table) => table.seats.filter((seat) => seat.player && seat.player.stack > 0).map((seat) => seat.player));
      if (survivors.length <= 1) this.finish();
    }
  }

  createFinal(survivors) {
    this.tables.clear();
    this.createTables('final', survivors, 1);
  }

  finish() {
    if (this.event.status === 'finished') return;
    const finalTable = [...this.tables.values()].find((table) => table.cfg.id.split(':')[1] === 'final');
    const winner = finalTable?.seats.find((seat) => seat.player && seat.player.stack > 0);
    const finalists = this.registrations();
    const winnerId = winner?.player.id || finalTable?.tournament?.winner?.id || (!finalTable && finalists.length === 1 ? finalists[0].id : null);
    if (!winnerId) throw new Error('Battle winner is not settled');
    this.recordFinish('final', { id: winnerId, place: 1 });
    const finalEntrants = finalTable?.occupiedSeats().length || finalists.length;
    const shares = finalEntrants === 1 ? [100] : this.config.prizeShares.slice(0, finalEntrants);
    const amounts = largestRemainder(this.config.capacity * this.config.entry, shares);
    const places = this.db.prepare('SELECT f.account_id,f.place FROM battle_finishes f JOIN battle_registrations r ON r.event_id = f.event_id AND r.account_id = f.account_id WHERE f.event_id = ? ORDER BY f.place,r.entry_order').all(this.eventId);
    const awards = battlePrizeAwards(places, amounts);
    for (const finish of places) {
      const amount = awards.get(finish.account_id) || 0;
      this.db.prepare('INSERT OR IGNORE INTO battle_prizes (event_id,account_id,place,amount,created_at) VALUES (?,?,?,?,datetime(\'now\'))').run(this.eventId, finish.account_id, finish.place, amount);
      if (amount > 0) addTransactionEx(finish.account_id, 'battle_prize', amount, `Battle Royale prize ${this.config.name}`, 'USD', { reference: `battle:prize:${this.eventId}:${finish.account_id}`, joinTransaction: true, database: this.db, onDuplicate: 'skip' });
    }
    for (const table of this.tables.values()) {
      if (table.cfg.id.split(':')[1] !== 'final') continue;
      terminalGameCheckpoint(this.db, table.cfg.id, 'battle', 'finished');
      this.db.prepare("UPDATE battle_rooms SET status = 'complete' WHERE room_id = ?").run(table.cfg.id);
    }
    this.db.prepare("UPDATE battle_events SET status = 'finished' WHERE event_id = ?").run(this.eventId);
    updateRevision(this.db, this.eventId);
  }

  tick(now = Date.now()) {
    if (this.event.status === 'rush' && (deadlineExpired(this.event, now) || this.registrations().filter((player) => player.stack > 0).length <= this.config.finalSeats)) this.closeRush();
    for (const table of this.tables.values()) {
      const tableStage = table.cfg.id.split(':')[1];
      if (tableStage !== this.event.status && !(this.event.status === 'draining' && tableStage === 'rush')) continue;
      this.syncClock(table, now);
      if (!table.battleClock || table.battleClock.bankRemainingMs <= 0) {
        if (!table.nextHandAt) table.maybeStart();
        table.tick(now);
      }
    }
    this.advance();
  }

  action(actorId, { stage, roomId, handId, expectedRevision, operationId, action, amount }) {
    return withGameReceipt(this.db, { actorId, operationId, scope: `battle:${this.eventId}:${stage}:${roomId}:${handId}`, request: { stage, roomId, handId, action, amount } }, () => {
      const table = this.tables.get(roomId);
      if (!table || table.cfg.id !== roomId || table.handId !== handId || table.actor !== actorId || this.event.status !== stage || (table.cfg.battleRevision || 0) !== expectedRevision) {
        throw Object.assign(new Error('Battle action is stale'), { status: 409 });
      }
      const result = table.act(actorId, action, amount);
      if (!result.ok) throw Object.assign(new Error(result.error), { status: 400 });
      this.syncClock(table, Date.now());
      this.persist(table, action);
      this.advance();
      return { revision: table.cfg.battleRevision, state: table.snapshotFor(actorId) };
    });
  }

  restore(roomId) {
    const { rules, state } = restoreBattleRoom(this.db, roomId);
    const row = this.db.prepare('SELECT * FROM battle_rooms WHERE room_id = ?').get(roomId);
    if (!row || row.event_id !== this.eventId || row.stage !== rules.stage || row.round !== rules.round || row.revision !== rules.revision) throw new Error('Battle checkpoint metadata changed');
    const level = rules.stage === 'rush' ? this.config.rushStartLevel : rules.stage === 'shootout' ? this.config.shootoutStartLevel : this.config.finalStartLevel;
    const blinds = tournamentLevelBlinds({ baseSb: this.config.smallBlind, baseBb: this.config.bigBlind }, level);
    const table = new PokerTable(this.tables.get(roomId)?.cfg || {
      id: roomId, name: this.config.name, game: 'holdem', category: 'Battle', aof: rules.stage === 'shootout', seats: state.seats.length, sb: blinds.sb, bb: blinds.bb, ante: blinds.ante,
      min_buyin: 20, max_buyin: 1000000, tableIndex: row.table_index,
      tournament: { mode: 'STANDARD', managed: true, entrants: state.seats.length, prizePool: 0, payouts: [], level, blindEvery: 5, baseSb: this.config.smallBlind, baseBb: this.config.bigBlind, baseAnte: blinds.ante, levelStartedAt: Date.now() },
    }, this.tableHooks());
    table.restoreRecoveryState(state);
    table.battleClock = rules.clock;
    table.cfg.battleRevision = rules.revision;
    this.tables.set(roomId, table);
    if (this.autoStart) table.maybeStart();
    this.persist(table, 'restore');
    return table;
  }
}
