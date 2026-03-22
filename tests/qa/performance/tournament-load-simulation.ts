/**
 * Tournament Load Simulation
 * ==========================
 *
 * Performance load test using the actual NestJS services.
 * Similar to qa/simulations but focused on load testing.
 *
 * This bypasses HTTP authentication by directly using services,
 * which allows us to test the actual game logic under load.
 *
 * Usage: npx ts-node tests/qa/performance/tournament-load-simulation.ts
 */

import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule, EventEmitter2 } from "@nestjs/event-emitter";
import { ThrottlerModule } from "@nestjs/throttler";
import { DataSource } from "typeorm";
import * as crypto from "crypto";
import * as http from "http";

import { appConfig } from "../../../src/config";
import * as entities from "../../../src/entities";
import { TournamentDirectorService } from "../../../src/modules/tournaments/tournament-director.service";
import { TournamentRepository } from "../../../src/repositories/tournament.repository";
import { TournamentsModule } from "../../../src/modules/tournaments/tournaments.module";
import { GamesModule } from "../../../src/modules/games/games.module";
import { BotsModule } from "../../../src/modules/bots/bots.module";
import { ServicesModule } from "../../../src/services/services.module";
import { LiveGameManagerService } from "../../../src/services/live-game-manager.service";

import { MetricsCollector, createMetricsCollector } from "./metrics-collector";
import { LoadTestMetrics, validateSLOs, DEFAULT_SLOS } from "./load-config";

interface LoadSimulationConfig {
  name: string;
  tournamentCount: number;
  playersPerTournament: number;
  maxDurationMs: number;
  targetHandsPerTournament: number;
  verboseLogging: boolean;
}

interface BotServer {
  server: http.Server;
  port: number;
  botId: string;
}

interface TournamentInstance {
  id: string;
  tournamentId: string;
  players: string[];
  botServers: BotServer[];
  status: "starting" | "running" | "finished" | "error";
  handsPlayed: number;
  startTime: number;
}

class TournamentLoadSimulation {
  private config: LoadSimulationConfig;
  private testModule: TestingModule | null = null;
  private dataSource: DataSource | null = null;
  private tournamentDirector: TournamentDirectorService | null = null;
  private tournamentRepository: TournamentRepository | null = null;
  private liveGameManager: LiveGameManagerService | null = null;
  private eventEmitter: EventEmitter2 | null = null;
  private metricsCollector: MetricsCollector;
  private tournaments: TournamentInstance[] = [];
  private startTime: number = 0;
  private userId: string = "";
  private basePort: number = 9000;

  constructor(config: LoadSimulationConfig) {
    this.config = config;
    this.metricsCollector = createMetricsCollector(2000);
  }

  async run(): Promise<{
    success: boolean;
    metrics: LoadTestMetrics;
    report: string;
  }> {
    this.startTime = Date.now();
    this.log(`Starting load simulation: ${this.config.name}`);
    this.log(
      `Target: ${this.config.tournamentCount} tournaments, ${this.config.playersPerTournament} players each`,
    );

    try {
      await this.setup();
      await this.runSimulation();
    } catch (error) {
      this.log(`Simulation error: ${error}`);
    } finally {
      await this.cleanup();
    }

    const metrics = this.metricsCollector.getMetrics();
    const sloResult = validateSLOs(metrics, DEFAULT_SLOS);
    const report = this.generateReport(metrics);

    return {
      success: sloResult.passed,
      metrics,
      report,
    };
  }

  private async setup(): Promise<void> {
    this.log("Setting up NestJS test module...");

    this.testModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
        TypeOrmModule.forRoot({
          type: "postgres",
          host: process.env.TEST_DB_HOST || "localhost",
          port: parseInt(process.env.TEST_DB_PORT || "5432", 10),
          username: process.env.TEST_DB_USERNAME || "postgres",
          password: process.env.TEST_DB_PASSWORD || "postgres",
          database: process.env.TEST_DB_NAME || "poker_load_test",
          entities: Object.values(entities),
          synchronize: true,
          dropSchema: true,
          logging: false,
        }),
        ThrottlerModule.forRoot([
          { name: "default", ttl: 60000, limit: 100000 },
        ]),
        EventEmitterModule.forRoot(),
        ServicesModule,
        TournamentsModule,
        GamesModule,
        BotsModule,
      ],
    }).compile();

    const app = this.testModule.createNestApplication();
    await app.init();

    this.dataSource = this.testModule.get(DataSource);
    this.tournamentDirector = this.testModule.get(TournamentDirectorService);
    this.tournamentRepository = this.testModule.get(TournamentRepository);
    this.liveGameManager = this.testModule.get(LiveGameManagerService);
    this.eventEmitter = this.testModule.get(EventEmitter2);

    // Create test user
    this.userId = crypto.randomUUID();
    await this.dataSource.query(
      `INSERT INTO users (id, email, name, password_hash, api_key_hash, role, active, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'user', true, true, NOW(), NOW())`,
      [
        this.userId,
        `loadtest_${Date.now()}@test.com`,
        "LoadTestUser",
        "hashed",
        "0".repeat(64),
      ],
    );

    this.log("Setup complete");
  }

  private async runSimulation(): Promise<void> {
    this.log(`Starting ${this.config.tournamentCount} tournaments...`);

    // Start tournaments concurrently
    const startPromises: Promise<void>[] = [];

    for (let i = 0; i < this.config.tournamentCount; i++) {
      // Stagger tournament starts to avoid port conflicts
      await this.sleep(100);
      startPromises.push(this.startTournament(i));
    }

    // Wait for all tournaments to start
    await Promise.allSettled(startPromises);

    this.log(
      `${this.tournaments.filter((t) => t.status === "running").length} tournaments running`,
    );

    // Monitor tournaments
    const monitorEndTime = Date.now() + this.config.maxDurationMs;
    let lastLogTime = Date.now();

    while (Date.now() < monitorEndTime) {
      await this.sleep(1000);
      this.metricsCollector.sampleResources();

      // Check tournament states
      let runningCount = 0;
      let totalHands = 0;

      for (const tournament of this.tournaments) {
        if (tournament.status !== "running") continue;

        const state = this.tournamentDirector!.getTournamentState(
          tournament.tournamentId,
        );

        if (!state) {
          // Check DB status
          const dbTournament = await this.tournamentRepository!.findById(
            tournament.tournamentId,
          );
          if (dbTournament?.status === "finished") {
            tournament.status = "finished";
            this.metricsCollector.recordTournamentCompleted();
          }
          continue;
        }

        if (state.status === "finished") {
          tournament.status = "finished";
          this.metricsCollector.recordTournamentCompleted();
          continue;
        }

        runningCount++;

        // Count hands across all tables
        const tableHands = (state.tables || []).reduce(
          (sum: number, t: any) => {
            return sum + (t.gameState?.handNumber || 0);
          },
          0,
        );

        if (tableHands > tournament.handsPlayed) {
          const newHands = tableHands - tournament.handsPlayed;
          for (let i = 0; i < newHands; i++) {
            this.metricsCollector.recordHandPlayed();
          }
          tournament.handsPlayed = tableHands;
        }

        totalHands += tableHands;
      }

      // Periodic logging
      if (Date.now() - lastLogTime > 5000) {
        const metrics = this.metricsCollector.getMetrics();
        this.log(
          `Running: ${runningCount}/${this.config.tournamentCount} | ` +
            `Hands: ${metrics.tournaments.handsPlayed} | ` +
            `Memory: ${metrics.memory.currentMB.toFixed(0)}MB`,
        );
        lastLogTime = Date.now();
      }

      // Check if all done
      if (runningCount === 0) {
        this.log("All tournaments completed");
        break;
      }

      // Check for target hands
      if (
        totalHands >=
        this.config.tournamentCount * this.config.targetHandsPerTournament
      ) {
        this.log("Target hands reached");
        break;
      }
    }
  }

  private async startTournament(index: number): Promise<void> {
    const instanceId = crypto.randomUUID();
    const basePort = this.basePort + index * 20; // Reserve 20 ports per tournament

    const instance: TournamentInstance = {
      id: instanceId,
      tournamentId: "",
      players: [],
      botServers: [],
      status: "starting",
      handsPlayed: 0,
      startTime: Date.now(),
    };

    this.tournaments.push(instance);

    try {
      // Create bot servers
      for (let i = 0; i < this.config.playersPerTournament; i++) {
        const port = basePort + i;
        const botId = crypto.randomUUID();
        const server = await this.createBotServer(port, i);

        instance.botServers.push({ server, port, botId });
        instance.players.push(botId);

        // Register bot in DB
        const start = Date.now();
        await this.dataSource!.query(
          `INSERT INTO bots (id, user_id, name, endpoint, active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
          [
            botId,
            this.userId,
            `Bot_${index}_${i}`,
            `http://localhost:${port}/action`,
          ],
        );
        this.metricsCollector.recordHttpLatency(Date.now() - start, true);
      }

      // Create tournament
      const tournamentId = crypto.randomUUID();
      instance.tournamentId = tournamentId;

      const createStart = Date.now();
      await this.dataSource!.query(
        `INSERT INTO tournaments (
          id, name, type, status, buy_in, starting_chips,
          min_players, max_players, players_per_table,
          turn_timeout_ms, late_reg_ends_level, rebuys_allowed,
          created_at, updated_at
        )
        VALUES ($1, $2, 'rolling', 'registering', 100, 1000, $3, $4, 9, 3000, 0, false, NOW(), NOW())`,
        [
          tournamentId,
          `LoadTest_${index}`,
          this.config.playersPerTournament,
          this.config.playersPerTournament,
        ],
      );
      this.metricsCollector.recordHttpLatency(Date.now() - createStart, true);

      // Create blind levels
      const blindLevels = [
        { level: 1, small: 25, big: 50, ante: 5 },
        { level: 2, small: 50, big: 100, ante: 10 },
        { level: 3, small: 100, big: 200, ante: 20 },
        { level: 4, small: 200, big: 400, ante: 40 },
        { level: 5, small: 400, big: 800, ante: 80 },
      ];

      for (const bl of blindLevels) {
        await this.dataSource!.query(
          `INSERT INTO tournament_blind_levels (id, tournament_id, level, small_blind, big_blind, ante, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          [
            crypto.randomUUID(),
            tournamentId,
            bl.level,
            bl.small,
            bl.big,
            bl.ante,
          ],
        );
      }

      // Register players
      for (const botId of instance.players) {
        const regStart = Date.now();
        await this.dataSource!.query(
          `INSERT INTO tournament_entries (id, tournament_id, bot_id, entry_type, created_at, updated_at)
           VALUES ($1, $2, $3, 'initial', NOW(), NOW())`,
          [crypto.randomUUID(), tournamentId, botId],
        );
        this.metricsCollector.recordHttpLatency(Date.now() - regStart, true);
      }

      // Start tournament
      const startTime = Date.now();
      await this.tournamentDirector!.startTournament(tournamentId);
      this.metricsCollector.recordHttpLatency(Date.now() - startTime, true);
      this.metricsCollector.recordTournamentStarted();

      instance.status = "running";

      if (this.config.verboseLogging) {
        this.log(`Tournament ${index} started: ${tournamentId}`);
      }
    } catch (error) {
      instance.status = "error";
      this.metricsCollector.recordTournamentFailed();
      this.metricsCollector.recordError({
        timestamp: Date.now(),
        tournamentId: instance.tournamentId,
        type: "crash",
        message: String(error),
      });
      this.log(`Tournament ${index} failed: ${error}`);
    }
  }

  private createBotServer(port: number, index: number): Promise<http.Server> {
    return new Promise((resolve, reject) => {
      const personalities = ["caller", "folder", "maniac", "smart", "random"];
      const personality = personalities[index % personalities.length];

      const server = http.createServer((req, res) => {
        if (req.method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok" }));
          return;
        }

        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            const action = this.decideBotAction(payload, personality);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(action));
          } catch {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ type: "fold" }));
          }
        });
      });

      server.on("error", reject);
      server.listen(port, () => resolve(server));
    });
  }

  private decideBotAction(
    payload: any,
    personality: string,
  ): { type: string; amount?: number } {
    const { action } = payload;
    const canCheck = action?.canCheck ?? false;
    const minRaise = action?.minRaise ?? 0;
    const maxRaise = action?.maxRaise ?? 0;

    switch (personality) {
      case "caller":
        return canCheck ? { type: "check" } : { type: "call" };
      case "folder":
        if (canCheck) return { type: "check" };
        return Math.random() < 0.7 ? { type: "fold" } : { type: "call" };
      case "maniac":
        if (maxRaise > 0 && Math.random() < 0.4) {
          return { type: "raise", amount: Math.min(minRaise * 2, maxRaise) };
        }
        return canCheck ? { type: "check" } : { type: "call" };
      case "smart":
        if (canCheck) return { type: "check" };
        if (Math.random() < 0.4) return { type: "call" };
        return { type: "fold" };
      default:
        const roll = Math.random();
        if (roll < 0.15) return { type: "fold" };
        if (roll < 0.7) return canCheck ? { type: "check" } : { type: "call" };
        if (maxRaise > 0) return { type: "raise", amount: minRaise };
        return canCheck ? { type: "check" } : { type: "call" };
    }
  }

  private async cleanup(): Promise<void> {
    this.log("Cleaning up...");

    // Close bot servers
    for (const tournament of this.tournaments) {
      for (const bot of tournament.botServers) {
        try {
          await new Promise<void>((r) => bot.server.close(() => r()));
        } catch {
          // Ignore
        }
      }
    }

    // Close database
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
    }

    // Close app
    if (this.testModule) {
      await this.testModule.close();
    }

    this.log("Cleanup complete");
  }

  private generateReport(metrics: LoadTestMetrics): string {
    const duration = (Date.now() - this.startTime) / 1000;
    const finished = this.tournaments.filter(
      (t) => t.status === "finished",
    ).length;
    const failed = this.tournaments.filter((t) => t.status === "error").length;

    return `
═══════════════════════════════════════════════════════════════════════
                    TOURNAMENT LOAD SIMULATION REPORT
═══════════════════════════════════════════════════════════════════════

Configuration:
  Tournaments: ${this.config.tournamentCount}
  Players/Tournament: ${this.config.playersPerTournament}
  Total Virtual Users: ${this.config.tournamentCount * this.config.playersPerTournament}
  Duration: ${duration.toFixed(1)}s

Results:
  Tournaments Completed: ${finished}/${this.config.tournamentCount}
  Tournaments Failed: ${failed}
  Total Hands Played: ${metrics.tournaments.handsPlayed}
  Hands/Second: ${(metrics.tournaments.handsPlayed / duration).toFixed(2)}

Performance:
  DB Operations:
    Total: ${metrics.requests.total}
    Throughput: ${metrics.requests.perSecond.toFixed(1)} ops/s
    P50 Latency: ${metrics.httpLatency.p50.toFixed(1)}ms
    P95 Latency: ${metrics.httpLatency.p95.toFixed(1)}ms
    P99 Latency: ${metrics.httpLatency.p99.toFixed(1)}ms
    Max Latency: ${metrics.httpLatency.max.toFixed(1)}ms

Resources:
  Memory Start: ${metrics.memory.startMB.toFixed(1)}MB
  Memory Peak: ${metrics.memory.peakMB.toFixed(1)}MB
  Memory Growth: ${metrics.memory.growthMB.toFixed(1)}MB

Errors: ${this.metricsCollector.getErrors().length}
${this.metricsCollector
  .getErrors()
  .slice(0, 5)
  .map((e) => `  - [${e.type}] ${e.message}`)
  .join("\n")}

═══════════════════════════════════════════════════════════════════════
`;
  }

  private log(message: string): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(`[${elapsed}s] ${message}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Run configurations
const CONFIGS: Record<string, LoadSimulationConfig> = {
  quick: {
    name: "Quick Load Test",
    tournamentCount: 5,
    playersPerTournament: 6,
    maxDurationMs: 120000,
    targetHandsPerTournament: 20,
    verboseLogging: false,
  },
  medium: {
    name: "Medium Load Test",
    tournamentCount: 20,
    playersPerTournament: 9,
    maxDurationMs: 300000,
    targetHandsPerTournament: 30,
    verboseLogging: false,
  },
  full: {
    name: "Full Load Test (100 tournaments)",
    tournamentCount: 100,
    playersPerTournament: 10,
    maxDurationMs: 600000,
    targetHandsPerTournament: 50,
    verboseLogging: false,
  },
};

async function main() {
  const configName = process.argv[2] || "quick";
  const config = CONFIGS[configName];

  if (!config) {
    console.error(
      `Unknown config: ${configName}. Available: ${Object.keys(CONFIGS).join(", ")}`,
    );
    process.exit(1);
  }

  console.log(
    `\n╔══════════════════════════════════════════════════════════════╗`,
  );
  console.log(
    `║          TOURNAMENT LOAD SIMULATION                          ║`,
  );
  console.log(
    `╚══════════════════════════════════════════════════════════════╝\n`,
  );

  const simulation = new TournamentLoadSimulation(config);
  const result = await simulation.run();

  console.log(result.report);
  console.log(`\nResult: ${result.success ? "✅ PASSED" : "❌ FAILED"}\n`);

  process.exit(result.success ? 0 : 1);
}

main().catch((error) => {
  console.error("Simulation crashed:", error);
  process.exit(1);
});
