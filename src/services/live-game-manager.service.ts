/**
 * LiveGameManager
 * ===============
 * Manages in-memory game state for active tables.
 * This is the single source of truth for running games.
 *
 * Replaces the `liveGames` object from the old server.ts
 */

import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { BotCallerService } from "./bot-caller.service";
import { BotResilienceService } from "./bot-resilience.service";
import { createDeck, shuffle, cardToString } from "../deck";
import { determineWinners, bestHand } from "../handEvaluator";
import { PotManager, BettingRound } from "../betting";

export interface LiveGame {
  game: GameInstance;
  tableId: string;
  gameDbId: string;
  botIdMap: Record<string, string>;
  tournamentId?: string;
  startedAt: Date;
}

export interface GameStateSnapshot {
  tableId: string;
  gameId: string;
  status: "waiting" | "running" | "finished" | "error";
  handNumber: number;
  stage: string;
  pot: number;
  currentBet: number;
  communityCards: string[];
  activePlayerId: string | null;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  players: Array<{
    id: string;
    name: string;
    chips: number;
    folded: boolean;
    allIn: boolean;
    disconnected: boolean;
    strikes: number;
    position: string | null;
    bet: number;
    holeCards?: string[];
  }>;
  log: Array<{ message: string; timestamp: number }>;
}

interface GamePlayer {
  id: string;
  name: string;
  endpoint: string;
  chips: number;
  holeCards: any[];
  folded: boolean;
  allIn: boolean;
  strikes: number;
  disconnected: boolean;
}

const POSITION_NAMES: Record<number, string[]> = {
  2: ["BTN/SB", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "UTG"],
  5: ["BTN", "SB", "BB", "UTG", "CO"],
  6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
  7: ["BTN", "SB", "BB", "UTG", "UTG+1", "HJ", "CO"],
  8: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "HJ", "CO"],
  9: ["BTN", "SB", "BB", "UTG", "UTG+1", "MP", "MP+1", "HJ", "CO"],
};

const MAX_STRIKES = 3;

/**
 * Full poker game instance with game loop
 */
export class GameInstance {
  readonly tableId: string;
  readonly gameId: string;
  readonly tournamentId?: string;

  players: GamePlayer[] = [];
  smallBlind: number;
  bigBlind: number;
  ante: number;
  startingChips: number;
  turnTimeoutMs: number;

  dealerIndex = 0;
  handNumber = 0;
  stage: string = "pre-flop";
  communityCards: any[] = [];
  potManager: PotManager | null = null;
  bettingRound: BettingRound | null = null;
  activePlayer: GamePlayer | null = null;
  running = false;
  status: "waiting" | "running" | "finished" | "error" = "waiting";
  log: Array<{ message: string; timestamp: number }> = [];

  private expectedTotalChips?: number;
  private sleepMs: number = 1500;

  constructor(
    private readonly logger: Logger,
    private readonly eventEmitter: EventEmitter2,
    private readonly botCaller: BotCallerService,
    private readonly botResilience: BotResilienceService,
    config: {
      tableId: string;
      gameId: string;
      tournamentId?: string;
      smallBlind?: number;
      bigBlind?: number;
      ante?: number;
      startingChips?: number;
      turnTimeoutMs?: number;
    },
  ) {
    this.tableId = config.tableId;
    this.gameId = config.gameId;
    this.tournamentId = config.tournamentId;
    this.smallBlind = config.smallBlind ?? 10;
    this.bigBlind = config.bigBlind ?? 20;
    this.ante = config.ante ?? 0;
    this.startingChips = config.startingChips ?? 1000;
    this.turnTimeoutMs = config.turnTimeoutMs ?? 10000;
  }

  addPlayer(player: {
    id: string;
    name: string;
    endpoint: string;
    chips?: number;
  }): void {
    const existing = this.players.find((p) => p.id === player.id);

    if (existing) {
      if (!existing.disconnected) {
        throw new Error(`${player.name} is already seated at this table`);
      }
      existing.disconnected = false;
      existing.strikes = 0;
      existing.endpoint = player.endpoint;
      this.logEvent({ message: `${player.name} reconnected to the table` });
      this.emitStateUpdate();
      return;
    }

    const chips = player.chips ?? this.startingChips;
    const newPlayer: GamePlayer = {
      id: player.id,
      name: player.name,
      endpoint: player.endpoint,
      chips,
      holeCards: [],
      folded: true,
      allIn: false,
      strikes: 0,
      disconnected: false,
    };

    this.players.push(newPlayer);

    if (this.expectedTotalChips === undefined) {
      this.expectedTotalChips = chips;
    } else {
      this.expectedTotalChips += chips;
    }

    this.logEvent({ message: `${player.name} joined the table` });
    this.eventEmitter.emit("game.playerJoined", {
      tableId: this.tableId,
      gameId: this.gameId,
      player: newPlayer,
    });
    this.emitStateUpdate();

    if (
      !this.running &&
      this.status !== "finished" &&
      this.activeSeatCount() >= 2
    ) {
      setImmediate(() => {
        if (!this.running && this.status !== "finished") {
          this.startGame().catch((e) => {
            this.logger.error(`Game loop error: ${e.message}`, e.stack);
          });
        }
      });
    }
  }

  removePlayer(playerId: string): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;

    player.disconnected = true;
    if (this.expectedTotalChips !== undefined) {
      this.expectedTotalChips -= player.chips;
    }
    player.chips = 0;

    this.logEvent({ message: `${player.name} removed from table` });
    this.eventEmitter.emit("game.playerRemoved", {
      tableId: this.tableId,
      gameId: this.gameId,
      playerId,
    });
  }

  async startGame(): Promise<void> {
    this.running = true;
    this.status = "running";

    while (this.running) {
      const playable = this.playablePlayers();
      if (playable.length < 2) {
        const winner = playable[0];
        this.logEvent({
          message: `Game over! Winner: ${winner?.name ?? "nobody"}`,
        });
        this.status = "finished";
        this.emitStateUpdate();
        this.eventEmitter.emit("game.finished", {
          tableId: this.tableId,
          gameId: this.gameId,
          winnerId: winner?.id,
          winnerName: winner?.name,
        });
        break;
      }

      try {
        await this.playHand();
        this.assertChipConservation();
      } catch (e: any) {
        this.logger.error(
          `Hand ${this.handNumber} crashed — stopping game`,
          e.stack,
        );
        this.running = false;
        this.status = "error";
        this.emitStateUpdate();
        throw e;
      }

      this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
      await this.sleep(this.sleepMs);
    }
  }

  async playHand(): Promise<void> {
    this.handNumber++;
    this.stage = "pre-flop";
    this.communityCards = [];
    this.potManager = new PotManager();
    this.log = [];

    for (const p of this.players) {
      p.holeCards = [];
      p.folded = p.chips === 0 || p.disconnected;
      p.allIn = false;
    }

    const deck = shuffle(createDeck());
    let di = 0;
    for (const p of this.players.filter((p) => !p.folded)) {
      p.holeCards = [deck[di++], deck[di++]];
    }

    this.logEvent({
      message: `Hand #${this.handNumber} started. Dealer: ${this.players[this.dealerIndex].name}`,
    });

    this.eventEmitter.emit("game.handStarted", {
      tableId: this.tableId,
      gameId: this.gameId,
      handNumber: this.handNumber,
    });

    if (this.ante > 0) {
      for (const p of this.players.filter((p) => !p.folded)) {
        const anteAmt = Math.min(this.ante, p.chips);
        p.chips -= anteAmt;
        if (p.chips === 0) p.allIn = true;
        this.potManager.addBet(p.id, anteAmt);
      }
      this.logEvent({ message: `Antes posted: ${this.ante} each` });
    }

    const sbIndex = this.nextActiveIndex(this.dealerIndex);
    const bbIndex = this.nextActiveIndex(sbIndex);
    const sb = this.players[sbIndex];
    const bb = this.players[bbIndex];
    const sbAmt = Math.min(this.smallBlind, sb.chips);
    const bbAmt = Math.min(this.bigBlind, bb.chips);

    sb.chips -= sbAmt;
    if (sb.chips === 0) sb.allIn = true;
    bb.chips -= bbAmt;
    if (bb.chips === 0) bb.allIn = true;
    this.potManager.addBet(sb.id, sbAmt);
    this.potManager.addBet(bb.id, bbAmt);

    this.logEvent({ message: `${sb.name} posts small blind: ${sbAmt}` });
    this.logEvent({ message: `${bb.name} posts big blind: ${bbAmt}` });
    this.emitStateUpdate();

    await this.bettingRoundLoop("pre-flop", this.nextActiveIndex(bbIndex), {
      initialBet: this.bigBlind,
      betsThisRound: { [sb.id]: sbAmt, [bb.id]: bbAmt },
    });
    if (this.activePlayers().length <= 1) return this.awardPot();

    di++;
    this.communityCards = [deck[di++], deck[di++], deck[di++]];
    this.logEvent({
      message: `Flop: ${this.communityCards.map(cardToString).join(" ")}`,
    });
    this.emitStateUpdate();
    await this.bettingRoundLoop("flop", this.nextActiveIndex(this.dealerIndex));
    if (this.activePlayers().length <= 1) return this.awardPot();

    di++;
    this.communityCards.push(deck[di++]);
    this.logEvent({
      message: `Turn: ${cardToString(this.communityCards[3])}`,
    });
    this.emitStateUpdate();
    await this.bettingRoundLoop("turn", this.nextActiveIndex(this.dealerIndex));
    if (this.activePlayers().length <= 1) return this.awardPot();

    di++;
    this.communityCards.push(deck[di++]);
    this.logEvent({
      message: `River: ${cardToString(this.communityCards[4])}`,
    });
    this.emitStateUpdate();
    await this.bettingRoundLoop(
      "river",
      this.nextActiveIndex(this.dealerIndex),
    );
    if (this.activePlayers().length <= 1) return this.awardPot();

    return this.showdown();
  }

  private async bettingRoundLoop(
    stageName: string,
    startIndex: number,
    options: {
      initialBet?: number;
      betsThisRound?: Record<string, number>;
    } = {},
  ): Promise<void> {
    this.stage = stageName;
    this.bettingRound = new BettingRound({
      players: this.players,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      isPreFlop: stageName === "pre-flop",
      dealerIndex: this.dealerIndex,
    });

    if (options.betsThisRound) {
      for (const [pid, amt] of Object.entries(options.betsThisRound)) {
        this.bettingRound.betsThisRound[pid] = amt;
      }
      this.bettingRound.currentBet = options.initialBet || 0;
    }

    let currentIndex = startIndex;
    let maxIterations = this.players.length * 4;

    while (!this.bettingRound.isBettingComplete() && maxIterations-- > 0) {
      const player = this.players[currentIndex];

      if (player.folded || player.allIn) {
        currentIndex = this.nextActiveIndex(currentIndex);
        continue;
      }

      this.activePlayer = player;
      this.emitStateUpdate();

      const botPayload = this.buildBotPayload(player);
      const action = await this.getPlayerActionSafe(player, botPayload);

      const result = this.bettingRound.applyAction(player, action);
      if (!result.valid) {
        this.logEvent({
          message: `Invalid action from ${player.name}: ${result.error} — folding`,
        });
        this.bettingRound.applyAction(player, { type: "fold" });
      } else {
        if (result.amountAdded > 0) {
          this.potManager!.addBet(player.id, result.amountAdded);
        }
        this.logEvent({
          message: this.describeAction(player, action, result),
        });
      }

      this.emitStateUpdate();
      currentIndex = this.nextActiveIndex(currentIndex);
    }

    this.activePlayer = null;
    this.bettingRound = null;
    this.potManager!.calculatePots(this.players);
  }

  private async getPlayerActionSafe(
    player: GamePlayer,
    botPayload: any,
  ): Promise<any> {
    try {
      const result = await this.botResilience.callBotWithFallback({
        botId: player.id,
        endpoint: player.endpoint,
        payload: botPayload,
        gameContext: {
          gameId: this.gameId,
          handNumber: this.handNumber,
          stage: this.stage,
          pot: botPayload.table.pot,
          currentBet: this.bettingRound?.currentBet ?? 0,
          toCall: botPayload.action.toCall,
          canCheck: botPayload.action.canCheck,
          minRaise: botPayload.action.minRaise,
          maxRaise: botPayload.action.maxRaise,
        },
      });

      if (result.usedFallback) {
        player.strikes++;
        this.logEvent({
          message: `${player.name} used fallback action (${result.fallbackReason}) — strike ${player.strikes}/${MAX_STRIKES}`,
        });

        if (player.strikes >= MAX_STRIKES) {
          player.disconnected = true;
          this.logEvent({
            message: `${player.name} disconnected after ${player.strikes} strikes`,
          });
          this.eventEmitter.emit("game.playerRemoved", {
            tableId: this.tableId,
            gameId: this.gameId,
            playerId: player.id,
          });
        }
      } else {
        player.strikes = 0;
      }

      return result.action;
    } catch (e: any) {
      player.strikes++;
      const reason =
        e.message === "Timeout" ? "timed out" : `errored (${e.message})`;

      if (player.strikes >= MAX_STRIKES) {
        player.disconnected = true;
        this.logEvent({
          message: `${player.name} ${reason} — strike ${player.strikes}/${MAX_STRIKES}. Disconnected from table.`,
        });
        this.eventEmitter.emit("game.playerRemoved", {
          tableId: this.tableId,
          gameId: this.gameId,
          playerId: player.id,
        });
      } else {
        this.logEvent({
          message: `${player.name} ${reason} — strike ${player.strikes}/${MAX_STRIKES}. Folding.`,
        });
      }

      return { type: "fold" };
    }
  }

  private awardPot(): void {
    this.stage = "showdown";
    const winner = this.activePlayers()[0];
    const total = this.potManager!.getTotalPot();
    winner.chips += total;
    this.potManager!.pots = [{ amount: 0, eligiblePlayerIds: [] }];
    this.logEvent({
      message: `${winner.name} wins ${total} (everyone else folded)`,
    });
    this.emitStateUpdate();
    this.eventEmitter.emit("game.handComplete", {
      tableId: this.tableId,
      gameId: this.gameId,
      handNumber: this.handNumber,
      winners: [{ playerId: winner.id, amount: total }],
      atShowdown: false,
    });
  }

  private showdown(): void {
    this.stage = "showdown";
    const active = this.activePlayers();
    this.potManager!.calculatePots(this.players);
    const results: any[] = [];

    for (const pot of this.potManager!.pots) {
      const eligible = active.filter((p) =>
        pot.eligiblePlayerIds.includes(p.id),
      );
      if (eligible.length === 0) continue;
      const { winners } = determineWinners(eligible, this.communityCards);
      const share = Math.floor(pot.amount / winners.length);
      const remainder = pot.amount - share * winners.length;
      winners.forEach((w: any, i: number) => {
        const player = this.players.find((p) => p.id === w.playerId);
        if (!player) return;
        const amount = share + (i === 0 ? remainder : 0);
        player.chips += amount;
        results.push({ playerId: w.playerId, amount, hand: w.hand });
        this.logEvent({
          message: `${player.name} wins ${amount} with ${w.hand.name}`,
        });
      });
    }

    this.potManager!.pots = [{ amount: 0, eligiblePlayerIds: [] }];
    this.emitStateUpdate();
    this.eventEmitter.emit("game.handComplete", {
      tableId: this.tableId,
      gameId: this.gameId,
      handNumber: this.handNumber,
      winners: results,
      atShowdown: true,
    });
  }

  private buildBotPayload(player: GamePlayer): any {
    const positions = this.computePositions();
    const toCall = this.bettingRound!.getCallAmount(player);

    return {
      gameId: this.gameId,
      handNumber: this.handNumber,
      stage: this.stage,

      you: {
        name: player.name,
        chips: player.chips,
        holeCards: player.holeCards.map(cardToString),
        bet: this.bettingRound!.getPlayerBet(player.id),
        position: positions[player.id] || "Unknown",
        ...(this.communityCards.length > 0 && {
          bestHand: (() => {
            const h = bestHand(player.holeCards, this.communityCards);
            return {
              name: h.name,
              cards: h.cards.map(cardToString),
            };
          })(),
        }),
      },

      action: {
        canCheck: this.bettingRound!.canCheck(player),
        toCall,
        minRaise: this.bettingRound!.minRaise,
        maxRaise: player.chips - toCall,
      },

      table: {
        pot: this.potManager!.getTotalPot(),
        currentBet: this.bettingRound!.currentBet,
        communityCards: this.communityCards.map(cardToString),
        smallBlind: this.smallBlind,
        bigBlind: this.bigBlind,
        ante: this.ante,
      },

      players: this.players.map((p) => ({
        name: p.name,
        chips: p.chips,
        bet: this.bettingRound!.getPlayerBet(p.id),
        folded: p.folded,
        allIn: p.allIn,
        disconnected: p.disconnected,
        position: positions[p.id] || "Unknown",
      })),
    };
  }

  getPublicState(forPlayerId: string | null = null): GameStateSnapshot {
    const positions = this.status === "running" ? this.computePositions() : {};
    return {
      tableId: this.tableId,
      gameId: this.gameId,
      handNumber: this.handNumber,
      status: this.status,
      stage: this.stage,
      communityCards: (this.communityCards || []).map(cardToString),
      pot: this.potManager ? this.potManager.getTotalPot() : 0,
      currentBet: this.bettingRound ? this.bettingRound.currentBet : 0,
      activePlayerId: this.activePlayer ? this.activePlayer.id : null,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      ante: this.ante,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        folded: p.folded,
        allIn: p.allIn,
        disconnected: p.disconnected,
        strikes: p.strikes,
        position: positions[p.id] || null,
        bet: this.bettingRound ? this.bettingRound.getPlayerBet(p.id) : 0,
        holeCards:
          forPlayerId === p.id || this.stage === "showdown"
            ? p.holeCards.map(cardToString)
            : p.holeCards.map(() => "??"),
      })),
      log: this.log.slice(-20),
    };
  }

  private computePositions(): Record<string, string> {
    const active = this.players.filter((p) => p.chips > 0 && !p.disconnected);
    const n = active.length;
    const names = POSITION_NAMES[Math.min(n, 9)] || POSITION_NAMES[9];
    const positions: Record<string, string> = {};
    const dealerPlayer = this.players[this.dealerIndex];
    const dealerActiveIndex = active.findIndex((p) => p.id === dealerPlayer.id);
    active.forEach((p, i) => {
      const offset = (i - dealerActiveIndex + n) % n;
      positions[p.id] = names[offset] || `Seat${offset}`;
    });
    return positions;
  }

  private playablePlayers(): GamePlayer[] {
    return this.players.filter((p) => p.chips > 0 && !p.disconnected);
  }

  private activePlayers(): GamePlayer[] {
    return this.players.filter((p) => !p.folded);
  }

  private activeSeatCount(): number {
    return this.players.filter((p) => !p.disconnected).length;
  }

  private nextActiveIndex(fromIndex: number): number {
    let idx = (fromIndex + 1) % this.players.length;
    let tries = 0;
    while (
      (this.players[idx].folded ||
        this.players[idx].chips === 0 ||
        this.players[idx].disconnected) &&
      tries < this.players.length
    ) {
      idx = (idx + 1) % this.players.length;
      tries++;
    }
    return idx;
  }

  private describeAction(player: GamePlayer, action: any, result: any): string {
    if (action.type === "fold") return `${player.name} folds`;
    if (action.type === "check") return `${player.name} checks`;
    if (action.type === "call")
      return `${player.name} calls ${result.amountAdded}`;
    if (action.type === "raise" || action.type === "bet")
      return `${player.name} raises by ${action.amount}`;
    return `${player.name} acts`;
  }

  private logEvent(event: { message: string }): void {
    this.log.push({ ...event, timestamp: Date.now() });
    this.logger.debug(`[Hand ${this.handNumber}] ${event.message}`);
  }

  private emitStateUpdate(): void {
    this.eventEmitter.emit("game.stateUpdated", {
      tableId: this.tableId,
      gameId: this.gameId,
      state: this.getPublicState(),
    });
  }

  private assertChipConservation(): void {
    if (this.expectedTotalChips === undefined) return;
    const inStacks = this.players.reduce((s, p) => s + p.chips, 0);
    const inPot = this.potManager?.getTotalPot?.() ?? 0;
    const total = inStacks + inPot;
    if (total !== this.expectedTotalChips) {
      const detail = this.players.map((p) => `${p.name}:${p.chips}`).join(", ");
      const err = new Error(
        `Chip conservation violated on hand ${this.handNumber}: ` +
          `expected ${this.expectedTotalChips}, got ${total} ` +
          `(${inStacks} in stacks + ${inPot} in pot). Players: [${detail}]`,
      ) as any;
      err.code = "CHIP_CONSERVATION_VIOLATION";
      throw err;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  stop(): void {
    this.running = false;
  }
}

@Injectable()
export class LiveGameManagerService implements OnModuleDestroy {
  private readonly logger = new Logger(LiveGameManagerService.name);
  private readonly liveGames = new Map<string, LiveGame>();
  private readonly gameStates = new Map<string, GameStateSnapshot>();

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly botCaller: BotCallerService,
    private readonly botResilience: BotResilienceService,
  ) {
    this.eventEmitter.on(
      "game.stateUpdated",
      (event: { tableId: string; state: GameStateSnapshot }) => {
        this.gameStates.set(event.tableId, event.state);
      },
    );

    this.eventEmitter.on(
      "game.recovery.start",
      (event: {
        gameId: string;
        tableId: string;
        tournamentId?: string;
        snapshot: any;
      }) => {
        this.recoverFromSnapshot(event.snapshot).catch((e) =>
          this.logger.error(`Failed to recover game: ${e.message}`),
        );
      },
    );
  }

  onModuleDestroy(): void {
    for (const [tableId, entry] of this.liveGames) {
      this.logger.log(
        `Stopping game at table ${tableId} due to module shutdown`,
      );
      entry.game.stop();
    }
    this.liveGames.clear();
    this.gameStates.clear();
  }

  async recoverFromSnapshot(snapshot: any): Promise<GameInstance | null> {
    try {
      if (this.liveGames.has(snapshot.table_id)) {
        this.logger.warn(
          `Game already exists for table ${snapshot.table_id}, skipping recovery`,
        );
        return null;
      }

      const game = new GameInstance(
        this.logger,
        this.eventEmitter,
        this.botCaller,
        this.botResilience,
        {
          tableId: snapshot.table_id,
          gameId: snapshot.game_id,
          tournamentId: snapshot.tournament_id,
          smallBlind: Number(snapshot.small_blind),
          bigBlind: Number(snapshot.big_blind),
          ante: Number(snapshot.ante),
          startingChips: Number(snapshot.starting_chips),
          turnTimeoutMs: snapshot.turn_timeout_ms,
        },
      );

      for (const player of snapshot.players) {
        game.players.push({
          id: player.id,
          name: player.name,
          endpoint: player.endpoint,
          chips: player.chips,
          holeCards: player.holeCards || [],
          folded: player.folded,
          allIn: player.allIn,
          strikes: player.strikes,
          disconnected: player.disconnected,
        });
      }

      game.handNumber = snapshot.hand_number;
      game.stage = snapshot.game_stage;
      game.dealerIndex = snapshot.dealer_index;
      game.communityCards = snapshot.community_cards || [];

      const liveGame: LiveGame = {
        game,
        tableId: snapshot.table_id,
        gameDbId: snapshot.game_id,
        botIdMap: {},
        tournamentId: snapshot.tournament_id,
        startedAt: new Date(),
      };

      for (const player of snapshot.players) {
        liveGame.botIdMap[player.name] = player.id;
      }

      this.liveGames.set(snapshot.table_id, liveGame);
      this.logger.log(
        `Recovered game for table ${snapshot.table_id} (hand #${snapshot.hand_number})`,
      );

      this.eventEmitter.emit("game.recovered", {
        tableId: snapshot.table_id,
        gameId: snapshot.game_id,
        handNumber: snapshot.hand_number,
      });

      return game;
    } catch (error) {
      this.logger.error(`Failed to recover from snapshot: ${error}`);
      return null;
    }
  }

  createGame(config: {
    tableId: string;
    gameDbId: string;
    tournamentId?: string;
    smallBlind?: number;
    bigBlind?: number;
    ante?: number;
    startingChips?: number;
    turnTimeoutMs?: number;
  }): GameInstance {
    if (this.liveGames.has(config.tableId)) {
      return this.liveGames.get(config.tableId)!.game;
    }

    const game = new GameInstance(
      this.logger,
      this.eventEmitter,
      this.botCaller,
      this.botResilience,
      {
        tableId: config.tableId,
        gameId: config.gameDbId,
        tournamentId: config.tournamentId,
        smallBlind: config.smallBlind,
        bigBlind: config.bigBlind,
        ante: config.ante,
        startingChips: config.startingChips,
        turnTimeoutMs: config.turnTimeoutMs,
      },
    );

    const liveGame: LiveGame = {
      game,
      tableId: config.tableId,
      gameDbId: config.gameDbId,
      botIdMap: {},
      tournamentId: config.tournamentId,
      startedAt: new Date(),
    };

    this.liveGames.set(config.tableId, liveGame);
    this.logger.log(`Created live game for table ${config.tableId}`);

    return game;
  }

  getGame(tableId: string): LiveGame | undefined {
    return this.liveGames.get(tableId);
  }

  getGameState(tableId: string): GameStateSnapshot | undefined {
    const liveGame = this.liveGames.get(tableId);
    if (liveGame) {
      return liveGame.game.getPublicState();
    }
    return this.gameStates.get(tableId);
  }

  getAllGames(): LiveGame[] {
    return Array.from(this.liveGames.values());
  }

  removeGame(tableId: string): void {
    const liveGame = this.liveGames.get(tableId);
    if (liveGame) {
      liveGame.game.stop();
      this.liveGames.delete(tableId);
      this.logger.log(`Removed live game for table ${tableId}`);
    }
  }

  getActiveGameCount(): number {
    return this.liveGames.size;
  }

  registerBotInGame(tableId: string, botId: string, botName: string): void {
    const liveGame = this.liveGames.get(tableId);
    if (liveGame) {
      liveGame.botIdMap[botName] = botId;
    }
  }
}
