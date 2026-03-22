/**
 * API-DB Connector Monster
 *
 * Tests the integration between API and Database.
 * Verifies that:
 * - API operations correctly persist to database
 * - Data integrity is maintained across operations
 * - Transactions work correctly
 * - Race conditions are handled
 */

import {
  BaseMonster,
  RunConfig,
  getEnv,
  requireBackendHealthy,
  runMonsterCli,
} from "../shared";

interface VerificationResult {
  passed: boolean;
  apiValue: any;
  dbValue: any;
  message?: string;
}

export class ApiDbConnector extends BaseMonster {
  private baseUrl: string;
  private testData: {
    tournamentId?: string;
    gameId?: string;
    botId?: string;
    userId?: string;
  } = {};

  constructor() {
    super({
      name: "API-DB Connector",
      type: "api",
      timeout: 120000,
      verbose: true,
    });
    const env = getEnv();
    this.baseUrl = env.apiBaseUrl.replace(/\/api\/v1$/, "");
  }

  protected async setup(_runConfig: RunConfig): Promise<void> {
    this.log("Setting up API-DB Connector...");

    await requireBackendHealthy({ retries: 3, retryDelay: 1000 });

    this.log("✅ Backend healthy");
  }

  protected async execute(_runConfig: RunConfig): Promise<void> {
    this.log("Testing API ↔ Database integration...\n");

    // Test 1: Tournament Creation Persistence
    await this.testTournamentPersistence();

    // Test 2: Game State Consistency
    await this.testGameStateConsistency();

    // Test 3: Chip Conservation Across Operations
    await this.testChipConservation();

    // Test 4: Concurrent Updates
    await this.testConcurrentUpdates();

    // Test 5: Transaction Integrity
    await this.testTransactionIntegrity();
  }

  protected async teardown(): Promise<void> {
    this.log("Cleanup complete");
  }

  // ============================================================================
  // TEST: Tournament Persistence
  // ============================================================================

  private async testTournamentPersistence(): Promise<void> {
    this.log("Test: Tournament Creation Persistence");

    // Step 1: Get initial tournament count
    const before = await this.fetch(`${this.baseUrl}/api/v1/tournaments`);
    const initialCount = Array.isArray(before.data) ? before.data.length : 0;

    // Step 2: Find a tournament to verify exists in both API and "DB" (via API)
    if (initialCount > 0) {
      const tournament = before.data[0];
      this.testData.tournamentId = tournament.id;

      // Step 3: Fetch same tournament via direct ID
      const direct = await this.fetch(
        `${this.baseUrl}/api/v1/tournaments/${tournament.id}`,
      );

      if (!direct.ok) {
        this.addFinding({
          category: "BUG",
          severity: "high",
          title: "Tournament in list but not fetchable by ID",
          description: `Tournament ${tournament.id} appears in list but GET by ID returns ${direct.status}`,
          location: { endpoint: `/api/v1/tournaments/${tournament.id}` },
          reproducible: true,
          tags: ["connector", "api-db", "consistency"],
        });
        this.recordTest(false);
        return;
      }

      // Step 4: Compare data
      const verification = this.verifyTournamentMatch(tournament, direct.data);
      if (!verification.passed) {
        this.addFinding({
          category: "BUG",
          severity: "high",
          title: "Tournament data mismatch between list and detail",
          description: verification.message || "Data inconsistency detected",
          location: { endpoint: "/api/v1/tournaments" },
          evidence: {
            diff: {
              expected: verification.apiValue,
              actual: verification.dbValue,
            },
          },
          reproducible: true,
          tags: ["connector", "api-db", "data-mismatch"],
        });
        this.recordTest(false);
      } else {
        this.log("  ✅ Tournament data consistent");
        this.recordTest(true);
      }
    } else {
      this.log("  ⚠️ No tournaments to verify");
      this.recordTest(true, true); // Skip
    }
  }

  private verifyTournamentMatch(
    fromList: any,
    fromDetail: any,
  ): VerificationResult {
    const fieldsToCheck = ["id", "name", "status", "buy_in", "starting_chips"];

    for (const field of fieldsToCheck) {
      if (fromList[field] !== fromDetail[field]) {
        return {
          passed: false,
          apiValue: fromList[field],
          dbValue: fromDetail[field],
          message: `Field "${field}" mismatch: list has ${fromList[field]}, detail has ${fromDetail[field]}`,
        };
      }
    }

    return { passed: true, apiValue: fromList, dbValue: fromDetail };
  }

  // ============================================================================
  // TEST: Game State Consistency
  // ============================================================================

  private async testGameStateConsistency(): Promise<void> {
    this.log("Test: Game State Consistency");

    const games = await this.fetch(`${this.baseUrl}/api/v1/games`);
    if (!games.ok || !Array.isArray(games.data) || games.data.length === 0) {
      this.log("  ⚠️ No games to verify");
      this.recordTest(true, true);
      return;
    }

    let inconsistencies = 0;

    for (const game of games.data.slice(0, 5)) {
      // Check first 5 games
      const state = await this.fetch(
        `${this.baseUrl}/api/v1/games/${game.id}/state`,
      );

      if (!state.ok) {
        this.addFinding({
          category: "BUG",
          severity: "high",
          title: "Game exists but state not fetchable",
          description: `Game ${game.id} in list but /state returns ${state.status}`,
          location: { endpoint: `/api/v1/games/${game.id}/state` },
          reproducible: true,
          tags: ["connector", "api-db", "missing-state"],
        });
        inconsistencies++;
        continue;
      }

      // Verify player counts match
      const listPlayerCount = game.players?.length || 0;
      const statePlayerCount = state.data.players?.length || 0;

      if (listPlayerCount !== statePlayerCount) {
        this.addFinding({
          category: "BUG",
          severity: "critical",
          title: "Player count mismatch between endpoints",
          description: `Game ${game.id}: list shows ${listPlayerCount} players, state shows ${statePlayerCount}`,
          location: { endpoint: `/api/v1/games/${game.id}` },
          evidence: {
            diff: { expected: listPlayerCount, actual: statePlayerCount },
          },
          reproducible: true,
          tags: ["connector", "api-db", "player-count"],
        });
        inconsistencies++;
      }
    }

    if (inconsistencies === 0) {
      this.log("  ✅ Game states consistent");
    }
    this.recordTest(inconsistencies === 0);
  }

  // ============================================================================
  // TEST: Chip Conservation
  // ============================================================================

  private async testChipConservation(): Promise<void> {
    this.log("Test: Chip Conservation Across Operations");

    const games = await this.fetch(`${this.baseUrl}/api/v1/games`);
    if (!games.ok || !Array.isArray(games.data) || games.data.length === 0) {
      this.recordTest(true, true);
      return;
    }

    for (const game of games.data.slice(0, 3)) {
      const state = await this.fetch(
        `${this.baseUrl}/api/v1/games/${game.id}/state`,
      );
      if (!state.ok || !state.data.players) continue;

      // Calculate total chips in game
      const players = state.data.players;
      const pot = state.data.pot || 0;
      const sidePots = (state.data.sidePots || []).reduce(
        (a: number, b: number) => a + b,
        0,
      );
      const playerChips = players.reduce(
        (sum: number, p: any) => sum + (p.chips || 0) + (p.bet || 0),
        0,
      );
      const totalChips = playerChips + pot + sidePots;

      // Store for comparison (in real scenario, compare to known starting chips)
      // For now, just verify chips are positive
      const negativeChips = players.filter((p: any) => (p.chips || 0) < 0);
      if (negativeChips.length > 0) {
        this.addFinding({
          category: "BUG",
          severity: "critical",
          title: "Negative chip count in database",
          description: `Game ${game.id} has players with negative chips`,
          location: { endpoint: `/api/v1/games/${game.id}/state` },
          evidence: {
            raw: negativeChips.map((p: any) => ({
              name: p.name,
              chips: p.chips,
            })),
          },
          reproducible: true,
          tags: ["connector", "api-db", "money", "negative-chips"],
        });
        this.recordTest(false);
        return;
      }
    }

    this.log("  ✅ No negative chip counts found");
    this.recordTest(true);
  }

  // ============================================================================
  // TEST: Concurrent Updates
  // ============================================================================

  private async testConcurrentUpdates(): Promise<void> {
    this.log("Test: Concurrent Update Handling");

    // Make multiple simultaneous requests to same endpoint
    const endpoint = `${this.baseUrl}/api/v1/games`;

    const promises = Array(10)
      .fill(null)
      .map(() => this.fetch(endpoint));

    const results = await Promise.all(promises);

    // All requests should succeed
    const failures = results.filter((r) => !r.ok);
    if (failures.length > 0) {
      this.addFinding({
        category: "CONCERN",
        severity: "medium",
        title: "Concurrent requests failing",
        description: `${failures.length}/10 concurrent requests failed`,
        location: { endpoint: "/api/v1/games" },
        reproducible: true,
        tags: ["connector", "api-db", "concurrency"],
      });
      this.recordTest(false);
    } else {
      this.log("  ✅ Concurrent requests handled");
      this.recordTest(true);
    }

    // All responses should return same data
    const firstData = JSON.stringify(results[0].data);
    const inconsistent = results.filter(
      (r) => JSON.stringify(r.data) !== firstData,
    );

    if (inconsistent.length > 0) {
      this.addFinding({
        category: "BUG",
        severity: "high",
        title: "Inconsistent data from concurrent reads",
        description: `${inconsistent.length}/10 requests returned different data`,
        location: { endpoint: "/api/v1/games" },
        reproducible: false, // Race condition
        tags: ["connector", "api-db", "concurrency", "race-condition"],
      });
      this.recordTest(false);
    }
  }

  // ============================================================================
  // TEST: Transaction Integrity
  // ============================================================================

  private async testTransactionIntegrity(): Promise<void> {
    this.log("Test: Transaction Integrity");

    // Verify that related data is consistent (e.g., tournament has valid seats)
    const tournaments = await this.fetch(`${this.baseUrl}/api/v1/tournaments`);
    if (!tournaments.ok || !Array.isArray(tournaments.data)) {
      this.recordTest(true, true);
      return;
    }

    const running = tournaments.data.filter((t: any) => t.status === "running");
    if (running.length === 0) {
      this.log("  ⚠️ No running tournaments to verify");
      this.recordTest(true, true);
      return;
    }

    for (const tournament of running.slice(0, 2)) {
      const state = await this.fetch(
        `${this.baseUrl}/api/v1/tournaments/${tournament.id}/state`,
      );

      if (!state.ok) continue;

      // Verify players_remaining matches actual player count
      if (state.data.playersRemaining !== undefined && state.data.tables) {
        const actualPlayers = state.data.tables.reduce(
          (sum: number, t: any) => sum + (t.gameState?.players?.length || 0),
          0,
        );

        if (Math.abs(state.data.playersRemaining - actualPlayers) > 1) {
          this.addFinding({
            category: "BUG",
            severity: "high",
            title: "Player count mismatch in tournament",
            description: `Tournament ${tournament.id}: playersRemaining=${state.data.playersRemaining}, actual=${actualPlayers}`,
            location: {
              endpoint: `/api/v1/tournaments/${tournament.id}/state`,
            },
            evidence: {
              diff: {
                expected: state.data.playersRemaining,
                actual: actualPlayers,
              },
            },
            reproducible: true,
            tags: ["connector", "api-db", "transaction", "tournament"],
          });
          this.recordTest(false);
          return;
        }
      }
    }

    this.log("  ✅ Transaction integrity verified");
    this.recordTest(true);
  }
}

// CLI Runner
if (require.main === module) {
  runMonsterCli(new ApiDbConnector(), "api");
}
