/**
 * GameRecoveryService
 * ====================
 * Hot/Cold recovery model:
 *
 *   1. Scan Redis for hot-state keys ("hot:game:*") — these are written after
 *      every player action and include player strategies.
 *   2. Fall back to Postgres snapshots for games not in Redis.
 *   3. When both sources have the same gameId, prefer the one with the higher
 *      action_seq (i.e., the most recently written state).
 *   4. Idempotency: LiveGameManagerService.recoverFromSnapshot() already guards
 *      against double-recovery via liveGames.has(tableId).
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { GameStatePersistenceService } from "./game-state-persistence.service";
import { GameHotStateService } from "./game-hot-state.service";
import { BotRepository } from "../../repositories/bot.repository";
import { RedisService } from "../../common/redis/redis.service";
import { RecoverySnapshot } from "./live-game-manager.service";

export interface RecoveryResult {
  totalFound: number;
  recovered: number;
  orphaned: number;
  errors: string[];
}

/** Uniform candidate type used during the merge phase. */
interface RecoveryCandidate {
  snapshot: RecoverySnapshot;
  source: "hot" | "cold";
  lastActionAt: Date;
}

@Injectable()
export class GameRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(GameRecoveryService.name);
  private readonly autoRecoverEnabled: boolean;
  private readonly recoveryDelayMs: number;
  private readonly maxRecoveryWindowMs: number;

  constructor(
    private readonly persistenceService: GameStatePersistenceService,
    private readonly hotStateService: GameHotStateService,
    private readonly botRepository: BotRepository,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.autoRecoverEnabled =
      this.configService.get<string>("GAME_AUTO_RECOVER", "true") === "true";
    this.recoveryDelayMs = this.configService.get<number>(
      "GAME_RECOVERY_DELAY_MS",
      5000,
    );
    this.maxRecoveryWindowMs =
      this.configService.get<number>("GAME_STATE_RECOVERY_WINDOW_MINUTES", 30) *
      60 *
      1000;
  }

  async onModuleInit(): Promise<void> {
    // Listen for stuck game loops and trigger immediate recovery from Redis
    this.eventEmitter.on(
      "game.stuck",
      async (event: {
        tableId: string;
        gameId: string;
        tournamentId?: string;
        silenceMs: number;
      }) => {
        this.logger.warn(
          `Received game.stuck for ${event.gameId} (silent ${Math.floor(event.silenceMs / 1000)}s) — attempting recovery`,
        );
        try {
          const snapshot = await this.hotStateService.getHotState(event.gameId);
          if (snapshot) {
            this.eventEmitter.emit("game.recovery.start", {
              gameId: event.gameId,
              tableId: event.tableId,
              tournamentId: event.tournamentId,
              snapshot,
            });
          } else {
            this.logger.error(
              `No hot state found for stuck game ${event.gameId} — game lost`,
            );
          }
        } catch (e) {
          this.logger.error(
            `Failed to recover stuck game ${event.gameId}: ${e}`,
            e instanceof Error ? e.stack : undefined,
          );
        }
      },
    );

    if (!this.autoRecoverEnabled) {
      this.logger.log("Auto game recovery is DISABLED");
      return;
    }

    setTimeout(async () => {
      try {
        await this.attemptAutoRecovery();
      } catch (e: any) {
        this.logger.error(
          `Auto recovery failed: ${e.message}`,
          e instanceof Error ? e.stack : undefined,
        );
      }
      // After game recovery, clean up any stale move locks from crashed table balancing
      await this.recoverLimboPlayers();
    }, this.recoveryDelayMs);
  }

  /**
   * Scan for stale tournament move locks left by a crashed table balancing operation.
   * If a lock exists, the player was mid-move when the server died.
   * Clean up the lock — the tournament director will reconcile seats on restart.
   */
  private async recoverLimboPlayers(): Promise<void> {
    try {
      const lockKeys = await this.redis.scan("tournament:move:*");
      if (lockKeys.length === 0) return;

      this.logger.warn(
        `Found ${lockKeys.length} stale tournament move lock(s) — cleaning up`,
      );

      for (const key of lockKeys) {
        const raw = await this.redis.get(key);
        if (raw) {
          try {
            const move = JSON.parse(raw);
            this.logger.warn(
              `Limbo player ${move.botId}: was moving from ${move.fromTable} to ${move.toTable} (chips: ${move.chips})`,
            );
          } catch {
            // malformed JSON, just clean up
          }
        }
        await this.redis.del(key);
      }

      this.logger.log("Stale move locks cleaned up");
    } catch (e: any) {
      this.logger.error(
        `Failed to recover limbo players: ${e.message}`,
        e instanceof Error ? e.stack : undefined,
      );
    }
  }

  async attemptAutoRecovery(): Promise<RecoveryResult> {
    this.logger.log("Checking for recoverable games (Redis + Postgres)...");

    const result: RecoveryResult = {
      totalFound: 0,
      recovered: 0,
      orphaned: 0,
      errors: [],
    };

    try {
      // ── 1. Gather candidates from both sources ──────────────────────────────

      const hotStates = await this.hotStateService.scanActiveHotStates();
      const dbSnapshots = await this.persistenceService.getRecoverableGames();

      // ── 2. Merge by gameId — prefer higher action_seq (Redis wins on ties) ──

      const candidateMap = new Map<string, RecoveryCandidate>();

      for (const db of dbSnapshots) {
        const lastActionAt = new Date(
          db.last_action_at ?? (db as any).updated_at ?? Date.now(),
        );
        candidateMap.set(db.game_id, {
          snapshot: db as unknown as RecoverySnapshot,
          source: "cold",
          lastActionAt,
        });
      }

      for (const hot of hotStates) {
        if (!hot.game_id) continue;
        const existing = candidateMap.get(hot.game_id);
        const hotSeq = hot.action_seq ?? 0;
        const existingSeq = existing?.snapshot.action_seq ?? -1;
        if (!existing || hotSeq >= existingSeq) {
          candidateMap.set(hot.game_id, {
            snapshot: hot,
            source: "hot",
            lastActionAt: new Date(hot.last_action_at ?? Date.now()),
          });
        }
      }

      result.totalFound = candidateMap.size;

      if (candidateMap.size === 0) {
        this.logger.log("No recoverable games found");
        return result;
      }

      this.logger.log(
        `Found ${candidateMap.size} recoverable game(s) ` +
          `(${hotStates.length} hot, ${dbSnapshots.length} cold)`,
      );

      // ── 3. Validate and recover each candidate ──────────────────────────────

      for (const [gameId, candidate] of candidateMap) {
        try {
          const ageMs = Date.now() - candidate.lastActionAt.getTime();
          if (ageMs > this.maxRecoveryWindowMs) {
            this.logger.debug(
              `Game ${gameId}: snapshot too old (${Math.floor(ageMs / 60000)}m) — orphaning`,
            );
            await this.orphanGame(gameId, candidate);
            result.orphaned++;
            continue;
          }

          const canRecover = await this.validateActivePlayers(
            candidate.snapshot,
          );
          if (canRecover) {
            await this.recoverGame(candidate.snapshot);
            result.recovered++;
          } else {
            this.logger.warn(
              `Cannot recover game ${gameId} — marking as orphaned`,
            );
            await this.orphanGame(gameId, candidate);
            result.orphaned++;
          }
        } catch (error) {
          const msg = `Failed to recover game ${gameId}: ${error}`;
          this.logger.error(
            msg,
            error instanceof Error ? error.stack : undefined,
          );
          result.errors.push(msg);
        }
      }

      this.logger.log(
        `Recovery complete: ${result.recovered} recovered, ${result.orphaned} orphaned`,
      );
    } catch (error) {
      const msg = `Recovery process failed: ${error}`;
      this.logger.error(msg, error instanceof Error ? error.stack : undefined);
      result.errors.push(msg);
    }

    return result;
  }

  private async orphanGame(
    gameId: string,
    candidate: RecoveryCandidate,
  ): Promise<void> {
    if (candidate.source === "cold") {
      await this.persistenceService.markGameCompleted(gameId);
    }
    // Hot state in Redis expires naturally via TTL; no explicit delete needed.
  }

  private async validateActivePlayers(
    snapshot: RecoverySnapshot,
  ): Promise<boolean> {
    if (!snapshot.players || snapshot.players.length < 2) {
      this.logger.debug(
        `Game ${snapshot.game_id}: not enough players for recovery`,
      );
      return false;
    }

    const activePlayers = snapshot.players.filter(
      (p) => !p.disconnected && Number(p.chips) > 0,
    );
    if (activePlayers.length < 2) {
      this.logger.debug(`Game ${snapshot.game_id}: not enough active players`);
      return false;
    }

    for (const player of activePlayers) {
      try {
        const bot = await this.botRepository.findById(player.id);
        if (!bot || !bot.active) {
          this.logger.debug(
            `Game ${snapshot.game_id}: bot ${player.id} not found or inactive`,
          );
          return false;
        }
      } catch {
        return false;
      }
    }

    return true;
  }

  private async recoverGame(snapshot: RecoverySnapshot): Promise<void> {
    this.logger.log(
      `Recovering game ${snapshot.game_id} ` +
        `(hand #${snapshot.hand_number}, stage: ${snapshot.game_stage}, ` +
        `seq: ${snapshot.action_seq ?? "n/a"})`,
    );

    this.eventEmitter.emit("game.recovery.start", {
      gameId: snapshot.game_id,
      tableId: snapshot.table_id,
      tournamentId: snapshot.tournament_id,
      snapshot,
    });
  }

  async getRecoveryStatus(): Promise<{
    serverInstanceId: string;
    activeGames: number;
    recoverableGames: number;
    autoRecoverEnabled: boolean;
  }> {
    const recoverableGames =
      await this.persistenceService.getRecoverableGames();

    return {
      serverInstanceId: this.persistenceService.getServerInstanceId(),
      activeGames: await this.persistenceService.getActiveGameCount(),
      recoverableGames: recoverableGames.length,
      autoRecoverEnabled: this.autoRecoverEnabled,
    };
  }
}
