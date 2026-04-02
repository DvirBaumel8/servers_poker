import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { runSimulatedGame } from "../../testing-utilities/game-simulator";
import { CoverageTracker } from "../../testing-utilities/coverage-tracker";
import { writeBugReportsWithTracking } from "../../testing-utilities/bug-report-writer";
import { LiveGameManagerService } from "../../services/game/live-game-manager.service";
import { GamesService } from "../games/games.service";
import { TablesService } from "../games/tables.service";
import { AuthService } from "../auth/auth.service";
import { UserRepository } from "../../repositories/user.repository";
import { BotRepository } from "../../repositories/bot.repository";
import type { BugReport } from "../../testing-utilities/validators";
import type { CoverageData } from "../../testing-utilities/game-simulator";

export interface RunSimulationDto {
  gameCount: number;
  botCount: number;
  startingChips?: number;
  smallBlind?: number;
  bigBlind?: number;
}

export interface SimulationSummary {
  totalGames: number;
  successful: number;
  failed: number;
  bugsFound: number;
  bugsFile: string;
  coverage: Partial<CoverageData>;
  duration: number;
}

@Injectable()
export class TestingService {
  private readonly logger = new Logger("TestingService");
  private liveGameId: string | null = null;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly liveGameManager: LiveGameManagerService,
    private readonly gamesService: GamesService,
    private readonly tablesService: TablesService,
    private readonly authService: AuthService,
    private readonly userRepository: UserRepository,
    private readonly botRepository: BotRepository,
  ) {}

  async startLiveGame() {
    if (this.liveGameId) {
      return {
        gameId: this.liveGameId,
        status: "running",
        url: `http://localhost:5173/games/${this.liveGameId}`,
      };
    }

    this.logger.log(`🎮 Starting live game...`);

    try {
      // Create test user for live game bots
      const timestamp = Date.now();
      const email = `test${timestamp}@test.local`; // Use valid email format
      const name = `TestPlayer${timestamp}`;

      try {
        await this.authService.register({
          email,
          name,
          password: "testpass123",
        });
        this.logger.log(`📝 Registration successful`);
      } catch (e) {
        this.logger.error(`❌ Registration failed: ${(e as Error).message}`);
        throw e;
      }

      // Retrieve the created user to get their ID
      const user = await this.userRepository.findByEmail(email);
      if (!user) {
        this.logger.error(`❌ User not found after registration: ${email}`);
        throw new Error(`Failed to create test user: ${email}`);
      }
      const testUserId = user.id;
      this.logger.log(`✅ Test user created with ID: ${testUserId}`);

      // Create Table record first (Game has FK to Table)
      const table = await this.tablesService.create({
        name: `Live-Table-${timestamp}`,
      });
      this.logger.log(`✅ Table created: ${table.id}`);

      // Create database Game record (required for FK constraints during persistence)
      const dbGame = await this.gamesService.createGame(table.id);
      const gameId = dbGame.id; // Use the database-generated UUID as the game ID
      const tableId = table.id; // Use the actual table ID (not gameId) for FK consistency
      this.logger.log(`✅ Game record created: ${gameId}`);

      // Create game through LiveGameManagerService using the database-generated ID
      this.logger.log(
        `[TEST] About to create game with tableId=${tableId}, gameDbId=${gameId}`,
      );
      const game = await this.liveGameManager.createGame({
        tableId,
        gameDbId: gameId,
        smallBlind: 5,
        bigBlind: 10,
        startingChips: 10000, // Increased from 1000 (100 BB) to 10000 (1000 BB) for longer games
      });
      this.logger.log(`[TEST] Game created successfully`);

      // Create proper bot records with FK to user
      const botBaseNames = ["Alice", "Bob", "Charlie", "Diana", "Eve"];
      const botTimestamp = Date.now();

      for (let i = 0; i < 5; i++) {
        const botId = `bot-${i}-${botTimestamp}`;
        // Make database name unique with timestamp, but display name is short
        const uniqueBotName = `${botBaseNames[i]}-${botTimestamp}`;
        const displayName = botBaseNames[i];

        // Create bot in database
        await this.botRepository.create({
          id: botId,
          name: uniqueBotName,
          user_id: testUserId,
          strategy: { tier: "quick", version: 1 },
          active: true,
        });
        this.logger.log(`✅ Bot created: ${uniqueBotName}`);

        // Add bot to game (use short display name for UI)
        game.addPlayer({
          id: botId,
          name: displayName,
          strategy: {
            version: 1 as const,
            tier: "quick" as any,
            personality: {
              aggression: 50,
              bluffFrequency: 30,
              riskTolerance: 50,
              tightness: 50,
            },
          },
          chips: 1000,
        });
      }

      // Store tableId for tracking (games are keyed by tableId in liveGameManager)
      this.liveGameId = tableId;

      this.logger.log(`✅ Game created: ${gameId} (DB) on table ${tableId}`);
      this.logger.log(`🌐 Watch at: http://localhost:5173/games/${tableId}`);
      this.logger.log(`👥 Players added: ${game.players.length}`);

      // Start game in background immediately
      // This ensures continuous state updates for the UI
      game
        .startGame()
        .then(() => {
          this.logger.log(`✅ Game finished`);
          this.liveGameId = null;
        })
        .catch((e: any) => {
          // Log error but don't crash - persistence issues are OK for live demos
          if (e.message?.includes("foreign key")) {
            this.logger.warn(
              `Game persistence issue (OK for demo): ${e.message}`,
            );
          } else {
            this.logger.error(`Live game error: ${e.message}`);
          }
          this.liveGameId = null;
        });

      return {
        gameId: tableId, // Return tableId so frontend subscribes with correct key
        status: "starting",
        url: `http://localhost:5173/games/${tableId}`,
        message: `Game will be visible at ${gameId}`,
      };
    } catch (e) {
      this.logger.error(`Failed to start live game: ${(e as Error).message}`);
      throw e;
    }
  }

  async runSimulation(dto: RunSimulationDto): Promise<SimulationSummary> {
    const startTime = Date.now();
    this.logger.log(
      `Starting simulation: ${dto.gameCount} games with ${dto.botCount} bots`,
    );

    const allBugs: BugReport[] = [];
    const coverageTracker = CoverageTracker.loadFromFile();
    let successCount = 0;

    // Run games sequentially
    for (let i = 0; i < dto.gameCount; i++) {
      try {
        const result = await runSimulatedGame({
          botCount: dto.botCount,
          startingChips: dto.startingChips,
          smallBlind: dto.smallBlind,
          bigBlind: dto.bigBlind,
        });

        if (result.success) {
          successCount++;
        }

        allBugs.push(...result.errors);
        coverageTracker.mergeGameCoverage(result.coverageHits);

        this.logger.debug(
          `Game ${i + 1}/${dto.gameCount}: ${result.success ? "PASS" : "FAIL"} (${result.duration}ms)`,
        );
      } catch (e) {
        this.logger.error(
          `Game ${i + 1}/${dto.gameCount} crashed:`,
          (e as Error).message,
        );
      }
    }

    // Write bug reports using shared utility
    const { bugsFile } = writeBugReportsWithTracking(allBugs);

    // Save coverage
    const coverageFile = coverageTracker.saveToFile();
    this.logger.log(`Coverage saved to ${coverageFile}`);

    const duration = Date.now() - startTime;
    const coverage = coverageTracker.getData();

    const summary: SimulationSummary = {
      totalGames: dto.gameCount,
      successful: successCount,
      failed: dto.gameCount - successCount,
      bugsFound: allBugs.length,
      bugsFile,
      coverage,
      duration,
    };

    this.logger.log(
      `Simulation complete: ${successCount}/${dto.gameCount} passed, ${allBugs.length} bugs found`,
    );

    return summary;
  }
}
