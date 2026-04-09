/**
 * LiveGameManager
 * ===============
 * Manages in-memory game state for active tables.
 * This is the single source of truth for running games.
 *
 * Replaces the `liveGames` object from the old server.ts
 */

import { createHash } from "crypto";
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ProvablyFairService, HandSeedData } from "../provably-fair.service";
import {
  createDeck,
  shuffle,
  shuffleWithOrder,
  cardToString,
  parseCard,
} from "../../domain/deck";
import {
  determineWinners,
  bestHand,
  compareHands,
} from "../../domain/handEvaluator";
import { PotManager, BettingRound } from "../../domain/betting";
import {
  getOrHydrateStrategy,
  evaluateHydrated,
  clearEvalCache,
  clearStreetMemos,
  type BotPayload,
} from "../../modules/bot-strategy/strategy-engine.service";
import type {
  BotStrategy,
  HydratedStrategy,
  StrategyEvaluation,
} from "../../domain/bot-strategy/strategy.types";

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
  tournamentId?: string;
  status: "waiting" | "running" | "finished" | "error";
  handNumber: number;
  stage: string;
  pot: bigint;
  currentBet: bigint;
  communityCards: string[];
  activePlayerId: string | null;
  smallBlind: bigint;
  bigBlind: bigint;
  ante: bigint;
  players: Array<{
    id: string;
    name: string;
    chips: bigint;
    folded: boolean;
    allIn: boolean;
    disconnected: boolean;
    strikes: number;
    position: string | null;
    bet: bigint;
    holeCards?: string[];
  }>;
  log: Array<{ message: string; timestamp: number }>;
  provablyFair?: {
    serverSeedHash: string;
    clientSeed: string;
    nonce: number;
  };
}

export type SeatStatus = "active" | "sitting_out" | "eliminated";

interface GamePlayer {
  id: string;
  name: string;
  strategy: BotStrategy;
  hydratedStrategy: HydratedStrategy;
  chips: bigint;
  holeCards: any[];
  folded: boolean;
  allIn: boolean;
  strikes: number;
  seatStatus: SeatStatus;
  /** Derived from seatStatus: true only when eliminated. Kept for backward compatibility. */
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

export interface RecoverySnapshot {
  game_id: string;
  table_id: string;
  tournament_id?: string;
  hand_number: number;
  game_stage: string;
  dealer_index: number;
  small_blind: string | number;
  big_blind: string | number;
  ante: string | number;
  starting_chips: string | number;
  turn_timeout_ms: number;
  community_cards: Array<{ rank: string; suit: string }>;
  /** Present on hot-state (Redis) snapshots; absent on DB snapshots. */
  action_seq?: number;
  /** ISO timestamp of last action; present on hot-state snapshots. */
  last_action_at?: string;
  /** Pot & betting state for mid-hand recovery (hot-state only). */
  pot_state?: {
    playerTotalBets: Record<string, string>;
    playerBetsThisRound: Record<string, string>;
    pots: Array<{ amount: string; eligiblePlayerIds: string[] }>;
  };
  players: Array<{
    id: string;
    name: string;
    strategy: BotStrategy | Record<string, any> | null;
    chips: string;
    holeCards?: Array<{ rank: string; suit: string }>;
    folded: boolean;
    allIn: boolean;
    strikes: number;
    disconnected: boolean;
  }>;
}

const MAX_STRIKES = 3;

/**
 * Normalises a StrategyAction before submitting to BettingRound.applyAction.
 *
 * Handles two cases:
 * 1. `all_in` type — BettingRound has no all_in case; converts to a raise
 *    with the player's full remaining stack above the call obligation.
 * 2. Sub-minimum raise — snaps the raise delta up to lastRaiseDelta.
 *    If the player cannot afford the legal minimum, goes all-in instead
 *    (a partial all-in raise is always legal in NL poker).
 */
export function normalizeRaiseAction(
  action: { type: string; amount?: number },
  lastRaiseDelta: number,
  playerChips: number,
  toCall: number,
): { type: string; amount?: number } {
  const maxRaise = playerChips - toCall;

  if (action.type === "all_in") {
    return { type: "raise", amount: Math.max(1, maxRaise) };
  }

  if (
    (action.type === "raise" || action.type === "bet") &&
    action.amount !== undefined &&
    action.amount < lastRaiseDelta
  ) {
    if (playerChips >= toCall + lastRaiseDelta) {
      return { type: "raise", amount: lastRaiseDelta };
    }
    return { type: "raise", amount: Math.max(1, maxRaise) };
  }

  return action;
}

/**
 * Full poker game instance with game loop
 */
export class GameInstance {
  readonly tableId: string;
  readonly gameId: string;
  readonly tournamentId?: string;

  players: GamePlayer[] = [];
  smallBlind: bigint;
  bigBlind: bigint;
  ante: bigint;
  startingChips: bigint;
  turnTimeoutMs: number;

  dealerIndex = 0;
  handNumber = 0;
  actionSeq = 0;
  stage: string = "pre-flop";
  communityCards: any[] = [];
  potManager: PotManager | null = null;
  bettingRound: BettingRound | null = null;
  activePlayer: GamePlayer | null = null;
  running = false;
  status: "waiting" | "running" | "finished" | "error" = "waiting";
  lastActivityAt: number = Date.now();
  /** Players currently being moved between tables — auto-fold if reached in betting loop. */
  movingPlayers = new Set<string>();
  log: Array<{ message: string; timestamp: number }> = [];

  private expectedTotalChips?: bigint;
  private sleepMs: number = 4000;
  private readonly simulationMode: boolean = false;
  private handInProgress = false;
  private pendingMutations: Array<() => void> = [];
  private lastAggressorId: string | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_INTERVAL_MS = 4000;

  /** Optional hook called between hands. Used by TournamentDirector for hand-for-hand synchronization. */
  interHandHook?: () => Promise<void>;

  /** Optional observer called after every bot decision. Used by the tournament logger. */
  private actionLogger?: (entry: {
    actionSeq: number;
    playerId: string;
    payload: BotPayload;
    evaluation: StrategyEvaluation;
    allPlayers: GamePlayer[];
  }) => void;

  /** Register an action observer. Called once per GameInstance at table-creation time. */
  setActionLogger(
    fn: (entry: {
      actionSeq: number;
      playerId: string;
      payload: BotPayload;
      evaluation: StrategyEvaluation;
      allPlayers: GamePlayer[];
    }) => void,
  ): void {
    this.actionLogger = fn;
  }

  /** Tournament context for strategy stage-awareness. Set by TournamentDirector. */
  private tournamentContext?: {
    startingChips: number;
    startingBigBlind: number;
    playersRemaining: number;
    totalPlayers: number;
  };

  /** Set tournament context so bot strategies can adjust for tournament stage. */
  setTournamentContext(ctx: {
    startingChips: number;
    startingBigBlind: number;
    playersRemaining: number;
    totalPlayers: number;
  }): void {
    this.tournamentContext = ctx;
  }

  // Provably Fair fields
  private provablyFairService: ProvablyFairService | null = null;
  private currentHandSeed: HandSeedData | null = null;
  private handSeeds: Map<number, HandSeedData> = new Map();

  constructor(
    private readonly logger: Logger,
    private readonly eventEmitter: EventEmitter2,
    config: {
      tableId: string;
      gameId: string;
      tournamentId?: string;
      smallBlind?: number;
      bigBlind?: number;
      ante?: number;
      startingChips?: number;
      turnTimeoutMs?: number;
      sleepMs?: number;
      /** turboMode skips all animation/between-hand delays (equivalent to sleepMs=0). */
      turboMode?: boolean;
      /**
       * simulationMode disables all Socket.io/Redis emissions, heartbeat timers, and
       * animation delays. Use this for headless sandbox simulations that must not
       * interfere with live game data or incur unnecessary overhead.
       */
      simulationMode?: boolean;
    },
    provablyFairService?: ProvablyFairService,
  ) {
    this.tableId = config.tableId;
    this.gameId = config.gameId;
    this.tournamentId = config.tournamentId;
    this.smallBlind = BigInt(config.smallBlind ?? 10);
    this.bigBlind = BigInt(config.bigBlind ?? 20);
    this.ante = BigInt(config.ante ?? 0);
    this.startingChips = BigInt(config.startingChips ?? 1000);
    this.turnTimeoutMs = config.turnTimeoutMs ?? 10000;
    this.simulationMode = config.simulationMode ?? false;
    this.sleepMs =
      config.turboMode || config.simulationMode ? 0 : (config.sleepMs ?? 4000);
    this.provablyFairService = provablyFairService || null;
  }

  addPlayer(player: {
    id: string;
    name: string;
    strategy: BotStrategy;
    chips?: number;
    /** Optional seat index for position equity when moving players between tables. */
    insertAt?: number;
  }): void {
    if (this.handInProgress) {
      this.pendingMutations.push(() => this.addPlayerImmediate(player));
      this.logEvent({
        message: `${player.name} will join after current hand`,
      });
      return;
    }
    this.addPlayerImmediate(player);
  }

  private addPlayerImmediate(player: {
    id: string;
    name: string;
    strategy: BotStrategy;
    chips?: number;
    insertAt?: number;
  }): void {
    const existing = this.players.find((p) => p.id === player.id);

    if (existing) {
      if (!existing.disconnected) {
        throw new Error(`${player.name} is already seated at this table`);
      }
      existing.seatStatus = "active";
      existing.disconnected = false;
      existing.strikes = 0;
      existing.strategy = player.strategy;
      existing.hydratedStrategy = getOrHydrateStrategy(player.strategy);
      this.logEvent({ message: `${player.name} reconnected to the table` });
      this.emitStateUpdate();
      return;
    }

    const chips =
      player.chips !== undefined ? BigInt(player.chips) : this.startingChips;
    const newPlayer: GamePlayer = {
      id: player.id,
      name: player.name,
      strategy: player.strategy,
      hydratedStrategy: getOrHydrateStrategy(player.strategy),
      chips,
      holeCards: [],
      folded: true,
      allIn: false,
      strikes: 0,
      seatStatus: "active",
      disconnected: false,
    };

    if (
      player.insertAt !== undefined &&
      player.insertAt >= 0 &&
      player.insertAt < this.players.length
    ) {
      this.players.splice(player.insertAt, 0, newPlayer);
      // Adjust dealerIndex if the insertion is at or before it
      if (player.insertAt <= this.dealerIndex) {
        this.dealerIndex++;
      }
    } else {
      this.players.push(newPlayer);
    }

    if (this.expectedTotalChips === undefined) {
      this.expectedTotalChips = chips;
    } else {
      this.expectedTotalChips = this.expectedTotalChips + chips;
    }

    this.logEvent({ message: `${player.name} joined the table` });
    if (!this.simulationMode) {
      this.eventEmitter.emit("game.playerJoined", {
        tableId: this.tableId,
        gameId: this.gameId,
        player: newPlayer,
      });
    }
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
    if (this.handInProgress) {
      const player = this.players.find((p) => p.id === playerId);
      if (player) {
        player.seatStatus = "eliminated";
        player.disconnected = true;
        this.logEvent({
          message: `${player.name} marked eliminated — chips reconciled after hand`,
        });
      }
      this.pendingMutations.push(() => this.removePlayerImmediate(playerId));
      return;
    }
    this.removePlayerImmediate(playerId);
  }

  private removePlayerImmediate(playerId: string): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;

    player.seatStatus = "eliminated";
    player.disconnected = true;

    if (this.expectedTotalChips !== undefined) {
      const chipsInPot = this.potManager?.getPlayerTotalBet(playerId) ?? 0n;
      this.expectedTotalChips =
        this.expectedTotalChips - player.chips - chipsInPot;
    }
    player.chips = 0n;

    this.logEvent({ message: `${player.name} removed from table` });
    if (!this.simulationMode) {
      this.eventEmitter.emit("game.playerRemoved", {
        tableId: this.tableId,
        gameId: this.gameId,
        playerId,
      });
    }
  }

  /** Transition a sitting_out player back to active. Returns true if successful. */
  reactivatePlayer(playerId: string): boolean {
    const player = this.players.find((p) => p.id === playerId);
    if (!player || player.seatStatus !== "sitting_out") return false;
    player.seatStatus = "active";
    player.strikes = 0;
    this.logEvent({ message: `${player.name} reactivated (back to ACTIVE)` });
    if (!this.simulationMode) {
      this.eventEmitter.emit("game.playerReactivated", {
        tableId: this.tableId,
        gameId: this.gameId,
        playerId,
      });
    }
    return true;
  }

  async startGame(): Promise<void> {
    this.running = true;
    this.status = "running";
    this.logger.log(`[game:${this.gameId.slice(0, 8)}] started`);

    if (!this.simulationMode) {
      this.heartbeatTimer = setInterval(() => {
        this.eventEmitter.emit("game.heartbeat", {
          tableId: this.tableId,
          gameId: this.gameId,
          handNumber: this.handNumber,
        });
      }, this.HEARTBEAT_INTERVAL_MS);
    }

    while (this.running) {
      this.lastActivityAt = Date.now();
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
          reason: "last_player_standing",
          handNumber: this.handNumber,
          players: this.players.map((p) => ({ id: p.id, chips: p.chips })),
        });
        this.logger.log(
          `[game:${this.gameId.slice(0, 8)}] finished — winner: ${winner?.name ?? "none"} after ${this.handNumber} hands`,
        );
        break;
      }

      try {
        this.handInProgress = true;
        await this.playHand();
        this.handInProgress = false;
        this.drainPendingMutations();
        this.assertChipConservation();
        // Synchronization barrier for hand-for-hand play (no-op when not set)
        if (this.interHandHook) {
          await this.interHandHook();
        }
      } catch (e: any) {
        this.handInProgress = false;
        this.drainPendingMutations();
        this.logger.error(
          `[game:${this.gameId.slice(0, 8)}] hand ${this.handNumber} crashed — ${e.message}`,
          e.stack,
        );
        this.running = false;
        this.status = "error";
        this.emitStateUpdate();
        throw e;
      }

      // Advance dealer to the next player who still has chips (skip eliminated seats)
      let nextDealer = (this.dealerIndex + 1) % this.players.length;
      for (let i = 0; i < this.players.length; i++) {
        if (
          this.players[nextDealer].chips > 0n &&
          !this.players[nextDealer].disconnected
        )
          break;
        nextDealer = (nextDealer + 1) % this.players.length;
      }
      this.dealerIndex = nextDealer;
      await this.sleep(this.sleepMs);
    }
  }

  async playHand(): Promise<void> {
    this.logger.debug(
      `[playHand] ========== STARTING HAND ${this.handNumber + 1} ==========`,
    );
    this.handNumber++;
    this.stage = "pre-flop";
    this.communityCards = [];
    this.potManager = new PotManager();
    this.log = [];
    this.lastAggressorId = null;

    // Clear per-hand strategy caches to prevent memory bloat
    clearEvalCache();
    clearStreetMemos();

    for (const p of this.players) {
      p.holeCards = [];
      p.folded = p.chips === 0n || p.seatStatus === "eliminated";
      p.allIn = false;
    }
    this.logger.debug(`[playHand] Reset players for hand ${this.handNumber}`);

    // Generate provably fair seed for this hand
    let deck;
    if (this.provablyFairService) {
      this.currentHandSeed = this.provablyFairService.createHandSeeds(
        this.handNumber,
      );
      this.handSeeds.set(this.handNumber, this.currentHandSeed);
      if (this.handSeeds.size > 50) {
        const oldestKey = this.handSeeds.keys().next().value;
        if (oldestKey !== undefined) this.handSeeds.delete(oldestKey);
      }
      deck = shuffleWithOrder(createDeck(), this.currentHandSeed.deckOrder);
      this.logEvent({
        message: `Provably fair seed commitment: ${this.currentHandSeed.serverSeedHash.substring(0, 16)}...`,
      });
    } else {
      deck = shuffle(createDeck());
    }

    let di = 0;
    for (const p of this.players.filter((p) => !p.folded)) {
      p.holeCards = [deck[di++], deck[di++]];
    }

    this.logEvent({
      message: `Hand #${this.handNumber} started. Dealer: ${this.players[this.dealerIndex].name}`,
    });

    // Build hole cards map for tournament logger (captured at deal time for God Mode replays)
    const dealtHoleCards: Record<string, string[]> = {};
    for (const p of this.players.filter(
      (p) => !p.folded && p.holeCards?.length === 2,
    )) {
      dealtHoleCards[p.id] = p.holeCards.map(cardToString);
    }

    this.eventEmitter.emit("game.handStarted", {
      tableId: this.tableId,
      gameId: this.gameId,
      tournamentId: this.tournamentId,
      handNumber: this.handNumber,
      dealerBotId: this.players[this.dealerIndex].id,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      ante: this.ante,
      players: this.players
        .filter((p) => !p.disconnected && p.chips > 0)
        .map((p, idx) => ({
          id: p.id,
          chips: p.chips,
          position: idx,
        })),
      holeCards: dealtHoleCards,
      provablyFair: this.currentHandSeed
        ? this.provablyFairService?.getCommitment(this.currentHandSeed)
        : undefined,
    });

    if (this.ante > 0n) {
      for (const p of this.players.filter((p) => !p.folded)) {
        const anteAmt = p.chips < this.ante ? p.chips : this.ante;
        p.chips -= anteAmt;
        if (p.chips === 0n) p.allIn = true;
        this.potManager.addBet(p.id, anteAmt);
      }
      this.logEvent({ message: `Antes posted: ${this.ante} each` });
    }

    // In heads-up, dealer posts small blind. In 3+ players, SB is to dealer's left
    const numPlayers = this.activePlayers().length;
    const sbIndex =
      numPlayers === 2
        ? this.dealerIndex
        : this.nextActiveIndex(this.dealerIndex);
    const bbIndex = this.nextActiveIndex(sbIndex);
    const sb = this.players[sbIndex];
    const bb = this.players[bbIndex];
    const sbAmt = sb.chips < this.smallBlind ? sb.chips : this.smallBlind;
    const bbAmt = bb.chips < this.bigBlind ? bb.chips : this.bigBlind;

    sb.chips -= sbAmt;
    if (sb.chips === 0n) sb.allIn = true;
    bb.chips -= bbAmt;
    if (bb.chips === 0n) bb.allIn = true;
    this.potManager.addBet(sb.id, sbAmt);
    this.potManager.addBet(bb.id, bbAmt);

    this.logEvent({ message: `${sb.name} posts small blind: ${sbAmt}` });
    this.logEvent({ message: `${bb.name} posts big blind: ${bbAmt}` });
    // Emit state after blinds posted so frontend sees pot value
    this.emitStateUpdate();

    this.logger.debug(`[playHand] Pre-flop betting starting...`);
    await this.bettingRoundLoop("pre-flop", this.nextActiveIndex(bbIndex), {
      initialBet: this.bigBlind,
      betsThisRound: { [sb.id]: sbAmt, [bb.id]: bbAmt } as Record<
        string,
        bigint
      >,
    });
    this.logger.debug(
      `[playHand] Pre-flop betting done. Active players: ${this.activePlayers().length}`,
    );
    if (this.activePlayers().length <= 1) {
      return await this.awardPot();
    }

    di++;
    this.communityCards = [deck[di++], deck[di++], deck[di++]];
    this.logEvent({
      message: `Flop: ${this.communityCards.map(cardToString).join(" ")}`,
    });
    this.emitStateUpdate();
    await this.animSleep(400);
    this.logger.debug(`[playHand] Flop betting starting...`);
    await this.bettingRoundLoop("flop", this.nextActiveIndex(this.dealerIndex));
    this.logger.debug(
      `[playHand] Flop betting done. Active players: ${this.activePlayers().length}`,
    );
    if (this.activePlayers().length <= 1) {
      return await this.awardPot();
    }

    di++;
    this.communityCards.push(deck[di++]);
    this.logEvent({
      message: `Turn: ${cardToString(this.communityCards[3])}`,
    });
    this.emitStateUpdate();
    await this.animSleep(400);
    this.logger.debug(`[playHand] Turn betting starting...`);
    await this.bettingRoundLoop("turn", this.nextActiveIndex(this.dealerIndex));
    this.logger.debug(
      `[playHand] Turn betting done. Active players: ${this.activePlayers().length}`,
    );
    if (this.activePlayers().length <= 1) {
      return await this.awardPot();
    }

    di++;
    this.communityCards.push(deck[di++]);
    this.logEvent({
      message: `River: ${cardToString(this.communityCards[4])}`,
    });
    this.emitStateUpdate();
    await this.animSleep(400);
    this.logger.debug(`[playHand] River betting starting...`);
    await this.bettingRoundLoop(
      "river",
      this.nextActiveIndex(this.dealerIndex),
    );
    this.logger.debug(
      `[playHand] River betting done. Active players: ${this.activePlayers().length}`,
    );
    if (this.activePlayers().length <= 1) {
      return await this.awardPot();
    }
    return await this.showdown();
  }

  private async bettingRoundLoop(
    stageName: string,
    startIndex: number,
    options: {
      initialBet?: bigint;
      betsThisRound?: Record<string, bigint>;
    } = {},
  ): Promise<void> {
    this.logger.debug(
      `[bettingRoundLoop] Starting ${stageName} - ${this.activePlayers().length} active players`,
    );
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
      this.bettingRound.currentMaxBet = options.initialBet ?? 0n;
    }

    // Set active player to the first to act this round
    const firstToAct = this.players[startIndex];
    if (!firstToAct.folded && !firstToAct.allIn) {
      this.activePlayer = firstToAct;
    }
    this.emitStateUpdate();

    let currentIndex = startIndex;
    let maxIterations = this.players.length * 4;
    let actionCount = 0;

    while (!this.bettingRound.isBettingComplete() && maxIterations-- > 0) {
      const player = this.players[currentIndex];

      if (player.folded || player.allIn) {
        currentIndex = this.nextActiveIndex(currentIndex);
        continue;
      }

      // Player being moved between tables — auto-fold instantly
      if (this.movingPlayers.has(player.id)) {
        this.bettingRound.applyAction(player, { type: "fold" } as any);
        this.emitPlayerAction(player, { type: "fold" }, 0 as any);
        currentIndex = this.nextActiveIndex(currentIndex);
        actionCount++;
        continue;
      }

      // Ghost player: instant auto-check/fold, no strategy eval, no delay
      if (player.seatStatus === "sitting_out") {
        const canCheck =
          this.bettingRound.getPlayerBet(player.id) >=
          this.bettingRound.currentMaxBet;
        const autoAction: { type: string } = canCheck
          ? { type: "check" }
          : { type: "fold" };
        const autoResult = this.bettingRound.applyAction(
          player,
          autoAction as any,
        );
        this.emitPlayerAction(
          player,
          autoAction,
          autoResult.amountAdded as bigint,
        );
        currentIndex = this.nextActiveIndex(currentIndex);
        actionCount++;
        continue;
      }

      this.activePlayer = player;
      this.emitStateUpdate();

      const botPayload = this.buildBotPayload(player);
      const rawAction = await this.getPlayerActionSafe(player, botPayload);

      // Strict Poker Validator — translate all_in and snap sub-minimum raises
      const toCallAmt = Number(this.bettingRound!.getCallAmount(player));
      const actionToApply = normalizeRaiseAction(
        rawAction,
        Number(this.bettingRound!.lastRaiseDelta),
        Number(player.chips),
        toCallAmt,
      );

      const result = this.bettingRound.applyAction(
        player,
        actionToApply as any,
      );
      if (!result.valid) {
        this.logger.warn(
          `[bettingRoundLoop] Invalid action from ${player.name}: ${result.error}`,
        );
        this.logEvent({
          message: `Invalid action from ${player.name}: ${result.error} — folding`,
        });
        this.bettingRound.applyAction(player, { type: "fold" });
        this.emitPlayerAction(player, { type: "fold" }, 0n);
      } else {
        if (result.amountAdded > 0) {
          this.potManager!.addBet(player.id, result.amountAdded);
        }
        if (actionToApply.type === "bet" || actionToApply.type === "raise") {
          this.lastAggressorId = player.id;
        }
        this.logEvent({
          message: this.describeAction(player, actionToApply as any, result),
        });
        this.emitPlayerAction(player, actionToApply as any, result.amountAdded);
      }

      this.emitStateUpdate();

      await this.animSleep(600);

      currentIndex = this.nextActiveIndex(currentIndex);
      actionCount++;
    }

    this.logger.debug(
      `[bettingRoundLoop] ${stageName} complete after ${actionCount} actions`,
    );
    this.activePlayer = null;
    this.bettingRound = null;
    this.potManager!.calculatePots(this.players);
  }

  private async getPlayerActionSafe(
    player: GamePlayer,
    botPayload: BotPayload,
  ): Promise<{ type: string; amount?: number }> {
    // Simulation fast path: evaluateHydrated is synchronous, so skip Promise.race
    // and the 200ms timer entirely — saves ~2 timer allocs + microtask yields per action.
    if (this.sleepMs === 0) {
      try {
        const result = evaluateHydrated(player.hydratedStrategy, botPayload);
        player.strikes = 0;
        this.actionLogger?.({
          actionSeq: this.actionSeq,
          playerId: player.id,
          payload: botPayload,
          evaluation: result,
          allPlayers: this.players,
        });
        const action = result.action;
        if (action.type === "all_in") {
          return { type: "raise", amount: botPayload.action.maxRaise };
        }
        return action;
      } catch (_e: any) {
        player.strikes++;
        if (player.strikes >= MAX_STRIKES && player.seatStatus === "active") {
          player.seatStatus = "sitting_out";
        }
        const fallbackAction = botPayload.action.canCheck
          ? { type: "check" as const }
          : { type: "fold" as const };
        // Log the fallback so the tournament log is never missing an action
        this.actionLogger?.({
          actionSeq: this.actionSeq,
          playerId: player.id,
          payload: botPayload,
          evaluation: {
            action: fallbackAction,
            source: "Personality",
            explanation: `Error fallback: ${_e?.message ?? "unknown"}`,
            metrics: { equity: 0, strategyWeights: undefined },
          },
          allPlayers: this.players,
        });
        return fallbackAction;
      }
    }

    const TIMEOUT_MS = 200;

    // evaluateHydrated is synchronous; Promise.race establishes the 200ms SLA
    // and guards against future async strategy paths.
    // Synchronous infinite-loop protection is enforced by MAX_CONDITION_DEPTH
    // and MAX_CONDITION_NODES limits in the rule evaluator.
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error("Strategy timeout (200ms)")),
        TIMEOUT_MS,
      );
    });

    // Capture evaluation for the action logger before reducing to {type, amount}
    let capturedEvaluation: StrategyEvaluation | undefined;

    const decidePromise = Promise.resolve().then(
      (): { type: string; amount?: number } => {
        const result = evaluateHydrated(player.hydratedStrategy, botPayload);
        capturedEvaluation = result;
        player.strikes = 0;
        const action = result.action;
        if (action.type === "all_in") {
          return { type: "raise", amount: botPayload.action.maxRaise };
        }
        return action;
      },
    );

    try {
      const action = await Promise.race([decidePromise, timeoutPromise]);
      clearTimeout(timeoutHandle);
      if (capturedEvaluation) {
        this.actionLogger?.({
          actionSeq: this.actionSeq,
          playerId: player.id,
          payload: botPayload,
          evaluation: capturedEvaluation,
          allPlayers: this.players,
        });
      }
      return action;
    } catch (e: any) {
      clearTimeout(timeoutHandle);
      player.strikes++;
      this.logger.debug(
        `[getPlayerActionSafe] ${player.name} strategy error: ${e.message} (strike ${player.strikes}/${MAX_STRIKES})`,
      );
      this.logEvent({
        message: `${player.name} strategy error (${e.message}) — strike ${player.strikes}/${MAX_STRIKES}`,
      });

      if (player.strikes >= MAX_STRIKES && player.seatStatus === "active") {
        player.seatStatus = "sitting_out";
        this.logEvent({
          message: `${player.name} sitting out after ${player.strikes} strikes`,
        });
        if (!this.simulationMode) {
          this.eventEmitter.emit("game.playerSittingOut", {
            tableId: this.tableId,
            gameId: this.gameId,
            playerId: player.id,
          });
        }
      }

      const fallbackAction = botPayload.action.canCheck
        ? { type: "check" as const }
        : { type: "fold" as const };
      // Log the fallback so the tournament log is never missing an action
      this.actionLogger?.({
        actionSeq: this.actionSeq,
        playerId: player.id,
        payload: botPayload,
        evaluation: {
          action: fallbackAction,
          source: "Personality",
          explanation: `Error fallback: ${e?.message ?? "unknown"}`,
          metrics: { equity: 0, strategyWeights: undefined },
        },
        allPlayers: this.players,
      });
      return fallbackAction;
    }
  }

  private async awardPot(): Promise<void> {
    // Don't set stage to showdown - everyone folded, no cards to reveal
    const winner = this.activePlayers()[0];
    const total = this.potManager!.getTotalPot();
    winner.chips += total;
    this.logEvent({
      message: `${winner.name} wins ${total} (everyone else folded)`,
    });
    this.potManager!.pots = [{ amount: 0n, eligiblePlayerIds: [] }];
    this.potManager!.playerTotalBets = {};
    this.emitStateUpdate();
    await this.animSleep(1500);
    this.eventEmitter.emit("game.handComplete", {
      tableId: this.tableId,
      gameId: this.gameId,
      handNumber: this.handNumber,
      winners: [{ playerId: winner.id, amount: total }],
      atShowdown: false,
      pot: total,
      communityCards: this.communityCards,
      players: this.players.map((p) => ({
        id: p.id,
        chips: p.chips,
        folded: p.folded,
        allIn: p.allIn,
        totalBet: this.potManager?.getPlayerTotalBet(p.id) ?? 0n,
        holeCards: p.holeCards || [],
      })),
      provablyFair: this.currentHandSeed
        ? this.provablyFairService?.getVerificationData(this.currentHandSeed)
        : undefined,
    });
  }

  private async showdown(): Promise<void> {
    this.stage = "showdown";
    const active = this.activePlayers();
    this.potManager!.calculatePots(this.players);

    // ── 1. Determine all pot winners and best hand per player ──────────
    const winnerIds = new Set<string>();
    const potResults: Array<{
      potAmount: bigint;
      winners: Array<{ playerId: string; amount: bigint; hand: any }>;
    }> = [];

    for (const pot of this.potManager!.pots) {
      const eligible = active.filter((p) =>
        pot.eligiblePlayerIds.includes(p.id),
      );
      // Safety fallback: dead-money pot that calculatePots couldn't merge
      // (no lower pot existed). Award to best hand among all active players.
      const eligibleForPot = eligible.length > 0 ? eligible : active;
      if (eligibleForPot.length === 0) continue;
      this.logger.debug(
        `[showdown] Determining winners for pot of ${pot.amount} with ${eligibleForPot.length} eligible players`,
      );
      const { winners } = determineWinners(eligibleForPot, this.communityCards);
      const share = pot.amount / BigInt(winners.length);
      const remainder = pot.amount - share * BigInt(winners.length);
      const potWinners: (typeof potResults)[0]["winners"] = [];
      winners.forEach((w: any, i: number) => {
        const amount = share + (i === 0 ? remainder : 0n);
        winnerIds.add(w.playerId);
        potWinners.push({ playerId: w.playerId, amount, hand: w.hand });
      });
      potResults.push({ potAmount: pot.amount, winners: potWinners });
    }

    // Pre-compute best hand for every active player
    const playerBestHands = new Map<string, any>();
    for (const p of active) {
      playerBestHands.set(p.id, bestHand(p.holeCards, this.communityCards));
    }

    // ── 2. Build showdown reveal order ──────────────────────────────────
    // Scenario A: Last aggressor shows first
    // Scenario B: No aggression → first active player clockwise from dealer
    let firstToShowIndex: number;
    const aggressorIdx = this.lastAggressorId
      ? active.findIndex((p) => p.id === this.lastAggressorId)
      : -1;

    if (aggressorIdx >= 0) {
      firstToShowIndex = aggressorIdx;
    } else {
      // First active player clockwise from dealer (typically SB)
      const dealerIdxInAll = this.dealerIndex;
      const nextIdx = this.nextActiveIndex(dealerIdxInAll);
      firstToShowIndex = active.findIndex(
        (p) => p.id === this.players[nextIdx].id,
      );
      if (firstToShowIndex < 0) firstToShowIndex = 0;
    }

    // Build clockwise order starting from firstToShow
    const showdownOrder: GamePlayer[] = [];
    for (let i = 0; i < active.length; i++) {
      showdownOrder.push(active[(firstToShowIndex + i) % active.length]);
    }

    // ── 3. Step-by-step reveal with muck logic ──────────────────────────
    const showdownSequence: Array<{
      playerId: string;
      cardStatus: "shown" | "mucked";
      hand?: any;
      order: number;
    }> = [];
    const cardStatusMap = new Map<string, "shown" | "mucked">();
    let currentBestHand: any = null;

    for (let order = 0; order < showdownOrder.length; order++) {
      const player = showdownOrder[order];
      const hand = playerBestHands.get(player.id);
      const isWinner = winnerIds.has(player.id);

      let cardStatus: "shown" | "mucked";

      if (order === 0) {
        // First to show — always shows
        cardStatus = "shown";
        currentBestHand = hand;
      } else if (isWinner) {
        // Winners must always show to claim the pot
        cardStatus = "shown";
        if (compareHands(hand, currentBestHand) >= 0) {
          currentBestHand = hand;
        }
      } else if (compareHands(hand, currentBestHand) >= 0) {
        // Beats or ties current best — must show
        cardStatus = "shown";
        currentBestHand = hand;
      } else {
        // Weaker hand — can muck
        cardStatus = "mucked";
      }

      cardStatusMap.set(player.id, cardStatus);
      showdownSequence.push({
        playerId: player.id,
        cardStatus,
        hand: cardStatus === "shown" ? hand : undefined,
        order,
      });

      this.logger.debug(
        `[showdown] ${player.name}: ${cardStatus}${cardStatus === "shown" ? ` (${hand.name})` : ""}`,
      );

      // Emit per-reveal event for step-by-step UI (skipped in simulation mode)
      if (!this.simulationMode) {
        this.eventEmitter.emit("game.showdownReveal", {
          tableId: this.tableId,
          gameId: this.gameId,
          handNumber: this.handNumber,
          playerId: player.id,
          playerName: player.name,
          cardStatus,
          holeCards: cardStatus === "shown" ? player.holeCards : undefined,
          hand: cardStatus === "shown" ? hand : undefined,
          isWinner,
        });
      }

      await this.animSleep(800);
    }

    // ── 4. Distribute winnings ──────────────────────────────────────────
    const results: Array<{
      playerId: string;
      playerName: string;
      amount: bigint;
      hand: any;
    }> = [];
    for (const potResult of potResults) {
      for (const w of potResult.winners) {
        const player = this.players.find((p) => p.id === w.playerId);
        if (!player) continue;
        player.chips += w.amount;
        // Merge amounts if same player won multiple pots
        const existing = results.find((r) => r.playerId === w.playerId);
        if (existing) {
          existing.amount += w.amount;
        } else {
          results.push({
            playerId: w.playerId,
            playerName: player.name,
            amount: w.amount,
            hand: w.hand,
          });
        }
        this.logger.debug(
          `[showdown] ${player.name} wins ${w.amount} with ${w.hand.name}`,
        );
        this.logEvent({
          message: `${player.name} wins ${w.amount} with ${w.hand.name}`,
        });
      }
    }

    // ── 5. Emit final hand complete ─────────────────────────────────────
    const totalPot = results.reduce((sum, r) => sum + r.amount, 0n);
    this.potManager!.pots = [{ amount: 0n, eligiblePlayerIds: [] }];
    this.potManager!.playerTotalBets = {};
    this.emitStateUpdate();
    this.eventEmitter.emit("game.handComplete", {
      tableId: this.tableId,
      gameId: this.gameId,
      handNumber: this.handNumber,
      winners: results,
      atShowdown: true,
      pot: totalPot,
      communityCards: this.communityCards,
      showdownSequence,
      players: this.players.map((p) => {
        const status = cardStatusMap.get(p.id);
        return {
          id: p.id,
          chips: p.chips,
          folded: p.folded,
          allIn: p.allIn,
          totalBet: this.potManager?.getPlayerTotalBet(p.id) ?? 0n,
          holeCards: status === "mucked" ? [] : p.holeCards || [],
          cardStatus: status ?? (p.folded ? "hidden" : "shown"),
        };
      }),
      provablyFair: this.currentHandSeed
        ? this.provablyFairService?.getVerificationData(this.currentHandSeed)
        : undefined,
    });
    this.logger.debug(`[showdown] Showdown complete`);
  }

  private buildBotPayload(player: GamePlayer): BotPayload {
    const positions = this.computePositions();
    const toCall = this.bettingRound!.getCallAmount(player);

    // Derive deterministic seed from provably fair chain + botId + actionSeq
    const baseSeed = this.currentHandSeed?.combinedHash ?? this.gameId;
    const decisionSeed = createHash("sha256")
      .update(`${baseSeed}:${player.id}:${this.actionSeq}`)
      .digest("hex");

    return {
      gameId: this.gameId,
      handNumber: this.handNumber,
      stage: this.stage,
      decisionSeed,

      you: {
        name: player.name,
        chips: Number(player.chips),
        holeCards: player.holeCards.map(cardToString),
        bet: Number(this.bettingRound!.getPlayerBet(player.id)),
        position: positions[player.id] || "Unknown",
        ...(this.communityCards.length > 0 && {
          bestHand: (() => {
            const h = bestHand(player.holeCards, this.communityCards);
            return {
              name: h.name,
              cards: (h.cards ?? []).map(cardToString),
            };
          })(),
        }),
      },

      action: {
        canCheck: this.bettingRound!.canCheck(player),
        toCall: Number(toCall),
        minRaise: Number(this.bettingRound!.lastRaiseDelta),
        maxRaise: Number(player.chips - toCall),
      },

      table: {
        pot: Number(this.potManager!.getTotalPot()),
        currentBet: Number(this.bettingRound!.currentMaxBet),
        communityCards: this.communityCards.map(cardToString),
        smallBlind: Number(this.smallBlind),
        bigBlind: Number(this.bigBlind),
        ante: Number(this.ante),
      },

      players: this.players.map((p) => ({
        name: p.name,
        chips: Number(p.chips),
        bet: Number(this.bettingRound!.getPlayerBet(p.id)),
        folded: p.folded,
        allIn: p.allIn,
        seatStatus: p.seatStatus,
        disconnected: p.disconnected,
        position: positions[p.id] || "Unknown",
      })),

      ...(this.tournamentContext && {
        tournament: {
          startingChips: this.tournamentContext.startingChips,
          startingBigBlind: this.tournamentContext.startingBigBlind,
          playersRemaining: this.tournamentContext.playersRemaining,
          totalPlayers: this.tournamentContext.totalPlayers,
        },
      }),
    };
  }

  getPublicState(forPlayerId: string | null = null): GameStateSnapshot {
    const positions = this.status === "running" ? this.computePositions() : {};
    const state: GameStateSnapshot = {
      tableId: this.tableId,
      gameId: this.gameId,
      tournamentId: this.tournamentId,
      handNumber: this.handNumber,
      status: this.status,
      stage: this.stage,
      communityCards: (this.communityCards || []).map(cardToString),
      pot: this.potManager ? this.potManager.getTotalPot() : 0n,
      currentBet: this.bettingRound ? this.bettingRound.currentMaxBet : 0n,
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
        seatStatus: p.seatStatus,
        disconnected: p.disconnected,
        strikes: p.strikes,
        position: positions[p.id] || null,
        bet: this.bettingRound ? this.bettingRound.getPlayerBet(p.id) : 0n,
        holeCards:
          forPlayerId === p.id || this.stage === "showdown"
            ? p.holeCards.map(cardToString)
            : p.holeCards.map(() => "??"),
      })),
      log: this.log.slice(-20),
    };

    // Include provably fair commitment (hash only, not the actual seed)
    if (this.currentHandSeed && this.provablyFairService) {
      state.provablyFair = this.provablyFairService.getCommitment(
        this.currentHandSeed,
      );
    }

    return state;
  }

  /**
   * Get provably fair verification data for a specific hand
   * Returns null if hand not found or provably fair is not enabled
   */
  getHandVerificationData(handNumber: number): {
    serverSeed: string;
    serverSeedHash: string;
    clientSeed: string;
    nonce: number;
    combinedHash: string;
    deckOrder: number[];
  } | null {
    const seedData = this.handSeeds.get(handNumber);
    if (!seedData || !this.provablyFairService) {
      return null;
    }
    return {
      serverSeed: seedData.serverSeed,
      serverSeedHash: seedData.serverSeedHash,
      clientSeed: seedData.clientSeed,
      nonce: seedData.nonce,
      combinedHash: seedData.combinedHash,
      deckOrder: seedData.deckOrder,
    };
  }

  private computePositions(): Record<string, string> {
    const active = this.players.filter((p) => p.chips > 0n && !p.disconnected);
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
    return this.players.filter((p) => p.chips > 0n && !p.disconnected);
  }

  private activePlayers(): GamePlayer[] {
    return this.players.filter((p) => !p.folded && !p.disconnected);
  }

  private activeSeatCount(): number {
    return this.players.filter((p) => !p.disconnected).length;
  }

  private nextActiveIndex(fromIndex: number): number {
    let idx = (fromIndex + 1) % this.players.length;
    let tries = 0;
    while (
      (this.players[idx].folded ||
        this.players[idx].chips === 0n ||
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
    if (this.simulationMode) return;
    const state = this.getPublicState();
    this.logger.debug(
      `📡 Emitting state update: hand=${this.handNumber}, stage=${this.stage}, players=${state.players?.length}`,
    );
    this.eventEmitter.emit("game.stateUpdated", {
      tableId: this.tableId,
      gameId: this.gameId,
      state,
    });
  }

  private emitPlayerAction(
    player: GamePlayer,
    action: { type: string; amount?: number },
    amountAdded: bigint,
  ): void {
    this.actionSeq++;
    this.lastActivityAt = Date.now();
    this.eventEmitter.emit("game.playerAction", {
      tableId: this.tableId,
      gameId: this.gameId,
      handNumber: this.handNumber,
      botId: player.id,
      action: action.type,
      amount:
        action.amount !== undefined
          ? BigInt(Math.round(action.amount))
          : amountAdded,
      pot: this.potManager?.getTotalPot?.() ?? 0n,
      stage: this.stage,
      chipsAfter: player.chips,
      actionSeq: this.actionSeq,
    });
    // Fire-and-forget hot-state sync to Redis (per-action, includes strategy) — skipped in simulation mode
    if (!this.simulationMode) {
      this.eventEmitter.emit("game.hotState", {
        gameId: this.gameId,
        snapshot: this.buildHotStateSnapshot(),
      });
    }
  }

  private buildHotStateSnapshot(): RecoverySnapshot {
    const snapshot: RecoverySnapshot = {
      game_id: this.gameId,
      table_id: this.tableId,
      tournament_id: this.tournamentId,
      hand_number: this.handNumber,
      game_stage: this.stage,
      dealer_index: this.dealerIndex,
      small_blind: this.smallBlind.toString(),
      big_blind: this.bigBlind.toString(),
      ante: this.ante.toString(),
      starting_chips: this.startingChips.toString(),
      turn_timeout_ms: this.turnTimeoutMs,
      community_cards: this.communityCards,
      action_seq: this.actionSeq,
      last_action_at: new Date().toISOString(),
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        strategy: p.strategy,
        chips: p.chips.toString(),
        holeCards: p.holeCards,
        folded: p.folded,
        allIn: p.allIn,
        strikes: p.strikes,
        seatStatus: p.seatStatus,
        disconnected: p.disconnected,
      })),
    };

    if (this.potManager) {
      snapshot.pot_state = {
        playerTotalBets: Object.fromEntries(
          Object.entries(this.potManager.playerTotalBets).map(([k, v]) => [
            k,
            v.toString(),
          ]),
        ),
        playerBetsThisRound: Object.fromEntries(
          Object.entries(this.potManager.playerBetsThisRound).map(([k, v]) => [
            k,
            v.toString(),
          ]),
        ),
        pots: this.potManager.pots.map((p) => ({
          amount: p.amount.toString(),
          eligiblePlayerIds: [...p.eligiblePlayerIds],
        })),
      };
    }

    return snapshot;
  }

  setExpectedTotalChips(total: bigint): void {
    this.expectedTotalChips = total;
  }

  private drainPendingMutations(): void {
    const mutations = this.pendingMutations.splice(0);
    for (const mutation of mutations) {
      try {
        mutation();
      } catch (e: any) {
        this.logger.warn(`Pending mutation failed: ${e.message}`);
      }
    }
  }

  private assertChipConservation(): void {
    if (this.expectedTotalChips === undefined) return;
    const inStacks = this.players.reduce((s, p) => s + p.chips, 0n);
    const inPot = this.potManager?.getTotalPot?.() ?? 0n;
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
    if (ms === 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Like sleep() but skipped entirely when sleepMs=0 (simulator / fast mode)
  private animSleep(ms: number): Promise<void> {
    return this.sleep(this.sleepMs === 0 ? 0 : ms);
  }

  stop(): void {
    this.running = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

@Injectable()
export class LiveGameManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveGameManagerService.name);
  private readonly liveGames = new Map<string, LiveGame>();
  private readonly gameStates = new Map<string, GameStateSnapshot>();

  private heartbeatMonitor?: ReturnType<typeof setInterval>;
  private readonly GAME_HEARTBEAT_TIMEOUT_MS = 120_000; // 2 minutes
  private readonly GAME_HEARTBEAT_CHECK_MS = 30_000; // 30 seconds

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly provablyFairService: ProvablyFairService,
  ) {
    this.eventEmitter.on(
      "game.stateUpdated",
      (event: { tableId: string; state: GameStateSnapshot }) => {
        this.handleStateUpdate(event.tableId, event.state);
      },
    );

    this.eventEmitter.on(
      "game.recovery.start",
      (event: {
        gameId: string;
        tableId: string;
        tournamentId?: string;
        snapshot: RecoverySnapshot;
      }) => {
        this.recoverFromSnapshot(event.snapshot).catch((e) =>
          this.logger.error(
            `Failed to recover game: ${e.message}`,
            e instanceof Error ? e.stack : undefined,
          ),
        );
      },
    );
  }

  onModuleInit(): void {
    this.heartbeatMonitor = setInterval(() => {
      this.checkGameHeartbeats();
    }, this.GAME_HEARTBEAT_CHECK_MS);
  }

  private checkGameHeartbeats(): void {
    const now = Date.now();
    for (const [tableId, liveGame] of this.liveGames) {
      if (!liveGame.game.running) continue;
      const silenceMs = now - liveGame.game.lastActivityAt;
      if (silenceMs > this.GAME_HEARTBEAT_TIMEOUT_MS) {
        this.logger.error(
          `Game loop stuck for table ${tableId}: no activity for ${Math.floor(silenceMs / 1000)}s — triggering recovery`,
        );
        liveGame.game.stop();
        this.liveGames.delete(tableId);
        this.eventEmitter.emit("game.stuck", {
          tableId,
          gameId: liveGame.gameDbId,
          tournamentId: liveGame.tournamentId,
          silenceMs,
        });
      }
    }
  }

  private handleStateUpdate(tableId: string, state: GameStateSnapshot): void {
    this.gameStates.set(tableId, state);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.heartbeatMonitor) {
      clearInterval(this.heartbeatMonitor);
    }
    for (const [tableId, entry] of this.liveGames) {
      this.logger.log(
        `Stopping game at table ${tableId} due to module shutdown`,
      );
      entry.game.stop();
    }
    this.liveGames.clear();
    this.gameStates.clear();
  }

  async recoverFromSnapshot(
    snapshot: RecoverySnapshot,
  ): Promise<GameInstance | null> {
    try {
      if (
        !snapshot?.table_id ||
        !snapshot?.game_id ||
        !Array.isArray(snapshot?.players)
      ) {
        this.logger.error("Invalid recovery snapshot: missing required fields");
        return null;
      }

      if (this.liveGames.has(snapshot.table_id)) {
        this.logger.warn(
          `Game already exists for table ${snapshot.table_id}, skipping recovery`,
        );
        return null;
      }

      const game = new GameInstance(
        this.logger,
        this.eventEmitter,
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
        this.provablyFairService,
      );

      let recoveredTotalChips = 0n;
      for (const player of snapshot.players) {
        const strategy = player.strategy as BotStrategy;
        const seatStatus: SeatStatus =
          (player as any).seatStatus ??
          (player.disconnected ? "eliminated" : "active");
        const chips = BigInt(player.chips);
        game.players.push({
          id: player.id,
          name: player.name,
          strategy,
          hydratedStrategy: getOrHydrateStrategy(strategy),
          chips,
          holeCards: (player.holeCards || []).map(parseCard),
          folded: player.folded,
          allIn: player.allIn,
          strikes: player.strikes,
          seatStatus,
          disconnected: seatStatus === "eliminated",
        });
        if (!player.disconnected) {
          recoveredTotalChips += chips;
        }
      }

      game.handNumber = snapshot.hand_number;
      game.stage = snapshot.game_stage;
      game.dealerIndex = snapshot.dealer_index;
      game.communityCards = (snapshot.community_cards || []).map(parseCard);
      game.actionSeq = snapshot.action_seq ?? 0;

      // Refund pot chips back to players so recovery starts a fresh hand.
      // This avoids fragile mid-betting-round reconstruction.
      if (snapshot.pot_state?.playerTotalBets) {
        let refundTotal = 0n;
        for (const [playerId, rawAmount] of Object.entries(
          snapshot.pot_state.playerTotalBets,
        )) {
          const amount = BigInt(rawAmount);
          const player = game.players.find((p) => p.id === playerId);
          if (player) {
            player.chips += amount;
            recoveredTotalChips += amount;
            refundTotal += amount;
          }
        }
        this.logger.debug(
          `Refunded pot (${refundTotal} chips) to players for clean recovery`,
        );
      }

      // Reset mid-hand state so startGame() begins the next hand cleanly
      for (const p of game.players) {
        p.folded = false;
        p.allIn = false;
        p.holeCards = [];
      }
      game.communityCards = [];
      game.potManager = null;
      game.bettingRound = null;
      game.stage = "pre-flop";

      game.setExpectedTotalChips(recoveredTotalChips as bigint);

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

      // Restart the game loop after recovery
      game.startGame().catch((e) => {
        this.logger.error(
          `Recovered game loop failed for table ${snapshot.table_id}: ${e.message}`,
          e.stack,
        );
      });

      return game;
    } catch (error) {
      this.logger.error(
        `Failed to recover from snapshot: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }

  async createGame(config: {
    tableId: string;
    gameDbId: string;
    tournamentId?: string;
    smallBlind?: number;
    bigBlind?: number;
    ante?: number;
    startingChips?: number;
    turnTimeoutMs?: number;
  }): Promise<GameInstance> {
    if (this.liveGames.has(config.tableId)) {
      return this.liveGames.get(config.tableId)!.game;
    }

    const game = new GameInstance(
      this.logger,
      this.eventEmitter,
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
      this.provablyFairService,
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
    this.logger.log(
      `[createGame] table=${config.tableId.slice(0, 8)} game=${config.gameDbId.slice(0, 8)} (${this.liveGames.size} active)`,
    );

    return game;
  }

  createGameSync(config: {
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
      this.provablyFairService,
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
    this.logger.log(`Created live game for table ${config.tableId} (sync)`);

    return game;
  }

  getGame(tableId: string): LiveGame | undefined {
    // First try direct lookup by tableId
    let liveGame = this.liveGames.get(tableId);

    // If not found, try finding by gameDbId (in case tableId is actually a gameId)
    if (!liveGame) {
      for (const [_, game] of this.liveGames) {
        if (game.gameDbId === tableId) {
          liveGame = game;
          break;
        }
      }
    }

    return liveGame;
  }

  getGameState(tableId: string): GameStateSnapshot | undefined {
    // First try direct lookup by tableId
    let liveGame = this.liveGames.get(tableId);

    // If not found, try finding by gameDbId (in case tableId is actually a gameId)
    if (!liveGame) {
      for (const [, game] of this.liveGames) {
        if (game.gameDbId === tableId) {
          liveGame = game;
          break;
        }
      }
    }

    if (liveGame) {
      return liveGame.game.getPublicState();
    }

    return this.gameStates.get(tableId);
  }

  async getGameStateAsync(
    tableId: string,
  ): Promise<GameStateSnapshot | undefined> {
    const liveGame = this.liveGames.get(tableId);
    if (liveGame) {
      return liveGame.game.getPublicState();
    }

    return this.gameStates.get(tableId);
  }

  getAllGames(): LiveGame[] {
    return Array.from(this.liveGames.values());
  }

  async removeGame(tableId: string): Promise<void> {
    const liveGame = this.liveGames.get(tableId);
    if (liveGame) {
      liveGame.game.stop();
      this.liveGames.delete(tableId);
      this.logger.log(`Removed live game for table ${tableId}`);
    }
  }

  removeGameSync(tableId: string): void {
    const liveGame = this.liveGames.get(tableId);
    if (liveGame) {
      liveGame.game.stop();
      this.liveGames.delete(tableId);
      this.logger.log(`Removed live game for table ${tableId} (sync)`);
    }
  }

  getActiveGameCount(): number {
    return this.liveGames.size;
  }

  getRunningGameCount(): number {
    let count = 0;
    for (const [, liveGame] of this.liveGames) {
      if (liveGame.game.running) {
        count++;
      }
    }
    return count;
  }

  registerBotInGame(tableId: string, botId: string, botName: string): void {
    const liveGame = this.liveGames.get(tableId);
    if (liveGame) {
      liveGame.botIdMap[botName] = botId;
    }
  }

  isGameOwnedLocally(tableId: string): boolean {
    return this.liveGames.has(tableId);
  }

  isGameOwner(tableId: string): boolean {
    return this.liveGames.has(tableId);
  }

  getAllActiveGames(): string[] {
    return Array.from(this.liveGames.keys());
  }
}
