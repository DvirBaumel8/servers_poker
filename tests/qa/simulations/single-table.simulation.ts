/**
 * Single-Table Tournament Simulation
 * ===================================
 *
 * Run on: Daily / Pull Request
 * Duration: ~2-5 minutes
 *
 * Tests:
 * - 9-player single table tournament
 * - Player elimination flow
 * - Blind level advancement
 * - Tournament completion with winner
 * - Prize distribution (if applicable)
 * - Chip conservation throughout
 *
 * This simulation validates the core tournament mechanics work correctly.
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
import { TournamentDirectorService } from "../../../src/modules/tournaments/tournament-director.service";
import { TournamentRepository } from "../../../src/repositories/tournament.repository";
import { BotRepository } from "../../../src/repositories/bot.repository";
import { TournamentsModule } from "../../../src/modules/tournaments/tournaments.module";
import { GamesModule } from "../../../src/modules/games/games.module";
import { BotsModule } from "../../../src/modules/bots/bots.module";
import { ServicesModule } from "../../../src/services/services.module";

const SINGLE_TABLE_CONFIG: SimulationConfig = {
  name: "SingleTable-9Player-Tournament",
  playerCount: 9,
  startingChips: 5000,
  maxHands: 500,
  maxDurationMs: 300000, // 5 minutes max
  blinds: { small: 25, big: 50, ante: 5 },
  tournamentMode: true,
  verboseLogging: false,
  validateAfterEachHand: true,
};

export class SingleTableSimulation extends SimulationRunner {
  private testModule: TestingModule | null = null;
  private tournamentDirector: TournamentDirectorService | null = null;
  private tournamentRepository: TournamentRepository | null = null;
  private botRepository: BotRepository | null = null;
  private tournamentId: string = "";
  private botIds: string[] = [];
  private userId: string = "";

  constructor(config: Partial<SimulationConfig> = {}) {
    super({ ...SINGLE_TABLE_CONFIG, ...config });
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
    this.botRepository = this.testModule.get(BotRepository);
    this.eventEmitter = this.testModule.get(EventEmitter2);

    this.log("Database ready");
  }

  protected async setupTestData(): Promise<void> {
    this.log("Setting up tournament and players...");

    // Create a test user
    this.userId = crypto.randomUUID();
    await this.dataSource!.query(
      `
      INSERT INTO users (id, email, name, password_hash, api_key_hash, role, active, email_verified, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'user', true, true, NOW(), NOW())
    `,
      [
        this.userId,
        `simtest_${Date.now()}@test.com`,
        "SimTestUser",
        "hashed",
        "0".repeat(64),
      ],
    );

    // Create bots in database
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
          `SimBot${i + 1}`,
          `http://localhost:${port}/action`,
        ],
      );

      this.botIds.push(botId);
    }

    // Create tournament
    this.tournamentId = crypto.randomUUID();
    await this.dataSource!.query(
      `
      INSERT INTO tournaments (
        id, name, type, status, buy_in, starting_chips, 
        min_players, max_players, players_per_table,
        turn_timeout_ms, late_reg_ends_level, rebuys_allowed,
        created_at, updated_at
      )
      VALUES ($1, $2, 'rolling', 'registering', 100, $3, 2, 9, 9, 5000, 4, false, NOW(), NOW())
    `,
      [
        this.tournamentId,
        `SimTournament_${Date.now()}`,
        this.config.startingChips,
      ],
    );

    // Create blind levels
    const blindLevels = [
      { level: 1, small: 25, big: 50, ante: 5 },
      { level: 2, small: 50, big: 100, ante: 10 },
      { level: 3, small: 75, big: 150, ante: 15 },
      { level: 4, small: 100, big: 200, ante: 20 },
      { level: 5, small: 150, big: 300, ante: 30 },
      { level: 6, small: 200, big: 400, ante: 40 },
      { level: 7, small: 300, big: 600, ante: 60 },
      { level: 8, small: 500, big: 1000, ante: 100 },
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

    // Register all bots in tournament
    for (const botId of this.botIds) {
      await this.dataSource!.query(
        `
        INSERT INTO tournament_entries (id, tournament_id, bot_id, entry_type, created_at, updated_at)
        VALUES ($1, $2, $3, 'initial', NOW(), NOW())
      `,
        [crypto.randomUUID(), this.tournamentId, botId],
      );
    }

    this.log(
      `Created tournament ${this.tournamentId} with ${this.botIds.length} players`,
    );
  }

  protected async executeSimulation(): Promise<void> {
    this.log("Starting tournament...");

    try {
      // Start the tournament
      await this.tournamentDirector!.startTournament(this.tournamentId);
      this.log("Tournament started successfully");
    } catch (error) {
      // May throw duplicate blind level error but still start
      this.log(`Tournament start returned: ${error}`);
    }

    // Monitor tournament progress
    const startTime = Date.now();
    let lastHandCount = 0;
    let lastPlayerCount = this.config.playerCount;
    let checkCount = 0;
    let stuckCounter = 0;

    while (Date.now() - startTime < this.config.maxDurationMs!) {
      await this.sleep(1000);
      checkCount++;

      const state = this.tournamentDirector!.getTournamentState(
        this.tournamentId,
      );

      if (!state) {
        // Check if tournament finished
        const tournament = await this.tournamentRepository!.findById(
          this.tournamentId,
        );
        if (tournament?.status === "finished") {
          this.log("Tournament finished!");
          await this.updateFinalStateFromDb();
          break;
        }
        this.recordWarning({
          type: "state_unavailable",
          message: "Tournament state not available",
        });
        continue;
      }

      // Count total hands across all tables
      let totalHands = 0;
      let totalActivePlayers = 0;
      let runningTables = 0;
      let errorTables = 0;

      for (const table of state.tables || []) {
        const hand = table.gameState?.handNumber || 0;
        totalHands += hand;

        const activePlayers = (table.gameState?.players || []).filter(
          (p: any) => Number(p.chips) > 0,
        ).length;
        totalActivePlayers += activePlayers;

        if (table.gameState?.status === "running") runningTables++;
        if (table.gameState?.status === "error") errorTables++;
      }

      this.result.handsPlayed = Math.max(this.result.handsPlayed, totalHands);

      // Check for progress
      if (totalHands > lastHandCount || totalActivePlayers < lastPlayerCount) {
        stuckCounter = 0;
        lastHandCount = totalHands;
        lastPlayerCount = totalActivePlayers;

        if (this.config.verboseLogging || checkCount % 10 === 0) {
          this.log(
            `Level ${state.level} | Hands: ${totalHands} | ` +
              `Active: ${totalActivePlayers}/${this.config.playerCount} | ` +
              `Tables: ${runningTables} running, ${errorTables} error`,
          );
        }
      } else {
        stuckCounter++;
        if (stuckCounter > 30) {
          // 30 seconds with no progress
          this.recordError({
            type: "tournament_stuck",
            message: `Tournament stuck for ${stuckCounter} seconds`,
            severity: "error",
            context: {
              hands: totalHands,
              players: totalActivePlayers,
              tables: state.tables?.length,
              runningTables,
              errorTables,
            },
          });
        }
      }

      // Check for errors
      if (errorTables > 0) {
        this.recordWarning({
          type: "tables_in_error",
          message: `${errorTables} table(s) in error state`,
          context: { level: state.level, hands: totalHands },
        });
      }

      // Validate chip conservation
      if (this.config.validateAfterEachHand && state.tables) {
        let totalChips = 0;
        for (const table of state.tables) {
          for (const player of table.gameState?.players || []) {
            totalChips += Number(player.chips) || 0;
          }
          totalChips += Number(table.gameState?.pot) || 0;
        }

        const expected = this.config.playerCount * this.config.startingChips;
        if (totalChips !== expected && totalChips > 0) {
          this.recordError({
            type: "chip_conservation_violation",
            message: `Expected ${expected} chips, found ${totalChips}`,
            severity: "critical",
            context: { expected, actual: totalChips, hands: totalHands },
          });
        }
      }

      // Check for completion
      if (totalActivePlayers === 1) {
        this.log("Single player remaining - tournament should finish soon");
        await this.sleep(3000);
        await this.updateFinalStateFromDb();
        break;
      }

      // Check for tournament completion from status
      if (state.status === "finished") {
        this.log("Tournament status: finished");
        await this.updateFinalStateFromDb();
        break;
      }
    }

    // Final state update
    if (this.result.finalState.status === "not_started") {
      await this.updateFinalStateFromDb();
    }
  }

  private async updateFinalStateFromDb(): Promise<void> {
    // Get tournament results from database
    const results = await this.dataSource!.query(
      `
      SELECT e.bot_id, b.name, e.finish_position, e.payout
      FROM tournament_entries e
      JOIN bots b ON b.id = e.bot_id
      WHERE e.tournament_id = $1
      ORDER BY e.finish_position ASC NULLS LAST
    `,
      [this.tournamentId],
    );

    // Get current state for chip counts
    const state = this.tournamentDirector!.getTournamentState(
      this.tournamentId,
    );

    const chipDist: Record<string, number> = {};
    let totalChips = 0;
    let playersRemaining = 0;
    let winner: string | undefined;
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
        if (chips > 0 && !seat.busted) playersRemaining++;
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

    // Find winner from results or chip distribution
    const dbWinner = results.find((r: any) => r.finish_position === 1);
    if (dbWinner) {
      winner = dbWinner.name;
    } else if (playersRemaining === 1) {
      winner = Object.entries(chipDist).find(([_, chips]) => chips > 0)?.[0];
    }

    const tournament = await this.tournamentRepository!.findById(
      this.tournamentId,
    );

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
    // Tournament-specific assertions

    // Hands were played
    this.assert(
      "hands_played",
      this.result.handsPlayed >= 10,
      `Tournament should play at least 10 hands`,
      ">= 10",
      this.result.handsPlayed,
    );

    // Players were eliminated
    const eliminated =
      this.config.playerCount - this.result.finalState.playersRemaining;
    this.assert(
      "eliminations_occurred",
      eliminated > 0 || this.result.finalState.status === "finished",
      `Should have eliminations or finish`,
      "> 0 or finished",
      `${eliminated} eliminated, status: ${this.result.finalState.status}`,
    );

    // Check results in database
    const results = await this.dataSource!.query(
      `
      SELECT COUNT(*) as count FROM tournament_entries 
      WHERE tournament_id = $1 AND finish_position IS NOT NULL
    `,
      [this.tournamentId],
    );

    const finishedCount = parseInt(results[0].count);
    this.assert(
      "finish_positions_recorded",
      finishedCount >= eliminated,
      `Eliminated players should have finish positions`,
      `>= ${eliminated}`,
      finishedCount,
    );

    // Check leaderboard consistency
    const seats = await this.dataSource!.query(
      `
      SELECT COUNT(*) as count FROM tournament_seats WHERE tournament_id = $1
    `,
      [this.tournamentId],
    );

    this.assert(
      "seats_created",
      parseInt(seats[0].count) > 0,
      `Tournament seats should be created in database`,
      "> 0",
      seats[0].count,
    );
  }
}

// CLI Runner
async function main() {
  console.log("\n🎰 Starting Single-Table Tournament Simulation\n");

  const simulation = new SingleTableSimulation({
    verboseLogging: process.argv.includes("--verbose"),
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

export { SINGLE_TABLE_CONFIG };
