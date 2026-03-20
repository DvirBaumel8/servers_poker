import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { GameStatePersistenceService } from "./game-state-persistence.service";
import { GameStateSnapshot } from "../entities/game-state-snapshot.entity";
import { BotRepository } from "../repositories/bot.repository";

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
  ) {
    this.autoRecoverEnabled =
      this.configService.get<string>("GAME_AUTO_RECOVER", "true") === "true";
    this.recoveryDelayMs = this.configService.get<number>(
      "GAME_RECOVERY_DELAY_MS",
      5000,
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
      const recoverableGames =
        await this.persistenceService.getRecoverableGames();
      result.totalFound = recoverableGames.length;

      if (recoverableGames.length === 0) {
        this.logger.log("No recoverable games found");
        return result;
      }

      this.logger.log(
        `Found ${recoverableGames.length} potentially recoverable games`,
      );

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
      const timeoutId = setTimeout(() => controller.abort(), 5000);

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
