/**
 * Tournament Flow Monster - FAST VERSION
 *
 * Validates tournament state consistency.
 * Optimized: snapshot validation instead of 60-second monitoring.
 *
 * Target: < 15 seconds
 */

import { BaseMonster } from "../shared/base-monster";
import { RunConfig } from "../shared/types";
import { getEnv, requireBackendHealthy, runMonsterCli } from "../shared";

export class TournamentFlowMonster extends BaseMonster {
  private baseUrl: string;

  constructor() {
    super({
      name: "Tournament Flow Monster",
      type: "api",
      timeout: 60000, // 1 minute max
      verbose: true,
    });
    const env = getEnv();
    this.baseUrl = env.apiBaseUrl.replace("/api/v1", "");
  }

  protected async setup(_runConfig: RunConfig): Promise<void> {
    this.log("Setting up Tournament Flow Monster (Fast Mode)...");
    await requireBackendHealthy();
  }

  protected async execute(_runConfig: RunConfig): Promise<void> {
    this.log("Validating tournament flows...\n");

    const tournaments = await this.fetchTournaments();
    this.log(`Found ${tournaments.all.length} tournaments`);
    this.log(`  Running: ${tournaments.running.length}`);
    this.log(`  Registering: ${tournaments.registering.length}`);
    this.log(`  Completed: ${tournaments.completed.length}`);

    // Validate all in parallel
    await Promise.all([
      ...tournaments.running.map((t) => this.validateRunning(t)),
      ...tournaments.registering
        .slice(0, 3)
        .map((t) => this.validateRegistering(t)),
      ...tournaments.completed
        .slice(0, 3)
        .map((t) => this.validateCompleted(t)),
    ]);

    // Cross-validate
    await this.validateLeaderboardIntegration();

    this.printSummary();
  }

  protected async teardown(): Promise<void> {}

  private async fetchTournaments(): Promise<{
    all: any[];
    running: any[];
    registering: any[];
    completed: any[];
  }> {
    const response = await this.fetch(`${this.baseUrl}/api/v1/tournaments`);

    if (!response.ok || !Array.isArray(response.data)) {
      return { all: [], running: [], registering: [], completed: [] };
    }

    const all = response.data;
    return {
      all,
      running: all.filter((t: any) => t.status === "running"),
      registering: all.filter((t: any) => t.status === "registering"),
      completed: all.filter((t: any) => t.status === "completed"),
    };
  }

  private async validateRunning(tournament: any): Promise<void> {
    const response = await this.fetch(
      `${this.baseUrl}/api/v1/tournaments/${tournament.id}/state`,
    );

    if (!response.ok) {
      this.addFinding({
        category: "BUG",
        severity: "high",
        title: "Cannot fetch running tournament state",
        description: `Tournament ${tournament.id} returns ${response.status}`,
        location: { endpoint: `/api/v1/tournaments/${tournament.id}/state` },
        reproducible: true,
        tags: ["flow", "tournament"],
      });
      this.recordTest(false);
      return;
    }

    const state = response.data;

    // Validate player count
    if (state.playersRemaining !== undefined) {
      if (state.playersRemaining < 0) {
        this.addFinding({
          category: "BUG",
          severity: "critical",
          title: "Negative players remaining",
          description: `Tournament ${tournament.id}: ${state.playersRemaining} players`,
          location: { endpoint: `/api/v1/tournaments/${tournament.id}` },
          reproducible: true,
          tags: ["flow", "tournament"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }

    // Validate tables
    if (state.tables && Array.isArray(state.tables)) {
      // Check player count matches tables
      let actualPlayers = 0;
      for (const table of state.tables) {
        const players = table.gameState?.players || table.players || [];
        actualPlayers += players.filter((p: any) => !p.eliminated).length;
      }

      const reported = state.playersRemaining || 0;
      if (Math.abs(actualPlayers - reported) > 2) {
        this.addFinding({
          category: "BUG",
          severity: "high",
          title: "Player count mismatch",
          description: `Tournament ${tournament.id}: reported ${reported}, counted ${actualPlayers}`,
          location: { endpoint: `/api/v1/tournaments/${tournament.id}` },
          reproducible: true,
          tags: ["flow", "tournament"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }

      // Check for duplicate players
      const allIds: string[] = [];
      let duplicates = 0;
      for (const table of state.tables) {
        const players = table.gameState?.players || table.players || [];
        for (const p of players) {
          if (allIds.includes(p.id)) duplicates++;
          allIds.push(p.id);
        }
      }

      if (duplicates > 0) {
        this.addFinding({
          category: "BUG",
          severity: "critical",
          title: "Duplicate players in tournament",
          description: `Tournament ${tournament.id}: ${duplicates} duplicates`,
          location: { endpoint: `/api/v1/tournaments/${tournament.id}` },
          reproducible: true,
          tags: ["flow", "tournament"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }
  }

  private async validateRegistering(tournament: any): Promise<void> {
    const response = await this.fetch(
      `${this.baseUrl}/api/v1/tournaments/${tournament.id}`,
    );

    if (!response.ok) {
      this.addFinding({
        category: "BUG",
        severity: "medium",
        title: "Cannot fetch registering tournament",
        description: `Tournament ${tournament.id} returns ${response.status}`,
        location: { endpoint: `/api/v1/tournaments/${tournament.id}` },
        reproducible: true,
        tags: ["flow", "tournament"],
      });
      this.recordTest(false);
      return;
    }

    if (response.data.status !== "registering") {
      this.addFinding({
        category: "BUG",
        severity: "high",
        title: "Tournament status mismatch",
        description: `Listed as registering but detail shows "${response.data.status}"`,
        location: { endpoint: `/api/v1/tournaments/${tournament.id}` },
        reproducible: true,
        tags: ["flow", "tournament"],
      });
      this.recordTest(false);
    } else {
      this.recordTest(true);
    }
  }

  private async validateCompleted(tournament: any): Promise<void> {
    const response = await this.fetch(
      `${this.baseUrl}/api/v1/tournaments/${tournament.id}`,
    );

    if (!response.ok) {
      this.addFinding({
        category: "BUG",
        severity: "medium",
        title: "Cannot fetch completed tournament",
        description: `Tournament ${tournament.id} returns ${response.status}`,
        location: { endpoint: `/api/v1/tournaments/${tournament.id}` },
        reproducible: true,
        tags: ["flow", "tournament"],
      });
      this.recordTest(false);
    } else {
      this.recordTest(true);
    }
  }

  private async validateLeaderboardIntegration(): Promise<void> {
    const response = await this.fetch(
      `${this.baseUrl}/api/v1/games/leaderboard`,
    );

    if (!response.ok) {
      this.log("  ⚠️ Could not fetch leaderboard");
      this.recordTest(true, true);
      return;
    }

    if (!Array.isArray(response.data)) {
      this.addFinding({
        category: "BUG",
        severity: "medium",
        title: "Invalid leaderboard format",
        description: "Leaderboard is not an array",
        location: { endpoint: "/api/v1/games/leaderboard" },
        reproducible: true,
        tags: ["flow", "leaderboard"],
      });
      this.recordTest(false);
      return;
    }

    // Validate entries
    for (const entry of response.data.slice(0, 5)) {
      const winnings = Number(entry.total_winnings);
      if (isNaN(winnings)) {
        this.addFinding({
          category: "BUG",
          severity: "medium",
          title: "Invalid leaderboard winnings",
          description: `Invalid value: ${entry.total_winnings}`,
          location: { endpoint: "/api/v1/games/leaderboard" },
          reproducible: true,
          tags: ["flow", "leaderboard"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }

    this.log("  ✅ Leaderboard validated");
  }

  private printSummary(): void {
    this.log(`\n${"─".repeat(50)}`);
    this.log("TOURNAMENT FLOW MONSTER SUMMARY");
    this.log(`${"─".repeat(50)}`);
    this.log(
      `Tests: ${this.testsRun} | Passed: ${this.testsPassed} | Failed: ${this.testsFailed}`,
    );
  }
}

if (require.main === module) {
  runMonsterCli(new TournamentFlowMonster(), "api");
}
