import {
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
  Inject,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { GameStatePersistenceService } from "./game-state-persistence.service";
import { GameStateSnapshot } from "../../entities/game-state-snapshot.entity";
import { BotRepository } from "../../repositories/bot.repository";
import {
  RedisGameStateService,
  RedisGameState,
} from "../redis/redis-game-state.service";
import { GameOwnershipService } from "./game-ownership.service";

export interface RecoveryResult {
  totalFound: number;
  recovered: number;
  orphaned: number;
  errors: string[];
}

@Injectable()
export class GameRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(GameRecoveryService.name);
  private readonly autoRecoverEnabled: boolean;
  private readonly recoveryDelayMs: number;

  constructor(
    private readonly persistenceService: GameStatePersistenceService,
    private readonly botRepository: BotRepository,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    @Optional()
    @Inject(RedisGameStateService)
    private readonly redisGameStateService: RedisGameStateService | null,
    @Optional()
    @Inject(GameOwnershipService)
    private readonly gameOwnershipService: GameOwnershipService | null,
  ) {
    this.autoRecoverEnabled =
      this.configService.get<string>("GAME_AUTO_RECOVER", "true") === "true";
    this.recoveryDelayMs = this.configService.get<number>(
      "GAME_RECOVERY_DELAY_MS",
      5000,
    );
  }

  private isRedisEnabled(): boolean {
    return (
      this.redisGameStateService !== null && this.gameOwnershipService !== null
    );
  }

  async onModuleInit(): Promise<void> {
    if (!this.autoRecoverEnabled) {
      this.logger.log("Auto game recovery is DISABLED");
      return;
    }

    setTimeout(() => {
      this.attemptAutoRecovery().catch((e) =>
        this.logger.error(`Auto recovery failed: ${e.message}`),
      );
    }, this.recoveryDelayMs);
  }

  async attemptAutoRecovery(): Promise<RecoveryResult> {
    this.logger.log("Checking for recoverable games...");

    const result: RecoveryResult = {
      totalFound: 0,
      recovered: 0,
      orphaned: 0,
      errors: [],
    };

    try {
      if (this.isRedisEnabled()) {
        const redisResult = await this.attemptRedisRecovery();
        result.totalFound += redisResult.totalFound;
        result.recovered += redisResult.recovered;
        result.orphaned += redisResult.orphaned;
        result.errors.push(...redisResult.errors);
      }

      const recoverableGames =
        await this.persistenceService.getRecoverableGames();
      result.totalFound += recoverableGames.length;

      if (recoverableGames.length === 0 && result.totalFound === 0) {
        this.logger.log("No recoverable games found");
        return result;
      }

      if (recoverableGames.length > 0) {
        this.logger.log(
          `Found ${recoverableGames.length} potentially recoverable games from DB`,
        );
      }

      for (const snapshot of recoverableGames) {
        try {
          const canRecover = await this.validateRecovery(snapshot);

          if (canRecover) {
            await this.recoverGame(snapshot);
            result.recovered++;
          } else {
            this.logger.warn(
              `Cannot recover game ${snapshot.game_id} - marking as orphaned`,
            );
            await this.persistenceService.markGameCompleted(snapshot.game_id);
            result.orphaned++;
          }
        } catch (error) {
          const errorMsg = `Failed to recover game ${snapshot.game_id}: ${error}`;
          this.logger.error(errorMsg);
          result.errors.push(errorMsg);
        }
      }

      this.logger.log(
        `Recovery complete: ${result.recovered} recovered, ${result.orphaned} orphaned`,
      );
    } catch (error) {
      const errorMsg = `Recovery process failed: ${error}`;
      this.logger.error(errorMsg);
      result.errors.push(errorMsg);
    }

    return result;
  }

  private async attemptRedisRecovery(): Promise<RecoveryResult> {
    const result: RecoveryResult = {
      totalFound: 0,
      recovered: 0,
      orphaned: 0,
      errors: [],
    };

    if (!this.isRedisEnabled()) {
      return result;
    }

    this.logger.log("Checking Redis for orphaned games...");

    try {
      const allGameKeys = await this.redisGameStateService!.getAllActiveGames();
      result.totalFound = allGameKeys.length;

      for (const key of allGameKeys) {
        const tableId = key.replace("game:state:", "");
        const owner = await this.gameOwnershipService!.getGameOwner(tableId);

        if (!owner) {
          this.logger.log(`Found orphaned Redis game: ${tableId}`);
          const acquired =
            await this.gameOwnershipService!.acquireGameOwnership(tableId);

          if (acquired) {
            try {
              const redisState =
                await this.redisGameStateService!.getGameState(tableId);
              if (redisState) {
                await this.recoverFromRedisState(redisState);
                result.recovered++;
              }
            } catch (error) {
              const errorMsg = `Failed to recover Redis game ${tableId}: ${error}`;
              this.logger.error(errorMsg);
              result.errors.push(errorMsg);
              await this.gameOwnershipService!.releaseGameOwnership(tableId);
            }
          }
        }
      }
    } catch (error) {
      const errorMsg = `Redis recovery scan failed: ${error}`;
      this.logger.error(errorMsg);
      result.errors.push(errorMsg);
    }

    return result;
  }

  private async recoverFromRedisState(
    redisState: RedisGameState,
  ): Promise<void> {
    const { snapshot, metadata } = redisState;

    this.logger.log(
      `Recovering game from Redis: ${metadata.tableId} (hand #${snapshot.handNumber})`,
    );

    const dbSnapshot = {
      game_id: metadata.gameDbId,
      table_id: metadata.tableId,
      tournament_id: metadata.tournamentId,
      hand_number: snapshot.handNumber,
      game_stage: snapshot.stage,
      dealer_index: 0,
      small_blind: snapshot.smallBlind,
      big_blind: snapshot.bigBlind,
      ante: snapshot.ante,
      starting_chips: 1000,
      turn_timeout_ms: 10000,
      community_cards: snapshot.communityCards,
      players: snapshot.players.map((p) => ({
        id: p.id,
        name: p.name,
        endpoint: "",
        chips: p.chips,
        holeCards: p.holeCards || [],
        folded: p.folded,
        allIn: p.allIn,
        strikes: p.strikes,
        disconnected: p.disconnected,
      })),
    };

    for (const player of dbSnapshot.players) {
      if (!player.disconnected) {
        try {
          const bot = await this.botRepository.findById(player.id);
          if (bot) {
            player.endpoint = bot.endpoint;
          }
        } catch {
          this.logger.warn(`Could not find bot endpoint for ${player.id}`);
        }
      }
    }

    this.eventEmitter.emit("game.recovery.start", {
      gameId: metadata.gameDbId,
      tableId: metadata.tableId,
      tournamentId: metadata.tournamentId,
      snapshot: dbSnapshot,
    });
  }

  private async validateRecovery(
    snapshot: GameStateSnapshot,
  ): Promise<boolean> {
    if (!snapshot.players || snapshot.players.length < 2) {
      this.logger.debug(
        `Game ${snapshot.game_id}: Not enough players for recovery`,
      );
      return false;
    }

    const activePlayers = snapshot.players.filter(
      (p) => !p.disconnected && p.chips > 0,
    );
    if (activePlayers.length < 2) {
      this.logger.debug(`Game ${snapshot.game_id}: Not enough active players`);
      return false;
    }

    for (const player of activePlayers) {
      try {
        const bot = await this.botRepository.findById(player.id);
        if (!bot || !bot.active) {
          this.logger.debug(
            `Game ${snapshot.game_id}: Bot ${player.id} not found or inactive`,
          );
          return false;
        }
      } catch {
        return false;
      }
    }

    const lastAction = snapshot.last_action_at || snapshot.updated_at;
    const maxAge = this.configService.get<number>(
      "GAME_STATE_RECOVERY_WINDOW_MINUTES",
      30,
    );
    const ageMs = Date.now() - lastAction.getTime();
    if (ageMs > maxAge * 60 * 1000) {
      this.logger.debug(
        `Game ${snapshot.game_id}: Snapshot too old (${Math.floor(ageMs / 60000)} minutes)`,
      );
      return false;
    }

    return true;
  }

  private async recoverGame(snapshot: GameStateSnapshot): Promise<void> {
    this.logger.log(
      `Recovering game ${snapshot.game_id} (hand #${snapshot.hand_number}, stage: ${snapshot.game_stage})`,
    );

    this.eventEmitter.emit("game.recovery.start", {
      gameId: snapshot.game_id,
      tableId: snapshot.table_id,
      tournamentId: snapshot.tournament_id,
      snapshot,
    });

    for (const player of snapshot.players) {
      if (!player.disconnected) {
        try {
          const bot = await this.botRepository.findById(player.id);
          if (bot) {
            await this.notifyBotOfRecovery(bot.endpoint, snapshot);
          }
        } catch (error) {
          this.logger.warn(
            `Failed to notify bot ${player.id} of recovery: ${error}`,
          );
        }
      }
    }
  }

  private async notifyBotOfRecovery(
    endpoint: string,
    snapshot: GameStateSnapshot,
  ): Promise<void> {
    const recoveryPayload = {
      event: "game_recovered",
      game_id: snapshot.game_id,
      table_id: snapshot.table_id,
      hand_number: snapshot.hand_number,
      stage: snapshot.game_stage,
      message: "Game has been recovered after server restart",
    };

    try {
      const controller = new AbortController();
      const botRecoveryTimeout = this.configService.get<number>(
        "botRecoveryTimeoutMs",
        5000,
      );
      const timeoutId = setTimeout(
        () => controller.abort(),
        botRecoveryTimeout,
      );

      await fetch(`${endpoint}/recovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recoveryPayload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
    } catch {
      // Bot may not support recovery endpoint - that's okay
    }
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
