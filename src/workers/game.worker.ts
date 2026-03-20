/**
 * Game Worker Thread
 * ==================
 * Runs a single poker game in an isolated worker thread.
 * Communicates with main thread via message passing.
 */

import { parentPort, workerData } from "worker_threads";
import {
  WorkerCommand,
  WorkerEvent,
  WorkerInitData,
  WorkerGameState,
  WorkerPlayerState,
  WinnerInfo,
  PlayerConfig,
  isWorkerCommand,
} from "./messages";
import { createDeck, shuffle, cardToString } from "../deck";
import { determineWinners, bestHand } from "../handEvaluator";
import { PotManager, BettingRound } from "../betting";

// ============================================================================
// Worker Logger (sends logs to main thread)
// ============================================================================

class WorkerLogger {
  constructor(private tableId: string) {}

  private send(level: "debug" | "info" | "warn" | "error", message: string) {
    postEvent({ type: "LOG", tableId: this.tableId, level, message });
  }

  debug(message: string) {
    this.send("debug", message);
  }
  log(message: string) {
    this.send("info", message);
  }
  warn(message: string) {
    this.send("warn", message);
  }
  error(message: string) {
    this.send("error", message);
  }
}

// ============================================================================
// HTTP Client for Bot Calls
// ============================================================================

interface BotResponse {
  type: "fold" | "check" | "call" | "raise" | "bet";
  amount?: number;
}

async function callBot(
  endpoint: string,
  payload: unknown,
  timeoutMs: number,
): Promise<{ success: boolean; response?: BotResponse; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { success: true, response: data as BotResponse };
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      return { success: false, error: "Timeout" };
    }
    return { success: false, error: err.message };
  }
}

// ============================================================================
// Event Sending Helper
// ============================================================================

function postEvent(event: WorkerEvent) {
  if (parentPort) {
    parentPort.postMessage(event);
  }
}

// ============================================================================
// Game Player Interface
// ============================================================================

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

// ============================================================================
// Position Names
// ============================================================================

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

// ============================================================================
// Worker Game Instance
// ============================================================================

class WorkerGameInstance {
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
  private logger: WorkerLogger;

  constructor(config: {
    tableId: string;
    gameId: string;
    tournamentId?: string;
    smallBlind?: number;
    bigBlind?: number;
    ante?: number;
    startingChips?: number;
    turnTimeoutMs?: number;
  }) {
    this.tableId = config.tableId;
    this.gameId = config.gameId;
    this.tournamentId = config.tournamentId;
    this.smallBlind = config.smallBlind ?? 10;
    this.bigBlind = config.bigBlind ?? 20;
    this.ante = config.ante ?? 0;
    this.startingChips = config.startingChips ?? 1000;
    this.turnTimeoutMs = config.turnTimeoutMs ?? 10000;
    this.logger = new WorkerLogger(this.tableId);
  }

  addPlayer(player: PlayerConfig): void {
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
    postEvent({
      type: "PLAYER_JOINED",
      tableId: this.tableId,
      playerId: player.id,
      playerName: player.name,
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
            this.logger.error(`Game loop error: ${e.message}`);
            postEvent({
              type: "ERROR",
              tableId: this.tableId,
              error: e.message,
              fatal: true,
            });
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
    postEvent({
      type: "PLAYER_LEFT",
      tableId: this.tableId,
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
        postEvent({
          type: "GAME_FINISHED",
          tableId: this.tableId,
          winnerId: winner?.id ?? null,
          winnerName: winner?.name ?? null,
        });
        break;
      }

      try {
        await this.playHand();
        this.assertChipConservation();
      } catch (e: any) {
        this.logger.error(`Hand ${this.handNumber} crashed — stopping game`);
        this.running = false;
        this.status = "error";
        this.emitStateUpdate();
        postEvent({
          type: "ERROR",
          tableId: this.tableId,
          error: e.message,
          fatal: true,
        });
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

    const dealerName = this.players[this.dealerIndex].name;
    this.logEvent({
      message: `Hand #${this.handNumber} started. Dealer: ${dealerName}`,
    });

    postEvent({
      type: "HAND_STARTED",
      tableId: this.tableId,
      handNumber: this.handNumber,
      dealerName,
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
      const result = await callBot(
        player.endpoint,
        botPayload,
        this.turnTimeoutMs,
      );

      if (!result.success) {
        player.strikes++;
        this.logEvent({
          message: `${player.name} ${result.error} — strike ${player.strikes}/${MAX_STRIKES}`,
        });

        if (player.strikes >= MAX_STRIKES) {
          player.disconnected = true;
          this.logEvent({
            message: `${player.name} disconnected after ${player.strikes} strikes`,
          });
          postEvent({
            type: "PLAYER_LEFT",
            tableId: this.tableId,
            playerId: player.id,
          });
        }

        return this.getFallbackAction(botPayload);
      }

      player.strikes = 0;
      return result.response;
    } catch (e: any) {
      player.strikes++;
      this.logEvent({
        message: `${player.name} errored (${e.message}) — strike ${player.strikes}/${MAX_STRIKES}`,
      });

      if (player.strikes >= MAX_STRIKES) {
        player.disconnected = true;
        postEvent({
          type: "PLAYER_LEFT",
          tableId: this.tableId,
          playerId: player.id,
        });
      }

      return this.getFallbackAction(botPayload);
    }
  }

  private getFallbackAction(payload: any): any {
    if (payload.action.canCheck) {
      return { type: "check" };
    }
    return { type: "fold" };
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

    const winners: WinnerInfo[] = [
      {
        playerId: winner.id,
        playerName: winner.name,
        amount: total,
      },
    ];

    postEvent({
      type: "HAND_COMPLETE",
      tableId: this.tableId,
      handNumber: this.handNumber,
      winners,
      atShowdown: false,
    });
  }

  private showdown(): void {
    this.stage = "showdown";
    const active = this.activePlayers();
    this.potManager!.calculatePots(this.players);
    const results: WinnerInfo[] = [];

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
        results.push({
          playerId: w.playerId,
          playerName: player.name,
          amount,
          hand: w.hand,
        });
        this.logEvent({
          message: `${player.name} wins ${amount} with ${w.hand.name}`,
        });
      });
    }

    this.potManager!.pots = [{ amount: 0, eligiblePlayerIds: [] }];
    this.emitStateUpdate();

    postEvent({
      type: "HAND_COMPLETE",
      tableId: this.tableId,
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

  getPublicState(): WorkerGameState {
    const positions = this.status === "running" ? this.computePositions() : {};
    const playerStates: WorkerPlayerState[] = this.players.map((p) => ({
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
        this.stage === "showdown"
          ? p.holeCards.map(cardToString)
          : p.holeCards.map(() => "??"),
    }));

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
      players: playerStates,
      log: this.log.slice(-20),
    };
  }

  updateBlinds(smallBlind: number, bigBlind: number, ante?: number): void {
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;
    if (ante !== undefined) {
      this.ante = ante;
    }
    this.logger.log(
      `Blinds updated: ${smallBlind}/${bigBlind}${ante ? ` ante ${ante}` : ""}`,
    );
  }

  stop(): void {
    this.running = false;
    this.logger.log("Game stopped by command");
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
    postEvent({
      type: "STATE_UPDATE",
      tableId: this.tableId,
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
}

// ============================================================================
// Worker Entry Point
// ============================================================================

let gameInstance: WorkerGameInstance | null = null;

function handleCommand(command: WorkerCommand): void {
  if (!gameInstance) {
    postEvent({
      type: "ERROR",
      tableId: "unknown",
      error: "Game instance not initialized",
      fatal: true,
    });
    return;
  }

  switch (command.type) {
    case "ADD_PLAYER":
      try {
        gameInstance.addPlayer(command.player);
      } catch (e: any) {
        postEvent({
          type: "ERROR",
          tableId: gameInstance.tableId,
          error: e.message,
          fatal: false,
        });
      }
      break;

    case "REMOVE_PLAYER":
      gameInstance.removePlayer(command.playerId);
      break;

    case "STOP":
      gameInstance.stop();
      break;

    case "GET_STATE":
      postEvent({
        type: "STATE_UPDATE",
        tableId: gameInstance.tableId,
        state: gameInstance.getPublicState(),
      });
      break;

    case "UPDATE_BLINDS":
      gameInstance.updateBlinds(
        command.smallBlind,
        command.bigBlind,
        command.ante,
      );
      break;
  }
}

function initialize(): void {
  const initData = workerData as WorkerInitData;

  if (!initData || !initData.gameConfig) {
    postEvent({
      type: "ERROR",
      tableId: "unknown",
      error: "No game configuration provided",
      fatal: true,
    });
    process.exit(1);
  }

  const config = initData.gameConfig;

  gameInstance = new WorkerGameInstance({
    tableId: config.tableId,
    gameId: config.gameDbId,
    tournamentId: config.tournamentId,
    smallBlind: config.smallBlind,
    bigBlind: config.bigBlind,
    ante: config.ante,
    startingChips: config.startingChips,
    turnTimeoutMs: config.turnTimeoutMs,
  });

  // Add initial players if any
  if (initData.players) {
    for (const player of initData.players) {
      try {
        gameInstance.addPlayer(player);
      } catch (e: any) {
        postEvent({
          type: "ERROR",
          tableId: config.tableId,
          error: `Failed to add initial player: ${e.message}`,
          fatal: false,
        });
      }
    }
  }

  // Signal that worker is ready
  postEvent({ type: "READY", tableId: config.tableId });
}

// Set up message handler
if (parentPort) {
  parentPort.on("message", (msg: unknown) => {
    if (isWorkerCommand(msg)) {
      handleCommand(msg);
    }
  });
}

// Initialize the game
initialize();
