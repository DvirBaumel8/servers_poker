/**
 * Invariant Monster - FAST VERSION
 *
 * Validates poker game invariants (financial integrity, card rules).
 * Optimized for speed: snapshot validation instead of continuous monitoring.
 *
 * Target: < 10 seconds
 */

import {
  BaseMonster,
  RunConfig,
  GameStateSnapshot,
  InvariantContext,
  getEnv,
  requireBackendHealthy,
  runMonsterCli,
  normalizeCardsToStrings,
} from "../shared";
import { ALL_INVARIANTS, runCriticalInvariantChecks } from "./poker-invariants";

export class InvariantMonster extends BaseMonster {
  private baseUrl: string;

  constructor() {
    super({
      name: "Invariant Monster",
      type: "invariant",
      timeout: 60000, // 1 minute max
      verbose: true,
    });
    const env = getEnv();
    this.baseUrl = env.apiBaseUrl.replace(/\/api\/v1$/, "");
  }

  protected async setup(_runConfig: RunConfig): Promise<void> {
    this.log("Setting up Invariant Monster (Fast Mode)...");
    await requireBackendHealthy({ retries: 2, retryDelay: 500 });
    this.log(`Loaded ${ALL_INVARIANTS.length} invariants`);
  }

  protected async execute(_runConfig: RunConfig): Promise<void> {
    this.log("Running invariant validation...\n");

    // Parallel fetch all data
    const [games, tournaments] = await Promise.all([
      this.fetchGames(),
      this.fetchTournaments(),
    ]);

    this.log(`Found ${games.length} games, ${tournaments.length} tournaments`);

    // Validate all games in parallel
    await Promise.all(games.map((g) => this.validateGame(g)));

    // Validate all tournaments in parallel
    await Promise.all(tournaments.map((t) => this.validateTournament(t)));

    this.printSummary();
  }

  protected async teardown(): Promise<void> {}

  private async fetchGames(): Promise<any[]> {
    const response = await this.fetch(`${this.baseUrl}/api/v1/games`);
    if (!response.ok || !Array.isArray(response.data)) return [];
    return response.data.filter((g: any) => g.players?.length > 0);
  }

  private async fetchTournaments(): Promise<any[]> {
    const response = await this.fetch(`${this.baseUrl}/api/v1/tournaments`);
    if (!response.ok || !Array.isArray(response.data)) return [];
    return response.data.filter((t: any) => t.status === "running");
  }

  private async validateGame(game: any): Promise<void> {
    const response = await this.fetch(
      `${this.baseUrl}/api/v1/games/${game.id}/state`,
    );
    if (!response.ok) return;

    const state = this.parseGameState(response.data);
    if (!state) return;

    const ctx: InvariantContext = { after: state };
    const results = runCriticalInvariantChecks(ctx);

    for (const result of results) {
      if (!result.passed) {
        this.addFinding({
          category: "BUG",
          severity: "critical",
          title: `INVARIANT VIOLATION: ${(result as any).invariantName}`,
          description: result.message || "Invariant check failed",
          location: { endpoint: `/api/v1/games/${game.id}/state` },
          evidence: result.evidence,
          reproducible: true,
          reproductionSteps: [
            `GET /api/v1/games/${game.id}/state`,
            `Invariant "${(result as any).invariantName}" fails`,
          ],
          tags: ["invariant", (result as any).category || "unknown"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }
  }

  private async validateTournament(tournament: any): Promise<void> {
    const response = await this.fetch(
      `${this.baseUrl}/api/v1/tournaments/${tournament.id}/state`,
    );
    if (!response.ok) return;

    const state = response.data;

    // Basic tournament invariants
    if (state.playersRemaining !== undefined && state.playersRemaining < 0) {
      this.addFinding({
        category: "BUG",
        severity: "critical",
        title: "Negative players remaining",
        description: `Tournament has ${state.playersRemaining} players`,
        location: { endpoint: `/api/v1/tournaments/${tournament.id}` },
        reproducible: true,
        tags: ["invariant", "tournament"],
      });
      this.recordTest(false);
    } else {
      this.recordTest(true);
    }

    // Check tables in parallel
    if (state.tables && Array.isArray(state.tables)) {
      await Promise.all(
        state.tables.map(async (table: any) => {
          if (!table.gameState) return;

          const gameState = this.parseGameState(table.gameState);
          if (!gameState) return;

          const ctx: InvariantContext = { after: gameState };
          const results = runCriticalInvariantChecks(ctx);

          for (const result of results) {
            if (!result.passed) {
              this.addFinding({
                category: "BUG",
                severity: "critical",
                title: `Tournament table: ${(result as any).invariantName}`,
                description: `Table ${table.tableId}: ${result.message}`,
                location: { endpoint: `/api/v1/tournaments/${tournament.id}` },
                evidence: result.evidence,
                reproducible: true,
                tags: ["invariant", "tournament", (result as any).category],
              });
              this.recordTest(false);
            } else {
              this.recordTest(true);
            }
          }
        }),
      );
    }
  }

  private parseGameState(data: any): GameStateSnapshot | null {
    if (!data || typeof data !== "object") return null;

    try {
      return {
        gameId: data.id || data.gameId || data.game_id || "unknown",
        timestamp: new Date(),
        stage: data.stage || data.status || "unknown",
        pot: data.pot || 0,
        sidePots: data.sidePots || data.side_pots || [],
        communityCards: normalizeCardsToStrings(
          data.communityCards || data.community_cards || data.board || [],
        ),
        players: (data.players || []).map((p: any) => ({
          id: p.id || p.playerId || p.player_id || "unknown",
          name: p.name || p.username || "Unknown",
          position: p.position || 0,
          chips: p.chips || p.stack || 0,
          bet: p.bet || p.currentBet || p.current_bet || 0,
          cards:
            p.cards || p.holeCards || p.hole_cards
              ? normalizeCardsToStrings(p.cards || p.holeCards || p.hole_cards)
              : undefined,
          folded: p.folded || p.hasFolded || p.has_folded || false,
          allIn: p.allIn || p.isAllIn || p.is_all_in || false,
          disconnected: p.disconnected || false,
        })),
        currentBet: data.currentBet || data.current_bet || 0,
        dealer: data.dealer || data.dealerPosition || data.dealer_position || 0,
        activePlayer:
          data.activePlayer ||
          data.currentPlayer ||
          data.active_player ||
          data.current_player,
      };
    } catch {
      return null;
    }
  }

  private printSummary(): void {
    this.log(`\n${"─".repeat(50)}`);
    this.log("INVARIANT MONSTER SUMMARY");
    this.log(`${"─".repeat(50)}`);
    this.log(
      `Tests: ${this.testsRun} | Passed: ${this.testsPassed} | Failed: ${this.testsFailed}`,
    );

    if (this.testsFailed > 0) {
      this.logError(`⚠️  VIOLATIONS DETECTED`);
    } else {
      this.log(`✅ All invariants passed`);
    }
  }
}

if (require.main === module) {
  runMonsterCli(new InvariantMonster(), "invariant");
}
