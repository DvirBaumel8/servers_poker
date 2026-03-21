/**
 * Multi-Table Tournament Simulation
 * ==================================
 *
 * Run on: Weekly / Before Release
 * Duration: ~10-15 minutes
 *
 * Tests:
 * - 30+ player multi-table tournament
 * - Table consolidation (breaking tables)
 * - Player redistribution
 * - Final table formation
 * - Late registration
 * - Error recovery
 * - Tournament completion with winner
 * - Full prize distribution
 *
 * This is the most comprehensive simulation and validates
 * the complete tournament lifecycle with complex scenarios.
 */

import { SimulationRunner, SimulationConfig } from "./simulation-runner";
import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule, EventEmitter2 } from "@nestjs/event-emitter";
import { ThrottlerModule } from "@nestjs/throttler";
import { DataSource } from "typeorm";
import * as crypto from "crypto";

import { appConfig } from "../../src/config";
import * as entities from "../../src/entities";
import { TournamentDirectorService } from "../../src/modules/tournaments/tournament-director.service";
import { TournamentRepository } from "../../src/repositories/tournament.repository";
import { TournamentsModule } from "../../src/modules/tournaments/tournaments.module";
import { GamesModule } from "../../src/modules/games/games.module";
import { BotsModule } from "../../src/modules/bots/bots.module";
import { ServicesModule } from "../../src/services/services.module";

const MULTI_TABLE_CONFIG: SimulationConfig = {
  name: "MultiTable-30Player-Tournament",
  playerCount: 30,
  startingChips: 5000,
  maxHands: 2000,
  maxDurationMs: 900000, // 15 minutes max
  blinds: { small: 25, big: 50, ante: 10 },
  tournamentMode: true,
  verboseLogging: false,
  validateAfterEachHand: false, // Lighter validation for larger sim
};

interface TableStats {
  tableId: string;
  status: string;
  handNumber: number;
  activePlayers: number;
  totalPlayers: number;
}

export class MultiTableSimulation extends SimulationRunner {
  private testModule: TestingModule | null = null;
  private tournamentDirector: TournamentDirectorService | null = null;
  private tournamentRepository: TournamentRepository | null = null;
  private tournamentId: string = "";
  private botIds: string[] = [];
  private userId: string = "";

  // Tracking for multi-table specific metrics
  private maxTablesObserved: number = 0;
  private tablesConsolidated: number = 0;
  private lateRegistrations: number = 0;
  private errorRecoveries: number = 0;
  private blindLevelChanges: number = 0;
  private lastLevel: number = 1;

  constructor(config: Partial<SimulationConfig> = {}) {
    super({ ...MULTI_TABLE_CONFIG, ...config });
  }

  protected async setupDatabase(): Promise<void> {
    this.log("Setting up test database for multi-table simulation...");

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

    this.app = this.testModule.createNestApplication();
    await this.app.init();

    this.dataSource = this.testModule.get(DataSource);
    this.tournamentDirector = this.testModule.get(TournamentDirectorService);
    this.tournamentRepository = this.testModule.get(TournamentRepository);
    this.eventEmitter = this.testModule.get(EventEmitter2);

    this.log("Database ready");
  }

  protected async setupTestData(): Promise<void> {
    this.log(`Setting up ${this.config.playerCount}-player tournament...`);

    // Create test user
    this.userId = crypto.randomUUID();
    await this.dataSource!.query(
      `
      INSERT INTO users (id, email, name, password_hash, api_key_hash, role, active, email_verified, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'user', true, true, NOW(), NOW())
    `,
      [
        this.userId,
        `mtsim_${Date.now()}@test.com`,
        "MTSimUser",
        "hashed",
        "0".repeat(64),
      ],
    );

    // Create bots
    this.botIds = [];
    for (let i = 0; i < this.config.playerCount; i++) {
      const botId = this.botServers[i].botId;
      const port = this.botServers[i].port;

      await this.dataSource!.query(
        `
        INSERT INTO bots (id, user_id, name, endpoint, active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, true, NOW(), NOW())
      `,
        [
          botId,
          this.userId,
          `MTBot${i + 1}`,
          `http://localhost:${port}/action`,
        ],
      );

      this.botIds.push(botId);
    }

    // Create tournament with late registration enabled
    this.tournamentId = crypto.randomUUID();
    await this.dataSource!.query(
      `
      INSERT INTO tournaments (
        id, name, type, status, buy_in, starting_chips,
        min_players, max_players, players_per_table,
        turn_timeout_ms, late_reg_ends_level, rebuys_allowed,
        created_at, updated_at
      )
      VALUES ($1, $2, 'rolling', 'registering', 100, $3, 10, 50, 9, 3000, 4, false, NOW(), NOW())
    `,
      [
        this.tournamentId,
        `MTSimTournament_${Date.now()}`,
        this.config.startingChips,
      ],
    );

    // Create more blind levels for longer tournament
    const blindLevels = [
      { level: 1, small: 25, big: 50, ante: 10 },
      { level: 2, small: 50, big: 100, ante: 15 },
      { level: 3, small: 75, big: 150, ante: 20 },
      { level: 4, small: 100, big: 200, ante: 25 },
      { level: 5, small: 150, big: 300, ante: 40 },
      { level: 6, small: 200, big: 400, ante: 50 },
      { level: 7, small: 300, big: 600, ante: 75 },
      { level: 8, small: 400, big: 800, ante: 100 },
      { level: 9, small: 500, big: 1000, ante: 150 },
      { level: 10, small: 750, big: 1500, ante: 200 },
    ];

    for (const bl of blindLevels) {
      await this.dataSource!.query(
        `
        INSERT INTO tournament_blind_levels (id, tournament_id, level, small_blind, big_blind, ante, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      `,
        [
          crypto.randomUUID(),
          this.tournamentId,
          bl.level,
          bl.small,
          bl.big,
          bl.ante,
        ],
      );
    }

    // Register initial players (leave some for late registration)
    const initialPlayers = Math.floor(this.config.playerCount * 0.8);
    for (let i = 0; i < initialPlayers; i++) {
      await this.dataSource!.query(
        `
        INSERT INTO tournament_entries (id, tournament_id, bot_id, entry_type, created_at, updated_at)
        VALUES ($1, $2, $3, 'initial', NOW(), NOW())
      `,
        [crypto.randomUUID(), this.tournamentId, this.botIds[i]],
      );
    }

    this.log(
      `Created tournament with ${initialPlayers} initial players (${this.config.playerCount - initialPlayers} reserved for late reg)`,
    );
  }

  protected async executeSimulation(): Promise<void> {
    this.log("Starting multi-table tournament...");

    try {
      await this.tournamentDirector!.startTournament(this.tournamentId);
      this.log("Tournament started");
    } catch (error) {
      this.log(`Tournament start: ${error}`);
    }

    const startTime = Date.now();
    let lastUpdate = 0;
    let stuckCounter = 0;
    let lateRegDone = false;

    while (Date.now() - startTime < this.config.maxDurationMs!) {
      await this.sleep(2000);

      const state = this.tournamentDirector!.getTournamentState(
        this.tournamentId,
      );

      if (!state) {
        const tournament = await this.tournamentRepository!.findById(
          this.tournamentId,
        );
        if (tournament?.status === "finished") {
          this.log("Tournament finished!");
          await this.updateFinalStateFromDb();
          break;
        }
        continue;
      }

      // Track table statistics
      const tableStats = this.getTableStats(state);
      const totalHands = tableStats.reduce((sum, t) => sum + t.handNumber, 0);
      const totalActivePlayers = tableStats.reduce(
        (sum, t) => sum + t.activePlayers,
        0,
      );
      const runningTables = tableStats.filter(
        (t) => t.status === "running",
      ).length;
      const errorTables = tableStats.filter((t) => t.status === "error").length;
      const finishedTables = tableStats.filter(
        (t) => t.status === "finished",
      ).length;

      this.result.handsPlayed = Math.max(this.result.handsPlayed, totalHands);
      this.maxTablesObserved = Math.max(
        this.maxTablesObserved,
        tableStats.length,
      );

      // Track blind level changes
      if (state.level > this.lastLevel) {
        this.blindLevelChanges++;
        this.lastLevel = state.level;
        this.log(`Blind level advanced to ${state.level}`);
      }

      // Track table consolidation
      if (finishedTables > 0) {
        this.tablesConsolidated = Math.max(
          this.tablesConsolidated,
          finishedTables,
        );
      }

      // Late registration (add remaining players during level 1-3)
      if (!lateRegDone && state.level <= 3 && totalHands > 10) {
        const remainingBots = this.botIds.slice(
          Math.floor(this.config.playerCount * 0.8),
        );
        for (const botId of remainingBots) {
          try {
            await this.dataSource!.query(
              `
              INSERT INTO tournament_entries (id, tournament_id, bot_id, entry_type, created_at, updated_at)
              VALUES ($1, $2, $3, 'late', NOW(), NOW())
              ON CONFLICT DO NOTHING
            `,
              [crypto.randomUUID(), this.tournamentId, botId],
            );
            this.lateRegistrations++;
          } catch {
            // Ignore late reg failures
          }
        }
        lateRegDone = true;
        this.log(`Late registration: added ${this.lateRegistrations} players`);
      }

      // Progress tracking
      if (totalHands > lastUpdate) {
        stuckCounter = 0;
        lastUpdate = totalHands;

        // Log progress every 50 hands or significant changes
        if (totalHands % 50 === 0 || this.config.verboseLogging) {
          this.log(
            `L${state.level} | H:${totalHands} | P:${totalActivePlayers}/${this.config.playerCount} | ` +
              `T:${runningTables}run/${errorTables}err/${finishedTables}fin`,
          );
        }
      } else {
        stuckCounter++;
        if (stuckCounter > 60) {
          // 2 minutes stuck
          this.recordError({
            type: "tournament_stuck",
            message: `No progress for ${stuckCounter * 2} seconds`,
            severity: "error",
            context: { hands: totalHands, tables: tableStats },
          });
          break;
        }
      }

      // Error table warnings
      if (errorTables > 0) {
        this.recordWarning({
          type: "tables_in_error",
          message: `${errorTables} table(s) in error state`,
          context: {
            tables: tableStats.filter((t) => t.status === "error"),
            level: state.level,
          },
        });
      }

      // Check for completion conditions
      const playersRemaining =
        typeof state.playersRemaining === "number"
          ? state.playersRemaining
          : totalActivePlayers;
      if (playersRemaining <= 1 || state.status === "finished") {
        this.log(
          `Tournament completing - ${playersRemaining} player(s) remaining`,
        );
        await this.sleep(5000); // Wait for final state to settle
        await this.updateFinalStateFromDb();
        break;
      }
    }

    if (this.result.finalState.status === "not_started") {
      await this.updateFinalStateFromDb();
    }
  }

  private getTableStats(state: any): TableStats[] {
    return (state.tables || []).map((t: any) => ({
      tableId: t.tableId,
      status: t.gameState?.status || "unknown",
      handNumber: t.gameState?.handNumber || 0,
      activePlayers: (t.gameState?.players || []).filter(
        (p: any) => Number(p.chips) > 0,
      ).length,
      totalPlayers: (t.gameState?.players || []).length,
    }));
  }

  private async updateFinalStateFromDb(): Promise<void> {
    const state = this.tournamentDirector!.getTournamentState(
      this.tournamentId,
    );
    const tournament = await this.tournamentRepository!.findById(
      this.tournamentId,
    );

    const chipDist: Record<string, number> = {};
    let totalChips = 0;
    let playersRemaining = 0;
    const seats = await this.dataSource!.query(
      `
      SELECT b.name, s.chips, s.busted
      FROM tournament_seats s
      JOIN bots b ON b.id = s.bot_id
      WHERE s.tournament_id = $1
    `,
      [this.tournamentId],
    );

    if (seats.length > 0) {
      for (const seat of seats) {
        const chips = Number(seat.chips) || 0;
        chipDist[seat.name] = chips;
        totalChips += chips;
        if (chips > 0 && !seat.busted) {
          playersRemaining++;
        }
      }
    }

    if (totalChips === 0 && state?.tables) {
      for (const table of state.tables) {
        for (const player of table.gameState?.players || []) {
          const chips = Number(player.chips) || 0;
          chipDist[player.name] = chips;
          totalChips += chips;
          if (chips > 0) playersRemaining++;
        }
        totalChips += Number(table.gameState?.pot) || 0;
      }
    }

    const gameHands = await this.dataSource!.query(
      `
      SELECT COALESCE(SUM(total_hands), 0) AS total_hands
      FROM games
      WHERE tournament_id = $1
    `,
      [this.tournamentId],
    );
    this.result.handsPlayed = Math.max(
      this.result.handsPlayed,
      Number(gameHands[0]?.total_hands) || 0,
    );

    const brokenTables = await this.dataSource!.query(
      `
      SELECT COUNT(*) AS count
      FROM tournament_tables
      WHERE tournament_id = $1 AND status = 'broken'
    `,
      [this.tournamentId],
    );
    this.tablesConsolidated = Math.max(
      this.tablesConsolidated,
      parseInt(brokenTables[0]?.count || "0", 10),
    );

    // Get winner from results
    const results = await this.dataSource!.query(
      `
      SELECT b.name FROM tournament_entries e
      JOIN bots b ON b.id = e.bot_id
      WHERE e.tournament_id = $1 AND e.finish_position = 1
    `,
      [this.tournamentId],
    );

    const winner =
      results[0]?.name ||
      (playersRemaining === 1
        ? Object.entries(chipDist).find(([_, chips]) => chips > 0)?.[0]
        : undefined);

    this.result.finalState = {
      status: tournament?.status || state?.status || "unknown",
      playersRemaining,
      totalChips,
      expectedChips: this.config.playerCount * this.config.startingChips,
      winner,
      chipDistribution: chipDist,
    };
  }

  protected async runCustomAssertions(): Promise<void> {
    // Multi-table specific assertions

    // Multiple tables were created
    this.assert(
      "multi_table_created",
      this.maxTablesObserved > 1,
      `Should create multiple tables`,
      "> 1",
      this.maxTablesObserved,
    );

    // Significant progress was made
    this.assert(
      "significant_progress",
      this.result.handsPlayed >= 50,
      `Should play at least 50 hands across tables`,
      ">= 50",
      this.result.handsPlayed,
    );

    // Blind levels advanced (if enough hands)
    if (this.result.handsPlayed > 100) {
      this.assert(
        "blinds_advanced",
        this.blindLevelChanges > 0,
        `Blind levels should advance during tournament`,
        "> 0",
        this.blindLevelChanges,
      );
    }

    // Check for eliminations
    const eliminatedCount = await this.dataSource!.query(
      `
      SELECT COUNT(*) as count FROM tournament_entries
      WHERE tournament_id = $1 AND finish_position IS NOT NULL
    `,
      [this.tournamentId],
    );

    this.assert(
      "eliminations_recorded",
      parseInt(eliminatedCount[0].count) > 0 ||
        this.result.finalState.status === "finished",
      `Should have elimination records`,
      "> 0 or finished",
      eliminatedCount[0].count,
    );

    // Tournament seats were created
    const seatCount = await this.dataSource!.query(
      `
      SELECT COUNT(*) as count FROM tournament_seats WHERE tournament_id = $1
    `,
      [this.tournamentId],
    );

    this.assert(
      "tournament_seats_created",
      parseInt(seatCount[0].count) >= Math.floor(this.config.playerCount * 0.8),
      `Tournament seats should be created for most players`,
      `>= ${Math.floor(this.config.playerCount * 0.8)}`,
      seatCount[0].count,
    );

    // Tournament tables were created
    const tableCount = await this.dataSource!.query(
      `
      SELECT COUNT(*) as count FROM tournament_tables WHERE tournament_id = $1
    `,
      [this.tournamentId],
    );

    this.assert(
      "tournament_tables_created",
      parseInt(tableCount[0].count) > 0,
      `Tournament tables should be recorded in database`,
      "> 0",
      tableCount[0].count,
    );
  }

  getSummary(): string {
    const baseSummary = super.getSummary();

    // Add multi-table specific stats
    const mtStats = [
      ``,
      `Multi-Table Stats:`,
      `  Max Tables Observed: ${this.maxTablesObserved}`,
      `  Tables Consolidated: ${this.tablesConsolidated}`,
      `  Late Registrations: ${this.lateRegistrations}`,
      `  Blind Level Changes: ${this.blindLevelChanges}`,
      `  Error Recoveries: ${this.errorRecoveries}`,
    ].join("\n");

    return baseSummary.replace(
      /={60}\n$/,
      mtStats + "\n" + "=".repeat(60) + "\n",
    );
  }
}

// CLI Runner
async function main() {
  console.log("\n🎰 Starting Multi-Table Tournament Simulation\n");
  console.log("This may take 10-15 minutes...\n");

  const simulation = new MultiTableSimulation({
    verboseLogging: process.argv.includes("--verbose"),
    playerCount: process.argv.includes("--small") ? 18 : 30,
  });

  const result = await simulation.run();
  console.log(simulation.getSummary());

  process.exit(result.success ? 0 : 1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Simulation failed:", error);
    process.exit(1);
  });
}

export { MULTI_TABLE_CONFIG };
