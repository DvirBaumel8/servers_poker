import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "./redis.service";

interface CacheOptions {
  ttlSeconds?: number;
}

@Injectable()
export class RedisCacheService {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly defaultTtl = 300; // 5 minutes

  constructor(private readonly redis: RedisService) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.redis.get(`cache:${key}`);
      if (cached) {
        return JSON.parse(cached) as T;
      }
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Cache get failed for ${key}: ${message}`);
      return null;
    }
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    try {
      const ttl = options?.ttlSeconds ?? this.defaultTtl;
      await this.redis.set(`cache:${key}`, JSON.stringify(value), ttl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Cache set failed for ${key}: ${message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(`cache:${key}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Cache delete failed for ${key}: ${message}`);
    }
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CacheOptions,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, options);
    return value;
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.scan(`cache:${pattern}`);
      for (const key of keys) {
        await this.redis.del(key);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Cache invalidation failed for ${pattern}: ${message}`);
    }
  }
}
