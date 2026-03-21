/**
 * Game Flow Monster - FAST VERSION
 *
 * Validates game state consistency and invariants.
 * Optimized: snapshot validation instead of 60-second monitoring.
 *
 * Target: < 15 seconds
 */

import { BaseMonster } from "../shared/base-monster";
import {
  RunConfig,
  GameStateSnapshot,
  normalizeCardsToStrings,
} from "../shared/types";
import { getEnv, requireBackendHealthy, runMonsterCli } from "../shared";
import { runCriticalInvariantChecks } from "../invariant-monster/poker-invariants";

export class GameFlowMonster extends BaseMonster {
  private baseUrl: string;

  constructor() {
    super({
      name: "Game Flow Monster",
      type: "api",
      timeout: 60000, // 1 minute max
      verbose: true,
    });
    const env = getEnv();
    this.baseUrl = env.apiBaseUrl.replace("/api/v1", "");
  }

  protected async setup(_runConfig: RunConfig): Promise<void> {
    this.log("Setting up Game Flow Monster (Fast Mode)...");
    await requireBackendHealthy();
  }

  protected async execute(_runConfig: RunConfig): Promise<void> {
    this.log("Validating game flows...\n");

    // Fetch all data in parallel
    const [games, tournaments, leaderboard] = await Promise.all([
      this.fetchGames(),
      this.fetchTournaments(),
      this.fetchLeaderboard(),
    ]);

    this.log(`Found ${games.length} games, ${tournaments.length} tournaments`);

    // Validate games in parallel
    const gameResults = await Promise.all(
      games.slice(0, 10).map((g) => this.validateGame(g)),
    );

    // Validate tournament tables
    for (const tournament of tournaments.slice(0, 3)) {
      await this.validateTournamentTables(tournament);
    }

    // Validate leaderboard
    this.validateLeaderboard(leaderboard);

    // Cross-validate: check for chip consistency
    await this.validateChipConsistency(games);

    this.printSummary();
  }

  protected async teardown(): Promise<void> {}

  private async fetchGames(): Promise<any[]> {
    const response = await this.fetch(`${this.baseUrl}/api/v1/games`);
    if (!response.ok || !Array.isArray(response.data)) return [];
    return response.data;
  }

  private async fetchTournaments(): Promise<any[]> {
    const response = await this.fetch(`${this.baseUrl}/api/v1/tournaments`);
    if (!response.ok || !Array.isArray(response.data)) return [];
    return response.data.filter((t: any) => t.status === "running");
  }

  private async fetchLeaderboard(): Promise<any[]> {
    const response = await this.fetch(
      `${this.baseUrl}/api/v1/games/leaderboard`,
    );
    if (!response.ok || !Array.isArray(response.data)) return [];
    return response.data;
  }

  private async validateGame(game: any): Promise<boolean> {
    const response = await this.fetch(
      `${this.baseUrl}/api/v1/games/${game.id}/state`,
    );

    if (!response.ok) {
      this.addFinding({
        category: "BUG",
        severity: "high",
        title: "Cannot fetch game state",
        description: `Game ${game.id} returns ${response.status}`,
        location: { endpoint: `/api/v1/games/${game.id}/state` },
        reproducible: true,
        tags: ["flow", "api"],
      });
      this.recordTest(false);
      return false;
    }

    const state = this.parseGameState(response.data);
    if (!state) {
      this.recordTest(true);
      return true;
    }

    // Run invariant checks
    const results = runCriticalInvariantChecks({ after: state });
    const violations = results.filter((r) => !r.passed);

    if (violations.length > 0) {
      for (const v of violations) {
        this.addFinding({
          category: "BUG",
          severity: "critical",
          title: `Game invariant: ${(v as any).invariantName}`,
          description: v.message || "Invariant failed",
          location: { endpoint: `/api/v1/games/${game.id}` },
          evidence: v.evidence,
          reproducible: true,
          tags: ["flow", "invariant"],
        });
      }
      this.recordTest(false);
      return false;
    }

    // Validate chip totals
    const totalChips = this.sumChips(state);
    if (totalChips <= 0 && state.players.length > 0) {
      this.addFinding({
        category: "BUG",
        severity: "critical",
        title: "Zero chips in active game",
        description: `Game ${game.id} has ${state.players.length} players but 0 total chips`,
        location: { endpoint: `/api/v1/games/${game.id}` },
        reproducible: true,
        tags: ["flow", "money"],
      });
      this.recordTest(false);
      return false;
    }

    this.recordTest(true);
    return true;
  }

  private async validateTournamentTables(tournament: any): Promise<void> {
    const response = await this.fetch(
      `${this.baseUrl}/api/v1/tournaments/${tournament.id}/state`,
    );
    if (!response.ok) return;

    const state = response.data;
    if (!state.tables || !Array.isArray(state.tables)) return;

    // Check for duplicate players across tables
    const allPlayerIds: string[] = [];
    const duplicates: string[] = [];

    for (const table of state.tables) {
      const players = table.gameState?.players || table.players || [];
      for (const player of players) {
        if (allPlayerIds.includes(player.id)) {
          duplicates.push(player.id);
        }
        allPlayerIds.push(player.id);
      }
    }

    if (duplicates.length > 0) {
      this.addFinding({
        category: "BUG",
        severity: "critical",
        title: "Duplicate players across tables",
        description: `Tournament ${tournament.id}: ${duplicates.length} player(s) at multiple tables`,
        location: { endpoint: `/api/v1/tournaments/${tournament.id}` },
        evidence: { raw: { duplicates } },
        reproducible: true,
        tags: ["flow", "tournament"],
      });
      this.recordTest(false);
    } else {
      this.recordTest(true);
    }

    // Check blind level consistency
    const levels = state.tables.map((t: any) => t.blindLevel || t.level || 1);
    const minLevel = Math.min(...levels);
    const maxLevel = Math.max(...levels);

    if (maxLevel - minLevel > 1) {
      this.addFinding({
        category: "BUG",
        severity: "high",
        title: "Inconsistent blind levels",
        description: `Tournament ${tournament.id}: levels range ${minLevel} to ${maxLevel}`,
        location: { endpoint: `/api/v1/tournaments/${tournament.id}` },
        reproducible: true,
        tags: ["flow", "tournament", "blinds"],
      });
      this.recordTest(false);
    } else {
      this.recordTest(true);
    }
  }

  private validateLeaderboard(entries: any[]): void {
    for (const entry of entries.slice(0, 10)) {
      const winnings = Number(entry.total_winnings);
      if (isNaN(winnings)) {
        this.addFinding({
          category: "BUG",
          severity: "medium",
          title: "Invalid leaderboard entry",
          description: `Entry has invalid winnings: ${entry.total_winnings}`,
          location: { endpoint: "/api/v1/games/leaderboard" },
          reproducible: true,
          tags: ["flow", "leaderboard"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }
  }

  private async validateChipConsistency(games: any[]): Promise<void> {
    // Sample a few games for deep validation
    for (const game of games.slice(0, 5)) {
      const response = await this.fetch(
        `${this.baseUrl}/api/v1/games/${game.id}/state`,
      );
      if (!response.ok) continue;

      const state = this.parseGameState(response.data);
      if (!state || state.players.length === 0) continue;

      // Check no player has negative chips
      const negativePlayers = state.players.filter((p) => p.chips < 0);
      if (negativePlayers.length > 0) {
        this.addFinding({
          category: "BUG",
          severity: "critical",
          title: "Negative chip count",
          description: `Game ${game.id}: ${negativePlayers.length} player(s) with negative chips`,
          location: { endpoint: `/api/v1/games/${game.id}` },
          reproducible: true,
          tags: ["flow", "money"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }
  }

  private parseGameState(data: any): GameStateSnapshot | null {
    if (!data || typeof data !== "object") return null;

    try {
      return {
        gameId: data.id || data.gameId || "unknown",
        timestamp: new Date(),
        stage: data.stage || data.phase || "unknown",
        pot: data.pot || 0,
        sidePots: data.sidePots || [],
        communityCards: normalizeCardsToStrings(
          data.communityCards || data.board || [],
        ),
        players: (data.players || []).map((p: any) => ({
          id: p.id || "unknown",
          name: p.name || "Unknown",
          position: p.position || 0,
          chips: p.chips || 0,
          bet: p.bet || 0,
          cards:
            p.cards || p.holeCards
              ? normalizeCardsToStrings(p.cards || p.holeCards)
              : undefined,
          folded: p.folded || false,
          allIn: p.allIn || false,
          disconnected: p.disconnected || false,
        })),
        currentBet: data.currentBet || 0,
        dealer: data.dealer || 0,
      };
    } catch {
      return null;
    }
  }

  private sumChips(state: GameStateSnapshot): number {
    const playerChips = state.players.reduce(
      (sum, p) => sum + p.chips + p.bet,
      0,
    );
    const potChips = state.pot + state.sidePots.reduce((a, b) => a + b, 0);
    return playerChips + potChips;
  }

  private printSummary(): void {
    this.log(`\n${"─".repeat(50)}`);
    this.log("GAME FLOW MONSTER SUMMARY");
    this.log(`${"─".repeat(50)}`);
    this.log(
      `Tests: ${this.testsRun} | Passed: ${this.testsPassed} | Failed: ${this.testsFailed}`,
    );
  }
}

if (require.main === module) {
  runMonsterCli(new GameFlowMonster(), "api");
}
