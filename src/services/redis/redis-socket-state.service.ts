import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { RedisService } from "../../common/redis";
import { ConfigService } from "@nestjs/config";

const SOCKET_STATE_PREFIX = "socket:";
const PLAYER_SOCKET_PREFIX = "player:socket:";
const TABLE_SUBSCRIBERS_PREFIX = "table:subscribers:";
const BOT_ACTIVITY_SUBSCRIBERS_PREFIX = "bot:activity:subscribers:";
const SOCKET_TTL_SECONDS = 3600; // 1 hour

export interface SocketInfo {
  socketId: string;
  instanceId: string;
  userId?: string;
  botId?: string;
  connectedAt: string;
}

@Injectable()
export class RedisSocketStateService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisSocketStateService.name);
  private readonly instanceId: string;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.instanceId =
      this.configService.get<string>("INSTANCE_ID") ||
      `instance-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    this.startCleanupLoop();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    try {
      const isConnected = await this.redisService.ping();
      if (isConnected) {
        await this.cleanupInstanceSockets();
      }
    } catch {
      this.logger.debug("Redis unavailable during cleanup, skipping");
    }
  }

  async registerSocket(
    socketId: string,
    userId?: string,
    botId?: string,
  ): Promise<void> {
    const key = SOCKET_STATE_PREFIX + socketId;
    const info: SocketInfo = {
      socketId,
      instanceId: this.instanceId,
      userId,
      botId,
      connectedAt: new Date().toISOString(),
    };

    await this.redisService.set(key, JSON.stringify(info), SOCKET_TTL_SECONDS);

    if (botId) {
      await this.redisService.set(
        PLAYER_SOCKET_PREFIX + botId,
        socketId,
        SOCKET_TTL_SECONDS,
      );
    }

    this.logger.debug(
      `Registered socket ${socketId} for instance ${this.instanceId}`,
    );
  }

  async unregisterSocket(socketId: string): Promise<void> {
    const info = await this.getSocketInfo(socketId);

    if (info?.botId) {
      await this.redisService.del(PLAYER_SOCKET_PREFIX + info.botId);
    }

    await this.redisService.del(SOCKET_STATE_PREFIX + socketId);

    const tableKeys = await this.redisService.scan(
      `${TABLE_SUBSCRIBERS_PREFIX}*`,
    );
    for (const key of tableKeys) {
      await this.redisService.hdel(key, socketId);
    }

    const botActivityKeys = await this.redisService.scan(
      `${BOT_ACTIVITY_SUBSCRIBERS_PREFIX}*`,
    );
    for (const key of botActivityKeys) {
      await this.redisService.hdel(key, socketId);
    }

    this.logger.debug(`Unregistered socket ${socketId}`);
  }

  async getSocketInfo(socketId: string): Promise<SocketInfo | null> {
    const key = SOCKET_STATE_PREFIX + socketId;
    const data = await this.redisService.get(key);

    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async getSocketIdForBot(botId: string): Promise<string | null> {
    return this.redisService.get(PLAYER_SOCKET_PREFIX + botId);
  }

  async registerBotSocket(socketId: string, botId: string): Promise<void> {
    const info = await this.getSocketInfo(socketId);
    if (info) {
      info.botId = botId;
      await this.redisService.set(
        SOCKET_STATE_PREFIX + socketId,
        JSON.stringify(info),
        SOCKET_TTL_SECONDS,
      );
    }

    await this.redisService.set(
      PLAYER_SOCKET_PREFIX + botId,
      socketId,
      SOCKET_TTL_SECONDS,
    );
  }

  async subscribeToTable(socketId: string, tableId: string): Promise<void> {
    const key = TABLE_SUBSCRIBERS_PREFIX + tableId;
    await this.redisService.hset(key, socketId, this.instanceId);
    await this.redisService.expire(key, SOCKET_TTL_SECONDS);
  }

  async unsubscribeFromTable(socketId: string, tableId: string): Promise<void> {
    const key = TABLE_SUBSCRIBERS_PREFIX + tableId;
    await this.redisService.hdel(key, socketId);
  }

  async getTableSubscribers(tableId: string): Promise<Record<string, string>> {
    const key = TABLE_SUBSCRIBERS_PREFIX + tableId;
    return this.redisService.hgetall(key);
  }

  async getTableSubscriberCount(tableId: string): Promise<number> {
    const subscribers = await this.getTableSubscribers(tableId);
    return Object.keys(subscribers).length;
  }

  async subscribeToBotActivity(socketId: string, botId: string): Promise<void> {
    const key = BOT_ACTIVITY_SUBSCRIBERS_PREFIX + botId;
    await this.redisService.hset(key, socketId, this.instanceId);
    await this.redisService.expire(key, SOCKET_TTL_SECONDS);
  }

  async unsubscribeFromBotActivity(
    socketId: string,
    botId: string,
  ): Promise<void> {
    const key = BOT_ACTIVITY_SUBSCRIBERS_PREFIX + botId;
    await this.redisService.hdel(key, socketId);
  }

  async refreshSocketTtl(socketId: string): Promise<void> {
    const key = SOCKET_STATE_PREFIX + socketId;
    await this.redisService.expire(key, SOCKET_TTL_SECONDS);
  }

  async getAllConnectedSockets(): Promise<SocketInfo[]> {
    const keys = await this.redisService.scan(`${SOCKET_STATE_PREFIX}*`);
    const sockets: SocketInfo[] = [];

    for (const key of keys) {
      const socketId = key.replace(SOCKET_STATE_PREFIX, "");
      const info = await this.getSocketInfo(socketId);
      if (info) {
        sockets.push(info);
      }
    }

    return sockets;
  }

  async getInstanceSockets(): Promise<SocketInfo[]> {
    const allSockets = await this.getAllConnectedSockets();
    return allSockets.filter((s) => s.instanceId === this.instanceId);
  }

  async getConnectedCount(): Promise<number> {
    const keys = await this.redisService.scan(`${SOCKET_STATE_PREFIX}*`);
    return keys.length;
  }

  getInstanceId(): string {
    return this.instanceId;
  }

  private startCleanupLoop(): void {
    this.cleanupInterval = setInterval(
      () => {
        this.refreshInstanceSockets().catch((err) => {
          this.logger.error(`Socket refresh error: ${err.message}`);
        });
      },
      SOCKET_TTL_SECONDS * 500, // Refresh at half the TTL
    );
  }

  private async refreshInstanceSockets(): Promise<void> {
    const sockets = await this.getInstanceSockets();
    for (const socket of sockets) {
      await this.refreshSocketTtl(socket.socketId);
    }
  }

  private async cleanupInstanceSockets(): Promise<void> {
    const sockets = await this.getInstanceSockets();
    for (const socket of sockets) {
      await this.unregisterSocket(socket.socketId);
    }
    this.logger.log(
      `Cleaned up ${sockets.length} sockets for instance ${this.instanceId}`,
    );
  }
}
