/**
 * GameMonitorService
 * ==================
 * Monitors live game instances via Redis heartbeats.
 *
 * Flow:
 *   1. Listens for "game.heartbeat" events (emitted every 4s by GameInstance).
 *   2. Writes heartbeat data to Redis: game:heartbeat:{tableId}, TTL 60s.
 *   3. Every 12s, scans all running games and checks heartbeat age.
 *   4. If age > STALE_THRESHOLD_MS (default 30s), emits "game.monitor.stuck".
 *   5. Cleans up heartbeat key on "game.finished".
 */

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { RedisService } from "../../common/redis/redis.service";
import { LiveGameManagerService } from "./live-game-manager.service";

const HEARTBEAT_KEY_PREFIX = "game:heartbeat:";
const HEARTBEAT_TTL_S = 60;

@Injectable()
export class GameMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GameMonitorService.name);
  private monitorInterval: NodeJS.Timeout | null = null;
  private readonly STALE_THRESHOLD_MS: number;
  private readonly MONITOR_INTERVAL_MS: number;

  constructor(
    private readonly liveGameManager: LiveGameManagerService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {
    this.STALE_THRESHOLD_MS = this.configService.get<number>(
      "GAME_MONITOR_STALE_MS",
      30000,
    );
    this.MONITOR_INTERVAL_MS = this.configService.get<number>(
      "GAME_MONITOR_INTERVAL_MS",
      12000,
    );
  }

  onModuleInit(): void {
    // Persist heartbeat to Redis whenever a game emits one
    this.eventEmitter.on(
      "game.heartbeat",
      (e: { tableId: string; gameId: string; handNumber: number }) => {
        this.redis
          .set(
            HEARTBEAT_KEY_PREFIX + e.tableId,
            JSON.stringify({
              ts: Date.now(),
              handNumber: e.handNumber,
              gameId: e.gameId,
            }),
            HEARTBEAT_TTL_S,
          )
          .catch((err) =>
            this.logger.warn(
              `Heartbeat write failed for ${e.tableId}: ${err.message}`,
            ),
          );
      },
    );

    // Remove heartbeat key when a game ends naturally
    this.eventEmitter.on("game.finished", (e: { tableId: string }) => {
      this.redis
        .del(HEARTBEAT_KEY_PREFIX + e.tableId)
        .catch((err) =>
          this.logger.warn(
            `Heartbeat cleanup failed for ${e.tableId}: ${err.message}`,
          ),
        );
    });

    this.monitorInterval = setInterval(
      () =>
        this.checkHeartbeats().catch((err) =>
          this.logger.error(`Monitor check error: ${err.message}`, err.stack),
        ),
      this.MONITOR_INTERVAL_MS,
    );

    this.logger.log(
      `GameMonitorService started (interval: ${this.MONITOR_INTERVAL_MS}ms, stale threshold: ${this.STALE_THRESHOLD_MS}ms)`,
    );
  }

  onModuleDestroy(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  private async checkHeartbeats(): Promise<void> {
    const allGames = this.liveGameManager.getAllGames();
    const running = allGames.filter((g) => g.game.running);
    let stuckCount = 0;
    const now = Date.now();

    for (const liveGame of running) {
      try {
        const raw = await this.redis.get(
          HEARTBEAT_KEY_PREFIX + liveGame.tableId,
        );
        if (!raw) {
          // Game started recently, no heartbeat written yet — skip
          continue;
        }
        const hb = JSON.parse(raw) as {
          ts: number;
          handNumber: number;
          gameId: string;
        };
        const ageMs = now - hb.ts;
        if (ageMs > this.STALE_THRESHOLD_MS) {
          stuckCount++;
          this.logger.error(
            `[Monitor] Table ${liveGame.tableId} stuck at hand ${hb.handNumber} ` +
              `(silent ${Math.floor(ageMs / 1000)}s). Initiating recovery.`,
          );
          this.eventEmitter.emit("game.monitor.stuck", {
            tableId: liveGame.tableId,
            gameId: hb.gameId,
            handNumber: hb.handNumber,
          });
        }
      } catch (err: any) {
        this.logger.warn(
          `Monitor check failed for ${liveGame.tableId}: ${err.message}`,
        );
      }
    }

    this.logger.log(
      `Monitor: ${running.length} active tables, ${stuckCount} stuck.`,
    );
  }
}
