import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../../common/redis";
import { GameOwnershipService } from "../game/game-ownership.service";
import { RedisGameStateService } from "./redis-game-state.service";

export interface RedisHealthStatus {
  connected: boolean;
  latencyMs: number | null;
  ownedGames: number;
  ownedTournaments: number;
  totalActiveGames: number;
  error?: string;
}

@Injectable()
export class RedisHealthService {
  private readonly logger = new Logger(RedisHealthService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly gameOwnershipService: GameOwnershipService,
    private readonly redisGameStateService: RedisGameStateService,
  ) {}

  async getHealthStatus(): Promise<RedisHealthStatus> {
    const status: RedisHealthStatus = {
      connected: false,
      latencyMs: null,
      ownedGames: 0,
      ownedTournaments: 0,
      totalActiveGames: 0,
    };

    try {
      const start = Date.now();
      const connected = await this.redisService.ping();
      status.latencyMs = Date.now() - start;
      status.connected = connected;

      if (connected) {
        status.ownedGames = this.gameOwnershipService.getOwnedGames().length;
        status.ownedTournaments =
          this.gameOwnershipService.getOwnedTournaments().length;

        const allGames = await this.redisGameStateService.getAllActiveGames();
        status.totalActiveGames = allGames.length;
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      status.error = errorMessage;
      this.logger.error(`Redis health check failed: ${errorMessage}`);
    }

    return status;
  }

  async isHealthy(): Promise<boolean> {
    try {
      return await this.redisService.ping();
    } catch {
      return false;
    }
  }

  getInstanceInfo(): {
    instanceId: string;
    ownedGames: string[];
    ownedTournaments: string[];
  } {
    return {
      instanceId: this.gameOwnershipService.getInstanceId(),
      ownedGames: this.gameOwnershipService.getOwnedGames(),
      ownedTournaments: this.gameOwnershipService.getOwnedTournaments(),
    };
  }
}
