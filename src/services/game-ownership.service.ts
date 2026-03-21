import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v4 as uuidv4 } from "uuid";
import { RedisService } from "../common/redis";

const OWNERSHIP_KEY_PREFIX = "game:ownership:";
const TOURNAMENT_OWNERSHIP_KEY_PREFIX = "tournament:ownership:";

@Injectable()
export class GameOwnershipService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GameOwnershipService.name);
  private readonly instanceId: string;
  private readonly ownershipTtlSeconds: number;
  private readonly renewalIntervalMs: number;
  private renewalInterval: ReturnType<typeof setInterval> | null = null;
  private readonly ownedGames = new Set<string>();
  private readonly ownedTournaments = new Set<string>();

  private readonly releaseScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  private readonly renewScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("expire", KEYS[1], ARGV[2])
    else
      return 0
    end
  `;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.instanceId = this.configService.get<string>("INSTANCE_ID") || uuidv4();
    this.ownershipTtlSeconds = Math.ceil(
      this.configService.get<number>("GAME_OWNERSHIP_TTL_MS", 10000) / 1000,
    );
    this.renewalIntervalMs = this.configService.get<number>(
      "GAME_OWNERSHIP_RENEWAL_MS",
      3000,
    );
  }

  onModuleInit(): void {
    this.startRenewalLoop();
    this.logger.log(
      `GameOwnershipService initialized (instanceId: ${this.instanceId.substring(0, 8)}...)`,
    );
  }

  onModuleDestroy(): void {
    this.stopRenewalLoop();
    this.releaseAllOwnership();
  }

  getInstanceId(): string {
    return this.instanceId;
  }

  async acquireGameOwnership(tableId: string): Promise<boolean> {
    const key = OWNERSHIP_KEY_PREFIX + tableId;
    const acquired = await this.redisService.setNX(
      key,
      this.instanceId,
      this.ownershipTtlSeconds,
    );

    if (acquired) {
      this.ownedGames.add(tableId);
      this.logger.log(`Acquired ownership of game ${tableId}`);
    }

    return acquired;
  }

  async releaseGameOwnership(tableId: string): Promise<boolean> {
    const key = OWNERSHIP_KEY_PREFIX + tableId;
    const result = await this.redisService.eval(
      this.releaseScript,
      [key],
      [this.instanceId],
    );

    if (result === 1) {
      this.ownedGames.delete(tableId);
      this.logger.log(`Released ownership of game ${tableId}`);
      return true;
    }

    return false;
  }

  async isGameOwner(tableId: string): Promise<boolean> {
    const key = OWNERSHIP_KEY_PREFIX + tableId;
    const owner = await this.redisService.get(key);
    return owner === this.instanceId;
  }

  async getGameOwner(tableId: string): Promise<string | null> {
    const key = OWNERSHIP_KEY_PREFIX + tableId;
    return this.redisService.get(key);
  }

  async acquireTournamentOwnership(tournamentId: string): Promise<boolean> {
    const key = TOURNAMENT_OWNERSHIP_KEY_PREFIX + tournamentId;
    const acquired = await this.redisService.setNX(
      key,
      this.instanceId,
      this.ownershipTtlSeconds,
    );

    if (acquired) {
      this.ownedTournaments.add(tournamentId);
      this.logger.log(`Acquired ownership of tournament ${tournamentId}`);
    }

    return acquired;
  }

  async releaseTournamentOwnership(tournamentId: string): Promise<boolean> {
    const key = TOURNAMENT_OWNERSHIP_KEY_PREFIX + tournamentId;
    const result = await this.redisService.eval(
      this.releaseScript,
      [key],
      [this.instanceId],
    );

    if (result === 1) {
      this.ownedTournaments.delete(tournamentId);
      this.logger.log(`Released ownership of tournament ${tournamentId}`);
      return true;
    }

    return false;
  }

  async isTournamentOwner(tournamentId: string): Promise<boolean> {
    const key = TOURNAMENT_OWNERSHIP_KEY_PREFIX + tournamentId;
    const owner = await this.redisService.get(key);
    return owner === this.instanceId;
  }

  async getTournamentOwner(tournamentId: string): Promise<string | null> {
    const key = TOURNAMENT_OWNERSHIP_KEY_PREFIX + tournamentId;
    return this.redisService.get(key);
  }

  getOwnedGames(): string[] {
    return Array.from(this.ownedGames);
  }

  getOwnedTournaments(): string[] {
    return Array.from(this.ownedTournaments);
  }

  private startRenewalLoop(): void {
    this.renewalInterval = setInterval(() => {
      this.renewAllOwnership();
    }, this.renewalIntervalMs);
  }

  private stopRenewalLoop(): void {
    if (this.renewalInterval) {
      clearInterval(this.renewalInterval);
      this.renewalInterval = null;
    }
  }

  private async renewAllOwnership(): Promise<void> {
    const gamePromises = Array.from(this.ownedGames).map((tableId) =>
      this.renewGameOwnership(tableId),
    );

    const tournamentPromises = Array.from(this.ownedTournaments).map(
      (tournamentId) => this.renewTournamentOwnership(tournamentId),
    );

    await Promise.all([...gamePromises, ...tournamentPromises]);
  }

  private async renewGameOwnership(tableId: string): Promise<void> {
    const key = OWNERSHIP_KEY_PREFIX + tableId;
    const result = await this.redisService.eval(
      this.renewScript,
      [key],
      [this.instanceId, this.ownershipTtlSeconds],
    );

    if (result !== 1) {
      this.ownedGames.delete(tableId);
      this.logger.warn(
        `Lost ownership of game ${tableId} (ownership expired or taken)`,
      );
    }
  }

  private async renewTournamentOwnership(tournamentId: string): Promise<void> {
    const key = TOURNAMENT_OWNERSHIP_KEY_PREFIX + tournamentId;
    const result = await this.redisService.eval(
      this.renewScript,
      [key],
      [this.instanceId, this.ownershipTtlSeconds],
    );

    if (result !== 1) {
      this.ownedTournaments.delete(tournamentId);
      this.logger.warn(
        `Lost ownership of tournament ${tournamentId} (ownership expired or taken)`,
      );
    }
  }

  private async releaseAllOwnership(): Promise<void> {
    const gamePromises = Array.from(this.ownedGames).map((tableId) =>
      this.releaseGameOwnership(tableId),
    );

    const tournamentPromises = Array.from(this.ownedTournaments).map(
      (tournamentId) => this.releaseTournamentOwnership(tournamentId),
    );

    await Promise.all([...gamePromises, ...tournamentPromises]);
    this.logger.log("Released all ownership on shutdown");
  }
}
