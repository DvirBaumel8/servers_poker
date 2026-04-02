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
import { ProvablyFairService, HandSeedData } from "../provably-fair.service";
import {
  createDeck,
  shuffle,
  shuffleWithOrder,
  cardToString,
  parseCard,
} from "../../domain/deck";
import { determineWinners, bestHand } from "../../domain/handEvaluator";
import { PotManager, BettingRound } from "../../domain/betting";
import {
  evaluateStrategy,
  type BotPayload,
} from "../../modules/bot-strategy/strategy-engine.service";
import type { BotStrategy } from "../../domain/bot-strategy/strategy.types";

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
  provablyFair?: {
    serverSeedHash: string;
    clientSeed: string;
    nonce: number;
  };
}

interface GamePlayer {
  id: string;
  name: string;
  strategy: BotStrategy;
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

interface RecoverySnapshot {
  game_id: string;
  table_id: string;
  tournament_id?: string;
  hand_number: number;
  game_stage: string;
  dealer_index: number;
  small_blind: number;
  big_blind: number;
  ante: number;
  starting_chips: number;
  turn_timeout_ms: number;
  community_cards: Array<{ rank: string; suit: string }>;
  players: Array<{
    id: string;
    name: string;
    strategy: BotStrategy | Record<string, any> | null;
    chips: number;
    holeCards?: Array<{ rank: string; suit: string }>;
    folded: boolean;
    allIn: boolean;
    strikes: number;
    disconnected: boolean;
  }>;
}

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
  private sleepMs: number = 4000;
  private handInProgress = false;
  private pendingMutations: Array<() => void> = [];

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
    },
    provablyFairService?: ProvablyFairService,
  ) {
    this.tableId = config.tableId;
    this.gameId = config.gameId;
    this.tournamentId = config.tournamentId;
    this.smallBlind = config.smallBlind ?? 10;
    this.bigBlind = config.bigBlind ?? 20;
    this.ante = config.ante ?? 0;
    this.startingChips = config.startingChips ?? 1000;
    this.turnTimeoutMs = config.turnTimeoutMs ?? 10000;
    this.sleepMs = config.sleepMs ?? 4000;
    this.provablyFairService = provablyFairService || null;
  }

  addPlayer(player: {
    id: string;
    name: string;
    strategy: BotStrategy;
    chips?: number;
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
  }): void {
    const existing = this.players.find((p) => p.id === player.id);

    if (existing) {
      if (!existing.disconnected) {
        throw new Error(`${player.name} is already seated at this table`);
      }
      existing.disconnected = false;
      existing.strikes = 0;
      existing.strategy = player.strategy;
      this.logEvent({ message: `${player.name} reconnected to the table` });
      this.emitStateUpdate();
      return;
    }

    const chips = player.chips ?? this.startingChips;
    const newPlayer: GamePlayer = {
      id: player.id,
      name: player.name,
      strategy: player.strategy,
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
    if (this.handInProgress) {
      const player = this.players.find((p) => p.id === playerId);
      if (player) {
        player.disconnected = true;
        this.logEvent({
          message: `${player.name} marked disconnected — chips reconciled after hand`,
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

    player.disconnected = true;

    if (this.expectedTotalChips !== undefined) {
      const chipsInPot = this.potManager?.getPlayerTotalBet(playerId) || 0;
      this.expectedTotalChips -= player.chips + chipsInPot;
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
    this.logger.log(`[game:${this.gameId.slice(0, 8)}] started`);

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
          this.players[nextDealer].chips > 0 &&
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
    this.logger.log(
      `[playHand] ========== STARTING HAND ${this.handNumber + 1} ==========`,
    );
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
    this.logger.log(`[playHand] Reset players for hand ${this.handNumber}`);

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

    this.eventEmitter.emit("game.handStarted", {
      tableId: this.tableId,
      gameId: this.gameId,
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
      provablyFair: this.currentHandSeed
        ? this.provablyFairService?.getCommitment(this.currentHandSeed)
        : undefined,
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

    // In heads-up, dealer posts small blind. In 3+ players, SB is to dealer's left
    const numPlayers = this.activePlayers().length;
    const sbIndex =
      numPlayers === 2
        ? this.dealerIndex
        : this.nextActiveIndex(this.dealerIndex);
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
    // Emit state after blinds posted so frontend sees pot value
    this.emitStateUpdate();

    this.logger.log(`[playHand] Pre-flop betting starting...`);
    await this.bettingRoundLoop("pre-flop", this.nextActiveIndex(bbIndex), {
      initialBet: this.bigBlind,
      betsThisRound: { [sb.id]: sbAmt, [bb.id]: bbAmt },
    });
    this.logger.log(
      `[playHand] Pre-flop betting done. Active players: ${this.activePlayers().length}`,
    );
    if (this.activePlayers().length <= 1) {
      this.logger.log(
        `[playHand] Only 1 player left after pre-flop, calling awardPot()`,
      );
      return await this.awardPot();
    }

    di++;
    this.communityCards = [deck[di++], deck[di++], deck[di++]];
    this.logEvent({
      message: `Flop: ${this.communityCards.map(cardToString).join(" ")}`,
    });
    this.emitStateUpdate();
    await this.animSleep(400);
    this.logger.log(`[playHand] Flop betting starting...`);
    await this.bettingRoundLoop("flop", this.nextActiveIndex(this.dealerIndex));
    this.logger.log(
      `[playHand] Flop betting done. Active players: ${this.activePlayers().length}`,
    );
    if (this.activePlayers().length <= 1) {
      this.logger.log(
        `[playHand] Only 1 player left after flop, calling awardPot()`,
      );
      return await this.awardPot();
    }

    di++;
    this.communityCards.push(deck[di++]);
    this.logEvent({
      message: `Turn: ${cardToString(this.communityCards[3])}`,
    });
    this.emitStateUpdate();
    await this.animSleep(400);
    this.logger.log(`[playHand] Turn betting starting...`);
    await this.bettingRoundLoop("turn", this.nextActiveIndex(this.dealerIndex));
    this.logger.log(
      `[playHand] Turn betting done. Active players: ${this.activePlayers().length}`,
    );
    if (this.activePlayers().length <= 1) {
      this.logger.log(
        `[playHand] Only 1 player left after turn, calling awardPot()`,
      );
      return await this.awardPot();
    }

    di++;
    this.communityCards.push(deck[di++]);
    this.logEvent({
      message: `River: ${cardToString(this.communityCards[4])}`,
    });
    this.emitStateUpdate();
    await this.animSleep(400);
    this.logger.log(`[playHand] River betting starting...`);
    await this.bettingRoundLoop(
      "river",
      this.nextActiveIndex(this.dealerIndex),
    );
    this.logger.log(
      `[playHand] River betting done. Active players: ${this.activePlayers().length}`,
    );
    if (this.activePlayers().length <= 1) {
      this.logger.log(
        `[playHand] Only 1 player left after river, calling awardPot()`,
      );
      return await this.awardPot();
    }

    this.logger.log(`[playHand] All streets complete, calling showdown()`);
    return await this.showdown();
  }

  private async bettingRoundLoop(
    stageName: string,
    startIndex: number,
    options: {
      initialBet?: number;
      betsThisRound?: Record<string, number>;
    } = {},
  ): Promise<void> {
    this.logger.log(
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
      this.bettingRound.currentBet = options.initialBet || 0;
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

      this.activePlayer = player;
      this.emitStateUpdate();

      const botPayload = this.buildBotPayload(player);
      const action = this.getPlayerActionSafe(player, botPayload);

      const result = this.bettingRound.applyAction(player, action as any);
      if (!result.valid) {
        this.logger.log(
          `[bettingRoundLoop] Invalid action from ${player.name}: ${result.error}`,
        );
        this.logEvent({
          message: `Invalid action from ${player.name}: ${result.error} — folding`,
        });
        this.bettingRound.applyAction(player, { type: "fold" });
        this.emitPlayerAction(player, { type: "fold" }, 0);
      } else {
        if (result.amountAdded > 0) {
          this.potManager!.addBet(player.id, result.amountAdded);
        }
        this.logEvent({
          message: this.describeAction(player, action, result),
        });
        this.emitPlayerAction(player, action, result.amountAdded);
      }

      this.emitStateUpdate();

      await this.animSleep(600);

      currentIndex = this.nextActiveIndex(currentIndex);
      actionCount++;
    }

    this.logger.log(
      `[bettingRoundLoop] ${stageName} complete after ${actionCount} actions. Calculating pots...`,
    );
    this.activePlayer = null;
    this.bettingRound = null;
    this.potManager!.calculatePots(this.players);
    this.logger.log(`[bettingRoundLoop] ${stageName} done`);
  }

  private getPlayerActionSafe(
    player: GamePlayer,
    botPayload: BotPayload,
  ): { type: string; amount?: number } {
    try {
      const result = evaluateStrategy(player.strategy, botPayload);
      player.strikes = 0;
      const action = result.action;
      if (action.type === "all_in") {
        return { type: "raise", amount: botPayload.action.maxRaise };
      }
      return action;
    } catch (e: any) {
      player.strikes++;
      this.logEvent({
        message: `${player.name} strategy error (${e.message}) — strike ${player.strikes}/${MAX_STRIKES}`,
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

      if (botPayload.action.canCheck) {
        return { type: "check" };
      }
      return { type: "fold" };
    }
  }

  private async awardPot(): Promise<void> {
    // Don't set stage to showdown - everyone folded, no cards to reveal
    this.logger.log(`[awardPot] Starting for hand ${this.handNumber}`);
    const winner = this.activePlayers()[0];
    const total = this.potManager!.getTotalPot();
    winner.chips += total;
    this.logEvent({
      message: `${winner.name} wins ${total} (everyone else folded)`,
    });
    this.potManager!.pots = [{ amount: 0, eligiblePlayerIds: [] }];
    this.potManager!.playerTotalBets = {};
    this.emitStateUpdate();
    this.logger.log(`[awardPot] Emitted state, now sleeping for 1.5s...`);
    await this.animSleep(1500);
    this.logger.log(`[awardPot] Sleep done, emitting handComplete`);
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
        totalBet: this.potManager?.getPlayerTotalBet(p.id) || 0,
        holeCards: p.holeCards || [],
      })),
      provablyFair: this.currentHandSeed
        ? this.provablyFairService?.getVerificationData(this.currentHandSeed)
        : undefined,
    });
  }

  private async showdown(): Promise<void> {
    this.logger.log(`[showdown] Starting showdown for hand ${this.handNumber}`);
    this.stage = "showdown";
    const active = this.activePlayers();
    this.logger.log(`[showdown] Active players in showdown: ${active.length}`);
    this.potManager!.calculatePots(this.players);
    this.logger.log(
      `[showdown] Calculated pots: ${this.potManager!.pots.length} pot(s)`,
    );
    const results: any[] = [];

    for (const pot of this.potManager!.pots) {
      const eligible = active.filter((p) =>
        pot.eligiblePlayerIds.includes(p.id),
      );
      if (eligible.length === 0) continue;
      this.logger.log(
        `[showdown] Determining winners for pot of ${pot.amount} with ${eligible.length} eligible players`,
      );
      const { winners } = determineWinners(eligible, this.communityCards);
      const share = Math.floor(pot.amount / winners.length);
      const remainder = pot.amount - share * winners.length;
      winners.forEach((w: any, i: number) => {
        const player = this.players.find((p) => p.id === w.playerId);
        if (!player) return;
        const amount = share + (i === 0 ? remainder : 0);
        player.chips += amount;
        results.push({
          playerId: w.playerId,
          playerName: player.name,
          amount,
          hand: w.hand,
        });
        this.logger.log(
          `[showdown] ${player.name} wins ${amount} with ${w.hand.name}`,
        );
        this.logEvent({
          message: `${player.name} wins ${amount} with ${w.hand.name}`,
        });
      });
    }

    const totalPot = results.reduce((sum, r) => sum + r.amount, 0);
    this.potManager!.pots = [{ amount: 0, eligiblePlayerIds: [] }];
    this.potManager!.playerTotalBets = {};
    this.logger.log(`[showdown] Emitting state update before sleep...`);
    this.emitStateUpdate();
    this.logger.log(`[showdown] Sleeping to show cards...`);
    await this.animSleep(3000);
    this.logger.log(`[showdown] Sleep done, emitting handComplete event...`);
    this.eventEmitter.emit("game.handComplete", {
      tableId: this.tableId,
      gameId: this.gameId,
      handNumber: this.handNumber,
      winners: results,
      atShowdown: true,
      pot: totalPot,
      communityCards: this.communityCards,
      players: this.players.map((p) => ({
        id: p.id,
        chips: p.chips,
        folded: p.folded,
        allIn: p.allIn,
        totalBet: this.potManager?.getPlayerTotalBet(p.id) || 0,
        holeCards: p.holeCards || [],
      })),
      provablyFair: this.currentHandSeed
        ? this.provablyFairService?.getVerificationData(this.currentHandSeed)
        : undefined,
    });
    this.logger.log(`[showdown] Showdown complete`);
  }

  private buildBotPayload(player: GamePlayer): BotPayload {
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
    const state: GameStateSnapshot = {
      tableId: this.tableId,
      gameId: this.gameId,
      tournamentId: this.tournamentId,
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
    amountAdded: number,
  ): void {
    this.eventEmitter.emit("game.playerAction", {
      tableId: this.tableId,
      gameId: this.gameId,
      handNumber: this.handNumber,
      botId: player.id,
      action: action.type,
      amount: action.amount ?? amountAdded,
      pot: this.potManager?.getTotalPot?.() ?? 0,
      stage: this.stage,
      chipsAfter: player.chips,
    });
  }

  setExpectedTotalChips(total: number): void {
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

  // Like sleep() but skipped entirely when sleepMs=0 (simulator / fast mode)
  private animSleep(ms: number): Promise<void> {
    return this.sleep(this.sleepMs === 0 ? 0 : ms);
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

  private redisGameStateService:
    | import("../redis/redis-game-state.service").RedisGameStateService
    | null = null;
  private gameOwnershipService:
    | import("./game-ownership.service").GameOwnershipService
    | null = null;
  private redisEventBusService:
    | import("../redis/redis-event-bus.service").RedisEventBusService
    | null = null;

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

    this.setupRedisEventForwarding();
  }

  setRedisServices(
    redisGameStateService: import("../redis/redis-game-state.service").RedisGameStateService,
    gameOwnershipService: import("./game-ownership.service").GameOwnershipService,
    redisEventBusService: import("../redis/redis-event-bus.service").RedisEventBusService,
  ): void {
    this.redisGameStateService = redisGameStateService;
    this.gameOwnershipService = gameOwnershipService;
    this.redisEventBusService = redisEventBusService;
    this.logger.log("Redis services injected for distributed state sync");
  }

  private isRedisEnabled(): boolean {
    return (
      this.redisGameStateService !== null &&
      this.gameOwnershipService !== null &&
      this.redisEventBusService !== null
    );
  }

  private handleStateUpdate(tableId: string, state: GameStateSnapshot): void {
    this.gameStates.set(tableId, state);

    if (this.isRedisEnabled() && this.liveGames.has(tableId)) {
      const liveGame = this.liveGames.get(tableId)!;
      this.redisGameStateService!.saveGameState(tableId, state, {
        gameDbId: liveGame.gameDbId,
        tournamentId: liveGame.tournamentId || null,
        botIdMap: liveGame.botIdMap,
        startedAt: liveGame.startedAt.toISOString(),
        ownerInstanceId: this.gameOwnershipService!.getInstanceId(),
      }).catch((err) =>
        this.logger.error(
          `Failed to save state to Redis: ${err.message}`,
          err instanceof Error ? err.stack : undefined,
        ),
      );

      this.redisEventBusService!.publish(
        "game.stateUpdated",
        tableId,
        state,
      ).catch((err) =>
        this.logger.error(
          `Failed to publish state event: ${err.message}`,
          err instanceof Error ? err.stack : undefined,
        ),
      );
    }
  }

  private setupRedisEventForwarding(): void {
    const eventsToForward = [
      "game.handStarted",
      "game.handComplete",
      "game.playerAction",
      "game.finished",
      "game.playerRemoved",
      "game.playerJoined",
    ] as const;

    for (const eventType of eventsToForward) {
      this.eventEmitter.on(
        eventType,
        (event: { tableId: string; [key: string]: unknown }) => {
          if (this.isRedisEnabled() && this.liveGames.has(event.tableId)) {
            this.redisEventBusService!.publish(
              eventType,
              event.tableId,
              event,
            ).catch((err) =>
              this.logger.error(
                `Failed to publish ${eventType} event: ${err.message}`,
                err instanceof Error ? err.stack : undefined,
              ),
            );
          }
        },
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const [tableId, entry] of this.liveGames) {
      this.logger.log(
        `Stopping game at table ${tableId} due to module shutdown`,
      );
      entry.game.stop();

      if (this.isRedisEnabled()) {
        await this.gameOwnershipService!.releaseGameOwnership(tableId);
      }
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

      let recoveredTotalChips = 0;
      for (const player of snapshot.players) {
        game.players.push({
          id: player.id,
          name: player.name,
          strategy: player.strategy as BotStrategy,
          chips: player.chips,
          holeCards: (player.holeCards || []).map(parseCard),
          folded: player.folded,
          allIn: player.allIn,
          strikes: player.strikes,
          disconnected: player.disconnected,
        });
        if (!player.disconnected) {
          recoveredTotalChips += player.chips;
        }
      }

      game.handNumber = snapshot.hand_number;
      game.stage = snapshot.game_stage;
      game.dealerIndex = snapshot.dealer_index;
      game.communityCards = (snapshot.community_cards || []).map(parseCard);
      game.setExpectedTotalChips(recoveredTotalChips);

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

    if (this.isRedisEnabled()) {
      const acquired = await this.gameOwnershipService!.acquireGameOwnership(
        config.tableId,
      );
      if (!acquired) {
        const existingState = await this.redisGameStateService!.getGameState(
          config.tableId,
        );
        if (existingState) {
          this.logger.log(
            `Game ${config.tableId} owned by another instance, returning cached state`,
          );
          this.gameStates.set(config.tableId, existingState.snapshot);
        }
        throw new Error(
          `Cannot create game: table ${config.tableId} is owned by another instance`,
        );
      }
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

    if (this.isRedisEnabled()) {
      await this.redisGameStateService!.saveGameState(
        config.tableId,
        game.getPublicState(),
        {
          gameDbId: config.gameDbId,
          tournamentId: config.tournamentId || null,
          botIdMap: {},
          startedAt: liveGame.startedAt.toISOString(),
          ownerInstanceId: this.gameOwnershipService!.getInstanceId(),
        },
      );
    }

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

    const localState = this.gameStates.get(tableId);
    if (localState) {
      return localState;
    }

    if (this.isRedisEnabled()) {
      const redisState =
        await this.redisGameStateService!.getGameState(tableId);
      if (redisState) {
        this.gameStates.set(tableId, redisState.snapshot);
        return redisState.snapshot;
      }
    }

    return undefined;
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

      if (this.isRedisEnabled()) {
        await this.gameOwnershipService!.releaseGameOwnership(tableId);
        await this.redisGameStateService!.deleteGameState(tableId);
      }
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

  async isGameOwner(tableId: string): Promise<boolean> {
    if (!this.isRedisEnabled()) {
      return this.liveGames.has(tableId);
    }
    return this.gameOwnershipService!.isGameOwner(tableId);
  }

  async getAllActiveGamesFromRedis(): Promise<string[]> {
    if (!this.isRedisEnabled()) {
      return Array.from(this.liveGames.keys());
    }
    return this.redisGameStateService!.getAllActiveGames();
  }

  getInstanceId(): string | null {
    return this.gameOwnershipService?.getInstanceId() || null;
  }
}
