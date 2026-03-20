import { Logger } from "@nestjs/common";
import { EventEmitter } from "events";
import { ChipInvariantChecker } from "../game/invariants";

export interface SimulationConfig {
  numTournaments?: number;
  numCashGames?: number;
  handsPerCashGame?: number;
  botsPerTable?: number;
  startingChips?: number;
  blinds?: { small: number; big: number; ante?: number };
  seed?: number;
  deterministicMode?: boolean;
  verboseLogging?: boolean;
  stopOnError?: boolean;
  validateChipsAfterEachHand?: boolean;
}

export interface BotPersonality {
  id: string;
  name: string;
  type:
    | "caller"
    | "folder"
    | "maniac"
    | "random"
    | "smart"
    | "crasher"
    | "slow";
  vpip: number;
  pfr: number;
  aggression: number;
  timeoutProbability: number;
  errorProbability: number;
}

export interface SimulationStats {
  totalHands: number;
  totalTournaments: number;
  totalCashGames: number;
  chipConservationViolations: number;
  botTimeouts: number;
  botErrors: number;
  invalidActions: number;
  splitPots: number;
  allInHands: number;
  handsByStage: Record<string, number>;
  winsByBot: Record<string, number>;
  profitByBot: Record<string, number>;
  averageHandDurationMs: number;
  anomalies: SimulationAnomaly[];
}

export interface SimulationAnomaly {
  type: string;
  severity: "warning" | "error" | "critical";
  message: string;
  handNumber?: number;
  context?: Record<string, any>;
  timestamp: Date;
}

class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

export class SimulationEngine extends EventEmitter {
  private readonly logger = new Logger(SimulationEngine.name);
  private readonly invariantChecker = new ChipInvariantChecker();
  private config: SimulationConfig;
  private stats: SimulationStats;
  private rng: SeededRandom;
  private running = false;
  private paused = false;

  constructor(config: SimulationConfig = {}) {
    super();
    this.config = {
      numTournaments: 1,
      numCashGames: 0,
      handsPerCashGame: 100,
      botsPerTable: 6,
      startingChips: 1000,
      blinds: { small: 10, big: 20, ante: 0 },
      seed: Date.now(),
      deterministicMode: false,
      verboseLogging: false,
      stopOnError: false,
      validateChipsAfterEachHand: true,
      ...config,
    };

    this.rng = new SeededRandom(this.config.seed!);
    this.stats = this.initStats();
  }

  private initStats(): SimulationStats {
    return {
      totalHands: 0,
      totalTournaments: 0,
      totalCashGames: 0,
      chipConservationViolations: 0,
      botTimeouts: 0,
      botErrors: 0,
      invalidActions: 0,
      splitPots: 0,
      allInHands: 0,
      handsByStage: {
        preflop: 0,
        flop: 0,
        turn: 0,
        river: 0,
        showdown: 0,
      },
      winsByBot: {},
      profitByBot: {},
      averageHandDurationMs: 0,
      anomalies: [],
    };
  }

  createBots(count: number): BotPersonality[] {
    const types: BotPersonality["type"][] = [
      "caller",
      "folder",
      "maniac",
      "random",
      "smart",
      "crasher",
      "slow",
    ];

    return Array.from({ length: count }, (_, i) => {
      const type = types[i % types.length];
      return this.createBotPersonality(`bot_${i + 1}`, type);
    });
  }

  createBotPersonality(
    id: string,
    type: BotPersonality["type"],
  ): BotPersonality {
    const personalities: Record<
      BotPersonality["type"],
      Partial<BotPersonality>
    > = {
      caller: {
        vpip: 0.6,
        pfr: 0.1,
        aggression: 0.3,
        timeoutProbability: 0.01,
        errorProbability: 0.01,
      },
      folder: {
        vpip: 0.15,
        pfr: 0.1,
        aggression: 0.2,
        timeoutProbability: 0.01,
        errorProbability: 0.01,
      },
      maniac: {
        vpip: 0.9,
        pfr: 0.7,
        aggression: 0.9,
        timeoutProbability: 0.02,
        errorProbability: 0.02,
      },
      random: {
        vpip: 0.5,
        pfr: 0.3,
        aggression: 0.5,
        timeoutProbability: 0.02,
        errorProbability: 0.03,
      },
      smart: {
        vpip: 0.25,
        pfr: 0.2,
        aggression: 0.6,
        timeoutProbability: 0.005,
        errorProbability: 0.005,
      },
      crasher: {
        vpip: 0.5,
        pfr: 0.3,
        aggression: 0.5,
        timeoutProbability: 0.1,
        errorProbability: 0.2,
      },
      slow: {
        vpip: 0.4,
        pfr: 0.2,
        aggression: 0.4,
        timeoutProbability: 0.3,
        errorProbability: 0.05,
      },
    };

    return {
      id,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} Bot ${id}`,
      type,
      ...personalities[type],
    } as BotPersonality;
  }

  async getBotAction(
    bot: BotPersonality,
    state: SimulationGameState,
  ): Promise<{ type: string; amount?: number }> {
    if (this.rng.next() < bot.timeoutProbability) {
      this.stats.botTimeouts++;
      throw new Error("Timeout");
    }

    if (this.rng.next() < bot.errorProbability) {
      this.stats.botErrors++;
      throw new Error("Bot error");
    }

    const canCheck = state.toCall === 0;
    const _stackRatio = state.playerChips / state.pot || 1;

    switch (bot.type) {
      case "folder":
        if (canCheck) return { type: "check" };
        if (this.rng.next() < 0.7) return { type: "fold" };
        return { type: "call" };

      case "caller":
        if (canCheck) return { type: "check" };
        return { type: "call" };

      case "maniac":
        if (this.rng.next() < 0.5 && state.playerChips > state.toCall) {
          const raiseAmount = this.rng.nextInt(
            state.minRaise,
            Math.min(state.playerChips - state.toCall, state.pot * 2),
          );
          return { type: "raise", amount: raiseAmount };
        }
        if (canCheck) return { type: "check" };
        return { type: "call" };

      case "smart":
        if (state.handStrength > 0.8) {
          const raiseAmount = this.rng.nextInt(
            state.minRaise,
            Math.min(state.playerChips, state.pot),
          );
          return { type: "raise", amount: raiseAmount };
        }
        if (state.handStrength > 0.5 || canCheck) {
          return canCheck ? { type: "check" } : { type: "call" };
        }
        if (state.toCall < state.pot * 0.3) return { type: "call" };
        return { type: "fold" };

      case "crasher":
        if (this.rng.next() < 0.3) {
          return { type: "invalid_action" };
        }
        return this.rng.next() < 0.5
          ? { type: "fold" }
          : canCheck
            ? { type: "check" }
            : { type: "call" };

      case "slow":
        if (canCheck) return { type: "check" };
        if (state.toCall < state.playerChips * 0.1) return { type: "call" };
        return { type: "fold" };

      default:
        const roll = this.rng.next();
        if (roll < 0.2) return { type: "fold" };
        if (roll < 0.5) return canCheck ? { type: "check" } : { type: "call" };
        if (roll < 0.8 && canCheck) return { type: "check" };
        if (state.playerChips > state.toCall) {
          return {
            type: "raise",
            amount: this.rng.nextInt(
              state.minRaise,
              state.playerChips - state.toCall,
            ),
          };
        }
        return { type: "call" };
    }
  }

  async runSimulation(): Promise<SimulationStats> {
    this.running = true;
    this.stats = this.initStats();

    this.logger.log(
      `Starting simulation: ${this.config.numTournaments} tournaments, ` +
        `${this.config.numCashGames} cash games, seed: ${this.config.seed}`,
    );

    try {
      for (let i = 0; i < this.config.numTournaments!; i++) {
        if (!this.running) break;
        while (this.paused) await this.sleep(100);
        await this.runTournament(i + 1);
      }

      for (let i = 0; i < this.config.numCashGames!; i++) {
        if (!this.running) break;
        while (this.paused) await this.sleep(100);
        await this.runCashGame(i + 1);
      }
    } catch (error) {
      this.recordAnomaly({
        type: "simulation_crash",
        severity: "critical",
        message: `Simulation crashed: ${error}`,
        context: { error: String(error) },
      });
    }

    this.running = false;
    this.emit("complete", this.stats);
    return this.stats;
  }

  async runTournament(tournamentNum: number): Promise<void> {
    const bots = this.createBots(this.config.botsPerTable!);
    const players = bots.map((bot) => ({
      bot,
      chips: this.config.startingChips!,
      folded: false,
      allIn: false,
      busted: false,
    }));

    const expectedTotal = players.length * this.config.startingChips!;
    let handNum = 0;
    let dealerIndex = 0;
    let handsAtLevel = 0;
    const blinds = { ...this.config.blinds! };

    this.logger.log(
      `Tournament ${tournamentNum} started with ${players.length} players`,
    );

    while (players.filter((p) => !p.busted).length > 1 && this.running) {
      handNum++;
      handsAtLevel++;

      if (handsAtLevel >= 10) {
        blinds.small = Math.floor(blinds.small * 1.5);
        blinds.big = Math.floor(blinds.big * 1.5);
        blinds.ante =
          Math.floor((blinds.ante || 0) * 1.5) ||
          Math.floor(blinds.small * 0.1);
        handsAtLevel = 0;
      }

      await this.playHand(players, dealerIndex, blinds, expectedTotal, handNum);

      for (const player of players) {
        if (player.chips <= 0 && !player.busted) {
          player.busted = true;
          const position = players.filter((p) => !p.busted).length + 1;
          if (this.config.verboseLogging) {
            this.logger.debug(
              `${player.bot.name} busted in position ${position}`,
            );
          }
        }
      }

      dealerIndex = (dealerIndex + 1) % players.length;
      while (players[dealerIndex].busted) {
        dealerIndex = (dealerIndex + 1) % players.length;
      }
    }

    const winner = players.find((p) => !p.busted);
    if (winner) {
      this.stats.winsByBot[winner.bot.id] =
        (this.stats.winsByBot[winner.bot.id] || 0) + 1;
    }

    this.stats.totalTournaments++;
    this.logger.log(
      `Tournament ${tournamentNum} completed: ${handNum} hands, winner: ${winner?.bot.name}`,
    );
  }

  async runCashGame(_gameNum: number): Promise<void> {
    const bots = this.createBots(this.config.botsPerTable!);
    const players = bots.map((bot) => ({
      bot,
      chips: this.config.startingChips!,
      folded: false,
      allIn: false,
      busted: false,
    }));

    const expectedTotal = players.length * this.config.startingChips!;
    let dealerIndex = 0;

    for (let hand = 1; hand <= this.config.handsPerCashGame!; hand++) {
      if (!this.running) break;

      await this.playHand(
        players,
        dealerIndex,
        this.config.blinds!,
        expectedTotal,
        hand,
      );

      for (const player of players) {
        if (player.chips <= 0) {
          player.chips = this.config.startingChips!;
        }
      }

      dealerIndex = (dealerIndex + 1) % players.length;
    }

    for (const player of players) {
      const profit = player.chips - this.config.startingChips!;
      this.stats.profitByBot[player.bot.id] =
        (this.stats.profitByBot[player.bot.id] || 0) + profit;
    }

    this.stats.totalCashGames++;
  }

  async playHand(
    players: SimulationPlayer[],
    dealerIndex: number,
    blinds: { small: number; big: number; ante?: number },
    expectedTotal: number,
    handNum: number,
  ): Promise<void> {
    const startTime = Date.now();
    const activePlayers = players.filter((p) => !p.busted && p.chips > 0);

    if (activePlayers.length < 2) return;

    for (const p of activePlayers) {
      p.folded = false;
      p.allIn = false;
    }

    let pot = 0;
    const bets: Record<string, number> = {};

    if (blinds.ante) {
      for (const p of activePlayers) {
        const ante = Math.min(blinds.ante, p.chips);
        p.chips -= ante;
        pot += ante;
        if (p.chips === 0) p.allIn = true;
      }
    }

    const sbIndex = (dealerIndex + 1) % activePlayers.length;
    const bbIndex = (dealerIndex + 2) % activePlayers.length;
    const sb = activePlayers[sbIndex];
    const bb = activePlayers[bbIndex];

    const sbAmount = Math.min(blinds.small, sb.chips);
    const bbAmount = Math.min(blinds.big, bb.chips);

    sb.chips -= sbAmount;
    bb.chips -= bbAmount;
    pot += sbAmount + bbAmount;
    bets[sb.bot.id] = sbAmount;
    bets[bb.bot.id] = bbAmount;

    if (sb.chips === 0) sb.allIn = true;
    if (bb.chips === 0) bb.allIn = true;

    let _stage = "preflop";
    let endedAtStage = "preflop";
    const stages = ["preflop", "flop", "turn", "river"];

    for (const currentStage of stages) {
      _stage = currentStage;

      const stillActive = activePlayers.filter((p) => !p.folded && !p.allIn);
      if (stillActive.length <= 1) {
        endedAtStage = currentStage;
        break;
      }

      let currentBet = currentStage === "preflop" ? blinds.big : 0;
      const acted = new Set<string>();

      let currentIndex =
        currentStage === "preflop"
          ? (bbIndex + 1) % activePlayers.length
          : (dealerIndex + 1) % activePlayers.length;

      let iterations = 0;
      const maxIterations = activePlayers.length * 4;

      while (iterations++ < maxIterations) {
        const player = activePlayers[currentIndex];

        if (player.folded || player.allIn) {
          currentIndex = (currentIndex + 1) % activePlayers.length;
          continue;
        }

        const playersWhoCanAct = activePlayers.filter(
          (p) => !p.folded && !p.allIn && p.chips > 0,
        );

        if (playersWhoCanAct.length === 0) break;

        const allActed = playersWhoCanAct.every((p) => {
          const playerBet = bets[p.bot.id] || 0;
          return acted.has(p.bot.id) && playerBet >= currentBet;
        });

        if (allActed) break;

        const playerBet = bets[player.bot.id] || 0;
        const toCall = currentBet - playerBet;

        const state: SimulationGameState = {
          stage: currentStage,
          pot,
          toCall,
          minRaise: blinds.big,
          playerChips: player.chips,
          handStrength: this.rng.next(),
        };

        try {
          const action = await this.getBotAction(player.bot, state);

          if (action.type === "fold") {
            player.folded = true;
          } else if (action.type === "check") {
            if (toCall > 0) {
              this.stats.invalidActions++;
              player.folded = true;
            }
          } else if (action.type === "call") {
            const callAmount = Math.min(toCall, player.chips);
            player.chips -= callAmount;
            pot += callAmount;
            bets[player.bot.id] = (bets[player.bot.id] || 0) + callAmount;
            if (player.chips === 0) player.allIn = true;
          } else if (action.type === "raise" && action.amount) {
            const total = Math.min(toCall + action.amount, player.chips);
            player.chips -= total;
            pot += total;
            bets[player.bot.id] = (bets[player.bot.id] || 0) + total;
            currentBet = bets[player.bot.id];
            if (player.chips === 0) player.allIn = true;
            acted.clear();
          } else if (action.type === "invalid_action") {
            this.stats.invalidActions++;
            player.folded = true;
          }

          acted.add(player.bot.id);
        } catch (error) {
          player.folded = true;
          acted.add(player.bot.id);
        }

        currentIndex = (currentIndex + 1) % activePlayers.length;
      }

      endedAtStage = currentStage;

      for (const p of activePlayers) {
        bets[p.bot.id] = 0;
      }
    }

    const stillActive = activePlayers.filter((p) => !p.folded);
    const isAllIn = activePlayers.some((p) => p.allIn);

    if (isAllIn) {
      this.stats.allInHands++;
    }

    if (stillActive.length === 1) {
      stillActive[0].chips += pot;
    } else if (stillActive.length > 1) {
      const winnerCount = this.rng.nextInt(1, Math.min(2, stillActive.length));
      const share = Math.floor(pot / winnerCount);
      const remainder = pot - share * winnerCount;

      for (let i = 0; i < winnerCount; i++) {
        stillActive[i].chips += share + (i === 0 ? remainder : 0);
      }

      if (winnerCount > 1) {
        this.stats.splitPots++;
      }

      endedAtStage = "showdown";
    }

    this.stats.handsByStage[endedAtStage]++;
    this.stats.totalHands++;

    if (this.config.validateChipsAfterEachHand) {
      const currentTotal = players.reduce((sum, p) => sum + p.chips, 0);
      if (currentTotal !== expectedTotal) {
        this.stats.chipConservationViolations++;
        this.recordAnomaly({
          type: "chip_conservation",
          severity: "critical",
          message: `Chip conservation violated: expected ${expectedTotal}, got ${currentTotal}`,
          handNumber: handNum,
          context: {
            expected: expectedTotal,
            actual: currentTotal,
            difference: currentTotal - expectedTotal,
          },
        });

        if (this.config.stopOnError) {
          this.stop();
        }
      }
    }

    const duration = Date.now() - startTime;
    this.stats.averageHandDurationMs =
      (this.stats.averageHandDurationMs * (this.stats.totalHands - 1) +
        duration) /
      this.stats.totalHands;
  }

  recordAnomaly(anomaly: Omit<SimulationAnomaly, "timestamp">): void {
    const fullAnomaly: SimulationAnomaly = {
      ...anomaly,
      timestamp: new Date(),
    };
    this.stats.anomalies.push(fullAnomaly);
    this.emit("anomaly", fullAnomaly);

    if (anomaly.severity === "critical") {
      this.logger.error(`CRITICAL: ${anomaly.message}`);
    } else if (anomaly.severity === "error") {
      this.logger.warn(`ERROR: ${anomaly.message}`);
    }
  }

  stop(): void {
    this.running = false;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  getStats(): SimulationStats {
    return { ...this.stats };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

interface SimulationPlayer {
  bot: BotPersonality;
  chips: number;
  folded: boolean;
  allIn: boolean;
  busted: boolean;
}

interface SimulationGameState {
  stage: string;
  pot: number;
  toCall: number;
  minRaise: number;
  playerChips: number;
  handStrength: number;
}
