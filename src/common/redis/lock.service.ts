import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { RedisService } from "./redis.service";

export interface LockOptions {
  /** Lock key (e.g., "lock:matchmaking:create-daily") */
  key: string;
  /** TTL in milliseconds */
  ttlMs: number;
}

export interface LockResult {
  acquired: boolean;
  lockKey: string;
  ownerId: string;
}

@Injectable()
export class LockService {
  private readonly logger = new Logger(LockService.name);

  /** Clock drift safety: deduct 5% of TTL + 2ms baseline */
  private static readonly CLOCK_DRIFT_FACTOR = 0.05;
  private static readonly CLOCK_DRIFT_BASE_MS = 2;

  /**
   * Lua script for atomic release — only deletes if the caller still owns the lock.
   * Prevents releasing another instance's lock after TTL expiry + re-acquisition.
   */
  private static readonly RELEASE_SCRIPT = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  /**
   * Lua script for atomic extend — only extends TTL if the caller still owns the lock.
   */
  private static readonly EXTEND_SCRIPT = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("pexpire", KEYS[1], ARGV[2])
    else
      return 0
    end
  `;

  constructor(private readonly redisService: RedisService) {}

  /**
   * Attempt to acquire a distributed lock.
   * Uses SET NX EX (atomic set-if-not-exists with expiry).
   */
  async acquire(options: LockOptions): Promise<LockResult> {
    const { key, ttlMs } = options;
    const ownerId = randomUUID();

    // Apply clock drift safety margin
    const effectiveTtlMs =
      ttlMs -
      ttlMs * LockService.CLOCK_DRIFT_FACTOR -
      LockService.CLOCK_DRIFT_BASE_MS;
    const ttlSeconds = Math.ceil(effectiveTtlMs / 1000);

    try {
      const acquired = await this.redisService.setNX(key, ownerId, ttlSeconds);

      if (acquired) {
        this.logger.debug(
          `Lock acquired: ${key} (owner=${ownerId.slice(0, 8)}, ttl=${ttlSeconds}s)`,
        );
      } else {
        this.logger.warn(`Lock busy — skipping: ${key}`);
      }

      return { acquired, lockKey: key, ownerId };
    } catch (err) {
      this.logger.error(
        `Failed to acquire lock ${key}: ${err instanceof Error ? err.message : err}`,
      );
      return { acquired: false, lockKey: key, ownerId };
    }
  }

  /**
   * Release a lock. Only succeeds if the caller is the current owner.
   * Uses a Lua script for atomic check-and-delete.
   */
  async release(lockKey: string, ownerId: string): Promise<boolean> {
    try {
      // ioredis automatically applies keyPrefix to eval KEYS — pass raw key
      const result = await this.redisService.eval(
        LockService.RELEASE_SCRIPT,
        [lockKey],
        [ownerId],
      );
      const released = result === 1;

      if (released) {
        this.logger.debug(
          `Lock released: ${lockKey} (owner=${ownerId.slice(0, 8)})`,
        );
      } else {
        this.logger.warn(
          `Lock release failed (expired or different owner): ${lockKey}`,
        );
      }

      return released;
    } catch (err) {
      this.logger.error(
        `Failed to release lock ${lockKey}: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }

  /**
   * Extend a lock's TTL. Only succeeds if the caller is the current owner.
   * Useful for long-running operations that may exceed the original TTL.
   */
  async extend(
    lockKey: string,
    ownerId: string,
    additionalTtlMs: number,
  ): Promise<boolean> {
    try {
      // ioredis automatically applies keyPrefix to eval KEYS — pass raw key
      const result = await this.redisService.eval(
        LockService.EXTEND_SCRIPT,
        [lockKey],
        [ownerId, additionalTtlMs],
      );
      const extended = result === 1;

      if (extended) {
        this.logger.debug(`Lock extended: ${lockKey} (+${additionalTtlMs}ms)`);
      } else {
        this.logger.warn(
          `Lock extend failed (expired or different owner): ${lockKey}`,
        );
      }

      return extended;
    } catch (err) {
      this.logger.error(
        `Failed to extend lock ${lockKey}: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }

  /**
   * Execute a function while holding a distributed lock.
   * Returns `null` if the lock could not be acquired (graceful skip).
   * The lock is always released in a finally block to prevent deadlocks.
   */
  async withLock<T>(
    options: LockOptions,
    fn: () => Promise<T>,
  ): Promise<T | null> {
    const lock = await this.acquire(options);
    if (!lock.acquired) {
      return null;
    }

    try {
      return await fn();
    } finally {
      await this.release(lock.lockKey, lock.ownerId);
    }
  }
}
