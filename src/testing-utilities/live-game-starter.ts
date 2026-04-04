/**
 * Live Game Starter Utility
 *
 * Simple utility to start a live game through the proper NestJS services.
 * This ensures games use the shared EventEmitter and broadcast to WebSocket clients.
 *
 * Usage in any NestJS service/controller:
 * ```typescript
 * constructor(private liveGameStarter: LiveGameStarterService) {}
 *
 * async someMethod() {
 *   const gameUrl = await this.liveGameStarter.start({
 *     botCount: 5,
 *     smallBlind: 5,
 *     bigBlind: 10,
 *   })
 *   console.log(`Game ready at: ${gameUrl}`)
 * }
 * ```
 */

import { Injectable, Logger } from "@nestjs/common";
import { LiveGameManagerService } from "../services/game/live-game-manager.service";

export interface LiveGameStarterConfig {
  botCount?: number;
  smallBlind?: number;
  bigBlind?: number;
  startingChips?: number;
}

@Injectable()
export class LiveGameStarterService {
  private readonly logger = new Logger("LiveGameStarter");
  private activeGameId: string | null = null;

  constructor(private readonly liveGameManager: LiveGameManagerService) {}

  /**
   * Start a live game with bots
   * Returns the game URL for the React frontend
   */
  async start(config: LiveGameStarterConfig = {}): Promise<string> {
    // If a game is already running, return its URL
    if (this.activeGameId) {
      this.logger.log(`Game already running: ${this.activeGameId}`);
      return `http://localhost:5173/games/${this.activeGameId}`;
    }

    const gameId = "live-" + Date.now();
    const tableId = gameId; // Use same ID so WebSocket subscription matches

    this.logger.log(`🎮 Starting live game: ${gameId}`);

    try {
      // Create game through LiveGameManagerService
      // This ensures it uses the shared EventEmitter2
      const game = await this.liveGameManager.createGame({
        tableId,
        gameDbId: gameId,
        smallBlind: config.smallBlind ?? 5,
        bigBlind: config.bigBlind ?? 10,
        startingChips: config.startingChips ?? 1000,
      });

      // Add bots
      const botCount = config.botCount ?? 5;
      const botNames = [
        "Alice",
        "Bob",
        "Charlie",
        "Diana",
        "Eve",
        "Frank",
        "Grace",
        "Henry",
        "Iris",
      ];

      this.logger.log(`👥 Adding ${botCount} bots...`);
      for (let i = 0; i < botCount && i < botNames.length; i++) {
        game.addPlayer({
          id: `bot-${i}`,
          name: botNames[i],
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
          chips: config.startingChips ?? 1000,
        });
      }

      this.activeGameId = gameId;

      this.logger.log(`✅ Game created: ${gameId}`);

      // Start game in background (don't await, let it run)
      game.startGame().catch((e) => {
        this.logger.error(`Game error: ${e.message}`);
        this.activeGameId = null;
      });

      const gameUrl = `http://localhost:5173/games/${gameId}`;
      this.logger.log(`🌐 Game URL: ${gameUrl}`);

      return gameUrl;
    } catch (e) {
      this.logger.error(`Failed to start game: ${(e as Error).message}`);
      throw e;
    }
  }

  /**
   * Get the current active game URL
   */
  getActiveGameUrl(): string | null {
    if (!this.activeGameId) return null;
    return `http://localhost:5173/games/${this.activeGameId}`;
  }

  /**
   * Check if a game is active
   */
  isGameActive(): boolean {
    return this.activeGameId !== null;
  }
}
