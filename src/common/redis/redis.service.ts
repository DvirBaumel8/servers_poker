import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private readonly config: RedisConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      host: this.configService.get<string>("REDIS_HOST", "localhost"),
      port: this.configService.get<number>("REDIS_PORT", 6379),
      password: this.configService.get<string>("REDIS_PASSWORD"),
      db: this.configService.get<number>("REDIS_DB", 0),
      keyPrefix: this.configService.get<string>("REDIS_KEY_PREFIX", "poker:"),
    };

    this.client = new Redis({
      host: this.config.host,
      port: this.config.port,
      password: this.config.password || undefined,
      db: this.config.db,
      keyPrefix: this.config.keyPrefix,
      retryStrategy: (times) => {
        if (times > 10) {
          this.logger.error("Redis connection failed after 10 retries");
          return null;
        }
        return Math.min(times * 100, 3000);
      },
      maxRetriesPerRequest: 3,
    });

    this.client.on("connect", () => {
      this.logger.log(
        `Connected to Redis at ${this.config.host}:${this.config.port}`,
      );
    });

    this.client.on("error", (err) => {
      this.logger.error(`Redis error: ${err.message}`);
    });

    this.client.on("close", () => {
      this.logger.warn("Redis connection closed");
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    this.logger.log("Redis connection closed");
  }

  getClient(): Redis {
    return this.client;
  }

  getKeyPrefix(): string {
    return this.config.keyPrefix;
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === "PONG";
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<"OK" | null> {
    if (ttlSeconds) {
      return this.client.set(key, value, "EX", ttlSeconds);
    }
    return this.client.set(key, value);
  }

  async setNX(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const result = await this.client.set(key, value, "EX", ttlSeconds, "NX");
    return result === "OK";
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.expire(key, ttlSeconds);
    return result === 1;
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    return this.client.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  async hmset(key: string, data: Record<string, string>): Promise<"OK"> {
    return this.client.hmset(key, data);
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.client.hdel(key, ...fields);
  }

  async scan(pattern: string, count: number = 100): Promise<string[]> {
    const keys: string[] = [];
    let cursor = "0";
    const fullPattern = this.config.keyPrefix + pattern;

    do {
      const [nextCursor, foundKeys] = await this.client.scan(
        cursor,
        "MATCH",
        fullPattern,
        "COUNT",
        count,
      );
      cursor = nextCursor;
      keys.push(...foundKeys.map((k) => k.replace(this.config.keyPrefix, "")));
    } while (cursor !== "0");

    return keys;
  }

  async eval(
    script: string,
    keys: string[],
    args: (string | number)[],
  ): Promise<unknown> {
    return this.client.eval(script, keys.length, ...keys, ...args);
  }
}
