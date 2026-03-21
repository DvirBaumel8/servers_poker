import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../../common/redis";
import { GameStateSnapshot } from "../game/live-game-manager.service";

const GAME_STATE_KEY_PREFIX = "game:state:";
const TOURNAMENT_STATE_KEY_PREFIX = "tournament:state:";
const STATE_TTL_SECONDS = 24 * 60 * 60; // 24 hours

export interface RedisGameMetadata {
  tableId: string;
  gameDbId: string;
  tournamentId: string | null;
  botIdMap: Record<string, string>;
  startedAt: string;
  ownerInstanceId: string;
}

export interface RedisGameState {
  snapshot: GameStateSnapshot;
  metadata: RedisGameMetadata;
}

export interface RedisTournamentState {
  tournamentId: string;
  name: string;
  status: string;
  level: number;
  handsThisLevel: number;
  handsPerLevel: number;
  blinds: {
    small: number;
    big: number;
    ante: number;
  };
  playersRemaining: number;
  totalEntrants: number;
  tables: Array<{
    tableId: string;
    tableNumber: number;
  }>;
  buyIn: number;
  prizePool: number;
  ownerInstanceId: string;
  updatedAt: string;
}

@Injectable()
export class RedisGameStateService {
  private readonly logger = new Logger(RedisGameStateService.name);

  constructor(private readonly redisService: RedisService) {}

  async saveGameState(
    tableId: string,
    snapshot: GameStateSnapshot,
    metadata: Omit<RedisGameMetadata, "tableId">,
  ): Promise<void> {
    const key = GAME_STATE_KEY_PREFIX + tableId;
    const data: Record<string, string> = {
      snapshot: JSON.stringify(snapshot),
      gameDbId: metadata.gameDbId,
      tournamentId: metadata.tournamentId || "",
      botIdMap: JSON.stringify(metadata.botIdMap),
      startedAt: metadata.startedAt,
      ownerInstanceId: metadata.ownerInstanceId,
    };

    await this.redisService.hmset(key, data);
    await this.redisService.expire(key, STATE_TTL_SECONDS);
  }

  async getGameState(tableId: string): Promise<RedisGameState | null> {
    const key = GAME_STATE_KEY_PREFIX + tableId;
    const data = await this.redisService.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    try {
      return {
        snapshot: JSON.parse(data.snapshot),
        metadata: {
          tableId,
          gameDbId: data.gameDbId,
          tournamentId: data.tournamentId || null,
          botIdMap: JSON.parse(data.botIdMap || "{}"),
          startedAt: data.startedAt,
          ownerInstanceId: data.ownerInstanceId,
        },
      };
    } catch (err) {
      this.logger.error(`Failed to parse game state for ${tableId}: ${err}`);
      return null;
    }
  }

  async deleteGameState(tableId: string): Promise<void> {
    const key = GAME_STATE_KEY_PREFIX + tableId;
    await this.redisService.del(key);
    this.logger.debug(`Deleted game state for ${tableId}`);
  }

  async updateGameSnapshot(
    tableId: string,
    snapshot: GameStateSnapshot,
  ): Promise<void> {
    const key = GAME_STATE_KEY_PREFIX + tableId;
    await this.redisService.hset(key, "snapshot", JSON.stringify(snapshot));
    await this.redisService.expire(key, STATE_TTL_SECONDS);
  }

  async getAllActiveGames(): Promise<string[]> {
    return this.redisService.scan("game:state:*");
  }

  async getGamesByOwner(instanceId: string): Promise<string[]> {
    const allGames = await this.getAllActiveGames();
    const result: string[] = [];

    for (const key of allGames) {
      const tableId = key.replace(GAME_STATE_KEY_PREFIX, "");
      const owner = await this.redisService.hget(
        GAME_STATE_KEY_PREFIX + tableId,
        "ownerInstanceId",
      );
      if (owner === instanceId) {
        result.push(tableId);
      }
    }

    return result;
  }

  async saveTournamentState(
    tournamentId: string,
    state: Omit<RedisTournamentState, "tournamentId" | "updatedAt">,
  ): Promise<void> {
    const key = TOURNAMENT_STATE_KEY_PREFIX + tournamentId;
    const data: Record<string, string> = {
      name: state.name,
      status: state.status,
      level: String(state.level),
      handsThisLevel: String(state.handsThisLevel),
      handsPerLevel: String(state.handsPerLevel),
      blindsSmall: String(state.blinds.small),
      blindsBig: String(state.blinds.big),
      blindsAnte: String(state.blinds.ante),
      playersRemaining: String(state.playersRemaining),
      totalEntrants: String(state.totalEntrants),
      tables: JSON.stringify(state.tables),
      buyIn: String(state.buyIn),
      prizePool: String(state.prizePool),
      ownerInstanceId: state.ownerInstanceId,
      updatedAt: new Date().toISOString(),
    };

    await this.redisService.hmset(key, data);
    await this.redisService.expire(key, STATE_TTL_SECONDS);
  }

  async getTournamentState(
    tournamentId: string,
  ): Promise<RedisTournamentState | null> {
    const key = TOURNAMENT_STATE_KEY_PREFIX + tournamentId;
    const data = await this.redisService.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    try {
      return {
        tournamentId,
        name: data.name,
        status: data.status,
        level: parseInt(data.level, 10),
        handsThisLevel: parseInt(data.handsThisLevel, 10),
        handsPerLevel: parseInt(data.handsPerLevel, 10),
        blinds: {
          small: parseInt(data.blindsSmall, 10),
          big: parseInt(data.blindsBig, 10),
          ante: parseInt(data.blindsAnte, 10),
        },
        playersRemaining: parseInt(data.playersRemaining, 10),
        totalEntrants: parseInt(data.totalEntrants, 10),
        tables: JSON.parse(data.tables || "[]"),
        buyIn: parseInt(data.buyIn, 10),
        prizePool: parseInt(data.prizePool, 10),
        ownerInstanceId: data.ownerInstanceId,
        updatedAt: data.updatedAt,
      };
    } catch (err) {
      this.logger.error(
        `Failed to parse tournament state for ${tournamentId}: ${err}`,
      );
      return null;
    }
  }

  async deleteTournamentState(tournamentId: string): Promise<void> {
    const key = TOURNAMENT_STATE_KEY_PREFIX + tournamentId;
    await this.redisService.del(key);
    this.logger.debug(`Deleted tournament state for ${tournamentId}`);
  }

  async getAllActiveTournaments(): Promise<string[]> {
    return this.redisService.scan("tournament:state:*");
  }
}
