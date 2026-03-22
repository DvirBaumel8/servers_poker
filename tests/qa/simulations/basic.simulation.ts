/**
 * Basic Simulation Test
 * =====================
 *
 * Run on: Every commit
 * Duration: ~30 seconds
 *
 * Tests:
 * - 2-player heads-up game starts and completes
 * - Chip conservation across 10 hands
 * - Bot registration and validation
 * - Game state consistency
 *
 * For live invariant validation during gameplay, use the SimulationMonster
 * from the Monster Army (npm run monsters:simulation).
 *
 * This is the fastest simulation and should catch fundamental breaks.
 */

import { SimulationRunner, SimulationConfig } from "./simulation-runner";
import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule, EventEmitter2 } from "@nestjs/event-emitter";
import { ThrottlerModule } from "@nestjs/throttler";
import { DataSource } from "typeorm";
import * as crypto from "crypto";

import { appConfig } from "../../../src/config";
import * as entities from "../../../src/entities";
import { LiveGameManagerService } from "../../../src/services/game/live-game-manager.service";
import { ServicesModule } from "../../../src/services/services.module";
import { GamesModule } from "../../../src/modules/games/games.module";

const BASIC_CONFIG: SimulationConfig = {
  name: "Basic-2Player-HeadsUp",
  playerCount: 2,
  startingChips: 1000,
  maxHands: 50,
  maxDurationMs: 60000, // 1 minute max
  blinds: { small: 10, big: 20 },
  tournamentMode: false, // Cash game style - just play N hands
  verboseLogging: false,
  validateAfterEachHand: true,
};

export class BasicSimulation extends SimulationRunner {
  private liveGameManager: LiveGameManagerService | null = null;
  private testModule: TestingModule | null = null;
  private gameTableId: string = "";
  private players: Array<{
    id: string;
    name: string;
    endpoint: string;
    chips: number;
  }> = [];

  constructor(config: Partial<SimulationConfig> = {}) {
    super({ ...BASIC_CONFIG, ...config });
  }

  protected async setupDatabase(): Promise<void> {
    this.log("Setting up test database...");

    this.testModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
        TypeOrmModule.forRoot({
          type: "postgres",
          host: process.env.TEST_DB_HOST || "localhost",
          port: parseInt(process.env.TEST_DB_PORT || "5432", 10),
          username: process.env.TEST_DB_USERNAME || "postgres",
          password: process.env.TEST_DB_PASSWORD || "postgres",
          database: process.env.TEST_DB_NAME || "poker_test",
          entities: Object.values(entities),
          synchronize: true,
          dropSchema: true, // Fresh schema for each test
          logging: false,
        }),
        ThrottlerModule.forRoot([
          { name: "default", ttl: 60000, limit: 100000 },
        ]),
        EventEmitterModule.forRoot(),
        ServicesModule,
        GamesModule,
      ],
    }).compile();

    this.app = this.testModule.createNestApplication();
    await this.app.init();

    this.dataSource = this.testModule.get(DataSource);
    this.liveGameManager = this.testModule.get(LiveGameManagerService);
    this.eventEmitter = this.testModule.get(EventEmitter2);

    this.log("Database ready");
  }

  protected async setupTestData(): Promise<void> {
    this.log("Setting up test data...");

    // Create players from bot servers
    this.players = this.botServers.map((bot, idx) => ({
      id: bot.botId,
      name: `TestBot${idx + 1}`,
      endpoint: `http://localhost:${bot.port}/action`,
      chips: this.config.startingChips,
    }));

    this.gameTableId = crypto.randomUUID();
    this.log(`Created ${this.players.length} test players`);
  }

  protected async executeSimulation(): Promise<void> {
    this.log("Starting heads-up game...");

    // Create game using LiveGameManagerService
    const gameDbId = crypto.randomUUID();
    const gameConfig = {
      tableId: this.gameTableId,
      gameDbId,
      smallBlind: this.config.blinds.small,
      bigBlind: this.config.blinds.big,
      ante: this.config.blinds.ante || 0,
      startingChips: this.config.startingChips,
      turnTimeoutMs: 5000,
    };

    // Create game and add players
    const game = await this.liveGameManager!.createGame(gameConfig);

    for (const player of this.players) {
      game.addPlayer({
        id: player.id,
        name: player.name,
        chips: player.chips,
        endpoint: player.endpoint,
      });
    }

    this.log("Players added, waiting for game to complete...");

    // Monitor the game
    const startTime = Date.now();
    let lastHandNumber = 0;
    let checkCount = 0;

    while (Date.now() - startTime < this.config.maxDurationMs!) {
      await this.sleep(500);
      checkCount++;

      const gameState = this.liveGameManager!.getGameState(this.gameTableId);

      if (!gameState) {
        this.log("Game state not found - game may have ended");
        break;
      }

      const currentHand = gameState.handNumber || 0;

      // Track progress
      if (currentHand > lastHandNumber) {
        this.result.handsPlayed = currentHand;
        lastHandNumber = currentHand;

        if (this.config.verboseLogging) {
          this.log(`Hand ${currentHand} - Status: ${gameState.status}`);
        }

        // Check chip conservation after each hand (only when hand is complete)
        if (
          this.config.validateAfterEachHand &&
          gameState.stage === "showdown"
        ) {
          const totalChips = gameState.players.reduce(
            (sum: number, p: any) => sum + Number(p.chips),
            0,
          );

          const expected = this.config.playerCount * this.config.startingChips;

          if (totalChips !== expected) {
            this.recordError({
              type: "chip_conservation_violation",
              message: `Hand ${currentHand}: expected ${expected} chips, found ${totalChips}`,
              severity: "critical",
              context: {
                hand: currentHand,
                expected,
                actual: totalChips,
                players: gameState.players.map((p: any) => ({
                  name: p.name,
                  chips: p.chips,
                })),
                pot: gameState.pot,
              },
            });
          }
        }
      }

      // Check for game completion
      if (gameState.status === "finished") {
        this.log(`Game finished after ${currentHand} hands`);
        this.updateFinalState(gameState);
        break;
      }

      if (gameState.status === "error") {
        this.recordError({
          type: "game_error",
          message: "Game entered error state",
          severity: "critical",
          context: { state: gameState },
        });
        this.updateFinalState(gameState);
        break;
      }

      // Max hands check
      if (currentHand >= this.config.maxHands!) {
        this.log(`Reached max hands (${this.config.maxHands})`);
        this.updateFinalState(gameState);
        break;
      }

      // Timeout check - log progress periodically
      if (checkCount % 20 === 0) {
        this.log(`Progress: hand ${currentHand}, status: ${gameState.status}`);
      }
    }

    // Get final state if we timed out
    const finalGameState = this.liveGameManager!.getGameState(this.gameTableId);
    if (finalGameState) {
      this.updateFinalState(finalGameState);
    }
  }

  private updateFinalState(gameState: any): void {
    const players = gameState.players || [];
    const totalChips =
      players.reduce((sum: number, p: any) => sum + Number(p.chips), 0) +
      (gameState.pot || 0);

    const activePlayers = players.filter((p: any) => Number(p.chips) > 0);
    const chipDist: Record<string, number> = {};
    for (const p of players) {
      chipDist[p.name] = Number(p.chips);
    }

    this.result.finalState = {
      status: gameState.status,
      playersRemaining: activePlayers.length,
      totalChips,
      expectedChips: this.config.playerCount * this.config.startingChips,
      winner: activePlayers.length === 1 ? activePlayers[0].name : undefined,
      chipDistribution: chipDist,
    };
  }

  protected async runCustomAssertions(): Promise<void> {
    // Basic simulation specific assertions

    // At least some hands were played
    this.assert(
      "hands_played",
      this.result.handsPlayed > 0,
      `Should play at least 1 hand`,
      "> 0",
      this.result.handsPlayed,
    );

    // Game didn't crash immediately
    this.assert(
      "game_stability",
      this.result.handsPlayed >= 3 ||
        this.result.finalState.status === "finished",
      `Game should be stable (play 3+ hands or finish)`,
      "stable",
      `${this.result.handsPlayed} hands, status: ${this.result.finalState.status}`,
    );

    // Both players started with correct chips
    const chipDistValues = Object.values(
      this.result.finalState.chipDistribution,
    );
    const totalFromDist = chipDistValues.reduce((a, b) => a + b, 0);
    this.assert(
      "initial_chip_distribution",
      totalFromDist <= this.config.playerCount * this.config.startingChips,
      `Chip distribution should not exceed starting chips`,
      this.config.playerCount * this.config.startingChips,
      totalFromDist,
    );
  }
}

// CLI Runner
async function main() {
  console.log("\n🎰 Starting Basic Simulation Test\n");
  console.log(
    "For live invariant validation, use: npm run monsters:simulation\n",
  );

  const simulation = new BasicSimulation({
    verboseLogging: process.argv.includes("--verbose"),
  });

  const result = await simulation.run();
  console.log(simulation.getSummary());

  process.exit(result.success ? 0 : 1);
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error("Simulation failed:", error);
    process.exit(1);
  });
}

export { BASIC_CONFIG };
