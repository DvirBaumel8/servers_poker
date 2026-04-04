/**
 * GameHotStateService
 * ====================
 * Maintains a per-action Redis snapshot ("hot state") for every live game.
 *
 * Hot/Cold model:
 *   HOT  (Redis) — updated after every player action; includes strategy; TTL 4h.
 *   COLD (Postgres) — updated on a 30-second interval; source of truth for history.
 *
 * Recovery path: GameRecoveryService checks Redis first (fresher + has strategy),
 * falls back to Postgres for games missing from Redis.
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { RedisService } from "../../common/redis/redis.service";
import { RecoverySnapshot } from "./live-game-manager.service";

const HOT_KEY_PREFIX = "hot:game:";
const HOT_TTL_SECONDS = 4 * 60 * 60; // 4 hours

@Injectable()
export class GameHotStateService implements OnModuleInit {
  private readonly logger = new Logger(GameHotStateService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.eventEmitter.on(
      "game.hotState",
      (event: { gameId: string; snapshot: RecoverySnapshot }) => {
        this.writeHotState(event.gameId, event.snapshot).catch((err) =>
          this.logger.error(
            `Failed to write hot state for ${event.gameId}: ${err.message}`,
          ),
        );
      },
    );

    this.eventEmitter.on("game.finished", (event: { gameId: string }) => {
      this.redis
        .del(HOT_KEY_PREFIX + event.gameId)
        .catch((err) =>
          this.logger.error(
            `Failed to delete hot state for ${event.gameId}: ${err.message}`,
          ),
        );
    });
  }

  private async writeHotState(
    gameId: string,
    snapshot: RecoverySnapshot,
  ): Promise<void> {
    await this.redis.set(
      HOT_KEY_PREFIX + gameId,
      JSON.stringify(snapshot),
      HOT_TTL_SECONDS,
    );
  }

  async getHotState(gameId: string): Promise<RecoverySnapshot | null> {
    try {
      const raw = await this.redis.get(HOT_KEY_PREFIX + gameId);
      if (!raw) return null;
      return JSON.parse(raw) as RecoverySnapshot;
    } catch {
      return null;
    }
  }

  async scanActiveHotStates(): Promise<RecoverySnapshot[]> {
    try {
      const keys = await this.redis.scan(`${HOT_KEY_PREFIX}*`);
      const results: RecoverySnapshot[] = [];
      for (const key of keys) {
        const raw = await this.redis.get(key);
        if (!raw) continue;
        try {
          results.push(JSON.parse(raw) as RecoverySnapshot);
        } catch {
          // skip malformed entries
        }
      }
      return results;
    } catch {
      return [];
    }
  }
}
