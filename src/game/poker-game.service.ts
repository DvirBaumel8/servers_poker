import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ChipInvariantChecker, TransactionAuditLog } from "./invariants";
import {
  ChipConservationError,
  InvalidActionError,
} from "../common/filters/game-exception.filter";

export interface Card {
  rank: string;
  suit: string;
}

export interface Player {
  id: string;
  name: string;
  endpoint: string;
  chips: number;
  holeCards: Card[];
  folded: boolean;
  allIn: boolean;
  strikes: number;
  disconnected: boolean;
  currentBet: number;
}

interface PlayerSnapshot {
  id: string;
  chips: number;
  folded: boolean;
  allIn: boolean;
  currentBet: number;
}

interface BlindPositions {
  dealer: string;
  smallBlind: string;
  bigBlind: string;
  dealerSmallBlind?: string;
}

export interface GameConfig {
  gameId: string;
  tableId: string;
  tournamentId?: string;
  smallBlind: number;
  bigBlind: number;
  ante?: number;
  startingChips?: number;
  turnTimeoutMs?: number;
  maxStrikes?: number;
  isCashGame?: boolean;
}

export interface ActionResult {
  valid: boolean;
  error?: string;
  amountAdded: number;
}

export interface HandResult {
  handNumber: number;
  winners: Array<{
    playerId: string;
    playerName: string;
    amount: number;
    handName?: string;
  }>;
  pot: number;
  atShowdown: boolean;
  communityCards: Card[];
  players: Array<{
    id: string;
    name: string;
    chips: number;
    holeCards: Card[];
    folded: boolean;
    won: boolean;
  }>;
}

export interface GameFinishReason {
  reason:
    | "winner_determined"
    | "last_player_standing"
    | "all_players_left"
    | "tournament_ended";
  winnerId?: string;
  winnerName?: string;
}

type GameStatus = "waiting" | "running" | "paused" | "finished" | "error";
type HandStage = "pre-flop" | "flop" | "turn" | "river" | "showdown";

@Injectable()
export class PokerGameService {
  private readonly logger = new Logger(PokerGameService.name);
  private readonly invariantChecker = new ChipInvariantChecker();
  private readonly auditLog = new TransactionAuditLog();

  private players: Player[] = [];
  private config: GameConfig;
  private status: GameStatus = "waiting";
  private handNumber = 0;
  private stage: HandStage = "pre-flop";
  private dealerIndex = 0;
  private communityCards: Card[] = [];
  private pot = 0;
  private currentBet = 0;
  private expectedTotalChips = 0;
  private running = false;
  private currentPlayerId: string | null = null;
  private handInProgress = false;
  private handStartSnapshot: PlayerSnapshot[] = [];

  constructor(private readonly eventEmitter: EventEmitter2) {
    this.config = {
      gameId: "",
      tableId: "",
      smallBlind: 10,
      bigBlind: 20,
      ante: 0,
      startingChips: 1000,
      turnTimeoutMs: 10000,
      maxStrikes: 3,
      isCashGame: false,
    };
  }

  initialize(config: GameConfig): void {
    this.config = {
      ...this.config,
      ...config,
    };
    this.status = "waiting";
    this.handNumber = 0;
    this.players = [];
    this.currentPlayerId = null;
    this.handInProgress = false;
    this.auditLog.clear();

    this.logger.log(
      `Game ${config.gameId} initialized for table ${config.tableId}`,
    );
  }

  addPlayer(
    player: Omit<
      Player,
      "holeCards" | "folded" | "allIn" | "strikes" | "disconnected"
    >,
  ): void {
    const existing = this.players.find((p) => p.id === player.id);
    if (existing) {
      if (!existing.disconnected) {
        throw new InvalidActionError("add_player", "Player already at table", {
          playerId: player.id,
        });
      }
      existing.disconnected = false;
      existing.strikes = 0;
      existing.endpoint = player.endpoint;
      this.logger.log(`Player ${player.name} reconnected`);
      return;
    }

    const startingChips = this.config.startingChips || player.chips;
    const newPlayer: Player = {
      ...player,
      chips: startingChips,
      holeCards: [],
      folded: true,
      allIn: false,
      strikes: 0,
      disconnected: false,
      currentBet: 0,
    };

    this.players.push(newPlayer);
    this.expectedTotalChips += startingChips;

    this.logger.log(`Player ${player.name} joined with ${startingChips} chips`);

    this.eventEmitter.emit("game.playerJoined", {
      gameId: this.config.gameId,
      player: newPlayer,
    });
  }

  removePlayer(playerId: string): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;

    const _wasActive = !player.folded && !player.disconnected;

    player.disconnected = true;
    this.expectedTotalChips -= player.chips;
    player.chips = 0;

    this.logger.log(`Player ${player.name} removed from game`);

    this.eventEmitter.emit("game.playerRemoved", {
      gameId: this.config.gameId,
      playerId,
    });
  }

  handlePlayerLeave(playerId: string): GameFinishReason | null {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return null;

    this.logger.log(`Player ${player.name} leaving table`);

    const wasCurrentPlayer = this.currentPlayerId === playerId;
    const wasActiveInHand =
      this.handInProgress && !player.folded && !player.disconnected;

    if (wasActiveInHand) {
      this.applyPenaltyFold(playerId);
    }

    this.removePlayer(playerId);

    if (wasActiveInHand) {
      const activePlayers = this.getActivePlayers();
      if (activePlayers.length === 1) {
        this.logger.log(`Only one active player remaining, awarding pot`);
        const winner = activePlayers[0];
        this.awardPot(winner.id, this.pot);
        this.endHand();
      } else if (activePlayers.length > 1 && wasCurrentPlayer) {
        this.advanceToNextPlayer();
      }
    }

    return this.checkGameEndConditions();
  }

  private handlePlayerFoldedDuringHand(playerId: string): void {
    const activePlayers = this.getActivePlayers();

    if (activePlayers.length === 1) {
      this.logger.log(`Only one active player remaining, awarding pot`);
      const winner = activePlayers[0];
      this.awardPot(winner.id, this.pot);
      this.endHand();
    } else if (activePlayers.length > 1 && this.currentPlayerId === playerId) {
      this.advanceToNextPlayer();
    }
  }

  private checkGameEndConditions(): GameFinishReason | null {
    const activePlayers = this.players.filter(
      (p) => !p.disconnected && p.chips > 0,
    );

    if (activePlayers.length === 0) {
      this.finishGame({
        reason: "all_players_left",
      });
      return { reason: "all_players_left" };
    }

    if (activePlayers.length === 1) {
      const winner = activePlayers[0];

      if (this.config.isCashGame) {
        this.finishGame({
          reason: "last_player_standing",
          winnerId: winner.id,
          winnerName: winner.name,
        });
        return {
          reason: "last_player_standing",
          winnerId: winner.id,
          winnerName: winner.name,
        };
      }

      this.finishGame({
        reason: "winner_determined",
        winnerId: winner.id,
        winnerName: winner.name,
      });
      return {
        reason: "winner_determined",
        winnerId: winner.id,
        winnerName: winner.name,
      };
    }

    return null;
  }

  private finishGame(reason: GameFinishReason): void {
    this.status = "finished";
    this.running = false;
    this.handInProgress = false;

    this.logger.log(`Game ${this.config.gameId} finished: ${reason.reason}`);

    this.eventEmitter.emit("game.finished", {
      gameId: this.config.gameId,
      tableId: this.config.tableId,
      tournamentId: this.config.tournamentId,
      ...reason,
    });
  }

  private applyPenaltyFold(playerId: string): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;

    player.strikes++;
    player.folded = true;

    this.logger.log(
      `Penalty fold applied to ${player.name} (strike ${player.strikes})`,
    );

    this.eventEmitter.emit("game.penaltyFold", {
      gameId: this.config.gameId,
      playerId,
      strikes: player.strikes,
    });

    if (player.strikes >= (this.config.maxStrikes || 3)) {
      this.logger.log(
        `Player ${player.name} disconnected after ${player.strikes} strikes`,
      );
      player.disconnected = true;
    }
  }

  private advanceToNextPlayer(): void {
    const activePlayers = this.getActivePlayers();
    if (activePlayers.length === 0) {
      this.endHand();
      return;
    }

    if (activePlayers.length === 1) {
      this.currentPlayerId = activePlayers[0].id;
    } else {
      const allPlayersInOrder = this.players.filter((p) => !p.disconnected);
      const currentIdx = allPlayersInOrder.findIndex(
        (p) => p.id === this.currentPlayerId,
      );

      let nextIdx = (currentIdx + 1) % allPlayersInOrder.length;
      let iterations = 0;
      while (iterations < allPlayersInOrder.length) {
        const candidate = allPlayersInOrder[nextIdx];
        if (!candidate.folded && !candidate.allIn && candidate.chips > 0) {
          this.currentPlayerId = candidate.id;
          break;
        }
        nextIdx = (nextIdx + 1) % allPlayersInOrder.length;
        iterations++;
      }

      if (iterations >= allPlayersInOrder.length) {
        this.currentPlayerId = activePlayers[0].id;
      }
    }

    this.eventEmitter.emit("game.turnChanged", {
      gameId: this.config.gameId,
      currentPlayerId: this.currentPlayerId,
    });
  }

  private endHand(): void {
    this.handInProgress = false;
    this.currentPlayerId = null;
    this.stage = "showdown";

    this.logger.log(`Hand ${this.handNumber} ended`);

    this.eventEmitter.emit("game.handEnded", {
      gameId: this.config.gameId,
      handNumber: this.handNumber,
    });
  }

  getActivePlayers(): Player[] {
    return this.players.filter(
      (p) => !p.disconnected && !p.folded && p.chips > 0,
    );
  }

  getPlayersWithChips(): Player[] {
    return this.players.filter((p) => !p.disconnected && p.chips > 0);
  }

  isPlayersTurn(playerId: string): boolean {
    return this.currentPlayerId === playerId;
  }

  getCurrentPlayerId(): string | null {
    return this.currentPlayerId;
  }

  setCurrentPlayer(playerId: string): void {
    this.currentPlayerId = playerId;
  }

  startHand(): void {
    this.handStartSnapshot = this.players.map((p) => ({
      id: p.id,
      chips: p.chips,
      folded: p.folded,
      allIn: p.allIn,
      currentBet: p.currentBet,
    }));

    this.handInProgress = true;
    this.handNumber++;
    this.stage = "pre-flop";
    this.pot = 0;
    this.currentBet = 0;
    this.communityCards = [];

    this.players.forEach((p) => {
      if (!p.disconnected && p.chips > 0) {
        p.folded = false;
        p.allIn = false;
        p.holeCards = [];
        p.currentBet = 0;
      }
    });

    this.logger.log(`Hand ${this.handNumber} started`);

    this.eventEmitter.emit("game.handStarted", {
      gameId: this.config.gameId,
      handNumber: this.handNumber,
    });
  }

  async validateAction(
    playerId: string,
    action: string,
    amount?: number,
  ): Promise<{ valid: boolean; error?: string }> {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) {
      return { valid: false, error: "Player not found" };
    }

    if (this.currentPlayerId !== playerId) {
      return { valid: false, error: "Not your turn" };
    }

    if (player.folded || player.allIn) {
      return { valid: false, error: "Player cannot act" };
    }

    const toCall = Math.max(0, this.currentBet - player.currentBet);

    return this.invariantChecker.validateAction({
      action,
      amount,
      playerChips: player.chips,
      toCall,
      minRaise: this.config.bigBlind,
      currentBet: this.currentBet,
      playerBet: player.currentBet,
    });
  }

  processAction(
    playerId: string,
    action: string,
    amount?: number,
  ): ActionResult {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) {
      return { valid: false, error: "Player not found", amountAdded: 0 };
    }

    if (this.currentPlayerId !== playerId) {
      this.logger.warn(`Out-of-turn action from ${player.name}: ${action}`);
      return { valid: false, error: "Not your turn", amountAdded: 0 };
    }

    const chipsBefore = player.chips;

    try {
      let amountAdded = 0;

      switch (action) {
        case "fold":
          player.folded = true;
          break;

        case "check":
          break;

        case "call": {
          const toCall = Math.min(
            this.currentBet - player.currentBet,
            player.chips,
          );
          player.chips -= toCall;
          player.currentBet += toCall;
          amountAdded = toCall;
          if (player.chips === 0) player.allIn = true;
          break;
        }

        case "bet":
        case "raise": {
          const raiseAmount = amount ?? 0;

          if (raiseAmount <= 0) {
            return {
              valid: false,
              error: "Raise amount must be positive",
              amountAdded: 0,
            };
          }

          const toCall = Math.max(0, this.currentBet - player.currentBet);

          if (
            raiseAmount < this.config.bigBlind &&
            player.chips > toCall + raiseAmount
          ) {
            return {
              valid: false,
              error: `Minimum raise is ${this.config.bigBlind}`,
              amountAdded: 0,
            };
          }

          const total = Math.min(toCall + raiseAmount, player.chips);
          player.chips -= total;
          player.currentBet += total;
          amountAdded = total;
          this.currentBet = player.currentBet;
          if (player.chips === 0) player.allIn = true;

          this.invariantChecker.assertNoShortAllInReopeningViolation(
            raiseAmount,
            this.config.bigBlind,
            player.allIn,
          );
          break;
        }

        case "all_in": {
          amountAdded = player.chips;
          player.currentBet += player.chips;
          if (player.currentBet > this.currentBet) {
            this.currentBet = player.currentBet;
          }
          player.chips = 0;
          player.allIn = true;
          break;
        }

        default:
          return {
            valid: false,
            error: `Unknown action: ${action}`,
            amountAdded: 0,
          };
      }

      this.pot += amountAdded;

      this.auditLog.log(
        "bet",
        playerId,
        amountAdded,
        chipsBefore,
        player.chips,
        this.handNumber,
        { action, amount },
      );

      this.invariantChecker.assertNonNegativeChips(player);

      this.assertChipConservation();

      this.eventEmitter.emit("game.actionProcessed", {
        gameId: this.config.gameId,
        playerId,
        action,
        amount: amountAdded,
      });

      const activePlayersInHand = this.getActivePlayers();
      if (activePlayersInHand.length <= 1) {
        if (activePlayersInHand.length === 1) {
          this.awardPot(activePlayersInHand[0].id, this.pot);
        }
        this.endHand();
      } else {
        this.advanceToNextPlayer();
      }

      return { valid: true, amountAdded };
    } catch (error) {
      player.chips = chipsBefore;
      throw error;
    }
  }

  awardPot(winnerId: string, amount: number): void {
    const winner = this.players.find((p) => p.id === winnerId);
    if (!winner) {
      throw new InvalidActionError("award_pot", "Winner not found", {
        winnerId,
      });
    }

    const chipsBefore = winner.chips;
    winner.chips += amount;
    this.pot -= amount;

    this.auditLog.log(
      "win",
      winnerId,
      amount,
      chipsBefore,
      winner.chips,
      this.handNumber,
    );

    this.invariantChecker.assertNonNegativeChips(winner);

    this.logger.log(`${winner.name} wins ${amount}`);
  }

  assertChipConservation(): void {
    const inStacks = this.players.reduce((sum, p) => sum + p.chips, 0);
    const total = inStacks + this.pot;

    if (total !== this.expectedTotalChips) {
      const error = new ChipConservationError(this.expectedTotalChips, total, {
        inStacks,
        inPot: this.pot,
        handNumber: this.handNumber,
        stage: this.stage,
        players: this.players.map((p) => ({
          id: p.id,
          name: p.name,
          chips: p.chips,
        })),
      });

      this.logger.error(`Chip conservation violated`, error);
      throw error;
    }
  }

  getState() {
    return {
      gameId: this.config.gameId,
      tableId: this.config.tableId,
      tournamentId: this.config.tournamentId,
      status: this.status,
      handNumber: this.handNumber,
      stage: this.stage,
      pot: this.pot,
      currentBet: this.currentBet,
      communityCards: this.communityCards,
      dealerIndex: this.dealerIndex,
      currentPlayerId: this.currentPlayerId,
      handInProgress: this.handInProgress,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        currentBet: p.currentBet,
        folded: p.folded,
        allIn: p.allIn,
        disconnected: p.disconnected,
        strikes: p.strikes,
      })),
      blinds: {
        small: this.config.smallBlind,
        big: this.config.bigBlind,
        ante: this.config.ante || 0,
      },
    };
  }

  getPrivateState(playerId: string) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return null;

    const toCall = Math.max(0, this.currentBet - player.currentBet);

    return {
      holeCards: player.holeCards,
      chips: player.chips,
      currentBet: player.currentBet,
      toCall,
      isYourTurn: this.currentPlayerId === playerId,
      validActions: this.getValidActions(player, toCall),
    };
  }

  private getValidActions(player: Player, toCall: number) {
    const actions: Array<{
      action: string;
      minAmount?: number;
      maxAmount?: number;
    }> = [];

    if (this.currentPlayerId !== player.id) {
      return actions;
    }

    if (!player.folded && !player.allIn) {
      actions.push({ action: "fold" });

      if (toCall === 0) {
        actions.push({ action: "check" });
      } else if (toCall <= player.chips) {
        actions.push({ action: "call" });
      }

      if (player.chips > toCall) {
        actions.push({
          action: "raise",
          minAmount: this.config.bigBlind,
          maxAmount: player.chips - toCall,
        });
      }

      if (player.chips > 0) {
        actions.push({ action: "all_in" });
      }
    }

    return actions;
  }

  getAuditLog() {
    return this.auditLog.getEntries();
  }

  getAuditLogForHand(handNumber: number) {
    return this.auditLog.getEntriesForHand(handNumber);
  }

  isRunning(): boolean {
    return this.running;
  }

  stop(): void {
    this.running = false;
    this.status = "finished";
  }

  /**
   * Rollback the current hand to its starting state.
   * Restores all player chips, resets folded/allIn status, and clears pot.
   * Used for hand cancellation due to errors or all players disconnecting.
   */
  rollbackHand(): void {
    if (this.handStartSnapshot.length === 0) {
      this.logger.warn("No hand snapshot to rollback to");
      return;
    }

    for (const snapshot of this.handStartSnapshot) {
      const player = this.players.find((p) => p.id === snapshot.id);
      if (player) {
        player.chips = snapshot.chips;
        player.folded = false;
        player.allIn = false;
        player.currentBet = 0;
        player.holeCards = [];
      }
    }

    this.pot = 0;
    this.currentBet = 0;
    this.communityCards = [];
    this.handInProgress = false;
    this.currentPlayerId = null;
    this.stage = "pre-flop";

    this.logger.log(`Hand ${this.handNumber} cancelled and rolled back`);

    this.eventEmitter.emit("game.handCancelled", {
      gameId: this.config.gameId,
      tableId: this.config.tableId,
      handNumber: this.handNumber,
    });
  }

  /**
   * Set the dealer index explicitly.
   */
  setDealerIndex(index: number): void {
    this.dealerIndex = index;
  }

  /**
   * Advance the dealer button to the next active player.
   * Skips disconnected players (dead button rule).
   */
  advanceDealer(): void {
    const activePlayers = this.players.filter(
      (p) => !p.disconnected && p.chips > 0,
    );
    if (activePlayers.length === 0) return;

    let nextIndex = (this.dealerIndex + 1) % this.players.length;
    let iterations = 0;

    while (iterations < this.players.length) {
      const candidate = this.players[nextIndex];
      if (!candidate.disconnected && candidate.chips > 0) {
        this.dealerIndex = nextIndex;
        break;
      }
      nextIndex = (nextIndex + 1) % this.players.length;
      iterations++;
    }
  }

  /**
   * Get the current dealer player.
   */
  getCurrentDealer(): Player | undefined {
    const activePlayers = this.players.filter(
      (p) => !p.disconnected && p.chips > 0,
    );
    if (activePlayers.length === 0) return undefined;

    let idx = this.dealerIndex % this.players.length;
    if (this.players[idx].disconnected || this.players[idx].chips === 0) {
      this.advanceDealer();
      idx = this.dealerIndex;
    }
    return this.players[idx];
  }

  /**
   * Get blind positions based on current dealer and active players.
   * Implements dead button rule: BB always advances, button may skip.
   * In heads-up, dealer is also small blind.
   */
  getBlindPositions(): BlindPositions {
    const activePlayers = this.players.filter(
      (p) => !p.disconnected && p.chips > 0,
    );

    if (activePlayers.length < 2) {
      return {
        dealer: "",
        smallBlind: "",
        bigBlind: "",
      };
    }

    const dealerPlayer = this.getCurrentDealer();
    if (!dealerPlayer) {
      return {
        dealer: "",
        smallBlind: "",
        bigBlind: "",
      };
    }

    const activeIndices: number[] = [];
    for (let i = 0; i < this.players.length; i++) {
      if (!this.players[i].disconnected && this.players[i].chips > 0) {
        activeIndices.push(i);
      }
    }

    const dealerActiveIdx = activeIndices.indexOf(this.dealerIndex);
    const numActive = activeIndices.length;

    if (numActive === 2) {
      const sbIndex = this.dealerIndex;
      const bbIndex = activeIndices[(dealerActiveIdx + 1) % numActive];

      return {
        dealer: dealerPlayer.id,
        smallBlind: this.players[sbIndex].id,
        bigBlind: this.players[bbIndex].id,
        dealerSmallBlind: dealerPlayer.id,
      };
    }

    const sbIndex = activeIndices[(dealerActiveIdx + 1) % numActive];
    const bbIndex = activeIndices[(dealerActiveIdx + 2) % numActive];

    return {
      dealer: dealerPlayer.id,
      smallBlind: this.players[sbIndex].id,
      bigBlind: this.players[bbIndex].id,
    };
  }
}
