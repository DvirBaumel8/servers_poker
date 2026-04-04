import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Redis from "ioredis";
import { LockService } from "../../src/common/redis/lock.service";
import { RedisService } from "../../src/common/redis/redis.service";

/**
 * Integration tests for distributed locking using a real Redis instance.
 *
 * Requires Redis running at localhost:6379 (or REDIS_HOST/REDIS_PORT env vars).
 * Skip with: SKIP_REDIS_TESTS=1 npm run test
 */

const TEST_KEY_PREFIX = "test:lock:";

describe("Distributed Lock (Integration)", () => {
  let redis: Redis;
  let redisService: RedisService;
  let lockService: LockService;

  beforeAll(async () => {
    if (process.env.SKIP_REDIS_TESTS) {
      return;
    }

    // Create a real Redis connection for tests
    const host = process.env.REDIS_HOST || "localhost";
    const port = Number(process.env.REDIS_PORT) || 6379;

    redis = new Redis({ host, port, keyPrefix: "poker:" });

    // Build a minimal RedisService-compatible object using the real connection
    redisService = {
      setNX: async (key: string, value: string, ttlSeconds: number) => {
        const result = await redis.set(key, value, "EX", ttlSeconds, "NX");
        return result === "OK";
      },
      eval: async (
        script: string,
        keys: string[],
        args: (string | number)[],
      ) => {
        return redis.eval(script, keys.length, ...keys, ...args);
      },
      getKeyPrefix: () => "poker:",
    } as unknown as RedisService;

    lockService = new LockService(redisService);
  });

  afterAll(async () => {
    if (redis) {
      // Clean up test keys
      const keys = await redis.keys("poker:" + TEST_KEY_PREFIX + "*");
      if (keys.length > 0) {
        await redis.del(...keys.map((k) => k.replace("poker:", "")));
      }
      await redis.quit();
    }
  });

  beforeEach(async () => {
    if (process.env.SKIP_REDIS_TESTS) {
      return;
    }
    // Clean up any leftover test keys
    const keys = await redis.keys("poker:" + TEST_KEY_PREFIX + "*");
    if (keys.length > 0) {
      await redis.del(...keys.map((k) => k.replace("poker:", "")));
    }
  });

  it("should acquire and release a lock", async () => {
    if (process.env.SKIP_REDIS_TESTS) return;

    const lock = await lockService.acquire({
      key: TEST_KEY_PREFIX + "basic",
      ttlMs: 5000,
    });
    expect(lock.acquired).toBe(true);

    const released = await lockService.release(lock.lockKey, lock.ownerId);
    expect(released).toBe(true);

    // Should be able to acquire again after release
    const lock2 = await lockService.acquire({
      key: TEST_KEY_PREFIX + "basic",
      ttlMs: 5000,
    });
    expect(lock2.acquired).toBe(true);
    await lockService.release(lock2.lockKey, lock2.ownerId);
  });

  it("should return acquired=false when lock is already held", async () => {
    if (process.env.SKIP_REDIS_TESTS) return;

    const lock1 = await lockService.acquire({
      key: TEST_KEY_PREFIX + "contention",
      ttlMs: 5000,
    });
    expect(lock1.acquired).toBe(true);

    const lock2 = await lockService.acquire({
      key: TEST_KEY_PREFIX + "contention",
      ttlMs: 5000,
    });
    expect(lock2.acquired).toBe(false);

    await lockService.release(lock1.lockKey, lock1.ownerId);
  });

  it("should ensure only one of two simultaneous withLock calls executes", async () => {
    if (process.env.SKIP_REDIS_TESTS) return;

    let executionCount = 0;

    const [result1, result2] = await Promise.all([
      lockService.withLock(
        { key: TEST_KEY_PREFIX + "concurrent", ttlMs: 5000 },
        async () => {
          executionCount++;
          await new Promise((r) => setTimeout(r, 100));
          return "done";
        },
      ),
      lockService.withLock(
        { key: TEST_KEY_PREFIX + "concurrent", ttlMs: 5000 },
        async () => {
          executionCount++;
          await new Promise((r) => setTimeout(r, 100));
          return "done";
        },
      ),
    ]);

    expect(executionCount).toBe(1);
    expect([result1, result2].filter((r) => r === "done")).toHaveLength(1);
    expect([result1, result2].filter((r) => r === null)).toHaveLength(1);
  });

  it("should only allow the owner to release the lock", async () => {
    if (process.env.SKIP_REDIS_TESTS) return;

    const lock = await lockService.acquire({
      key: TEST_KEY_PREFIX + "owner",
      ttlMs: 5000,
    });
    expect(lock.acquired).toBe(true);

    // Wrong owner cannot release
    const wrongRelease = await lockService.release(
      lock.lockKey,
      "wrong-owner-id",
    );
    expect(wrongRelease).toBe(false);

    // Lock is still held
    const lock2 = await lockService.acquire({
      key: TEST_KEY_PREFIX + "owner",
      ttlMs: 5000,
    });
    expect(lock2.acquired).toBe(false);

    // Correct owner can release
    const correctRelease = await lockService.release(
      lock.lockKey,
      lock.ownerId,
    );
    expect(correctRelease).toBe(true);
  });

  it("should auto-expire lock after TTL", async () => {
    if (process.env.SKIP_REDIS_TESTS) return;

    const lock = await lockService.acquire({
      key: TEST_KEY_PREFIX + "expire",
      ttlMs: 1000, // 1 second
    });
    expect(lock.acquired).toBe(true);

    // Wait for expiry
    await new Promise((r) => setTimeout(r, 1500));

    // Should be able to acquire after expiry
    const lock2 = await lockService.acquire({
      key: TEST_KEY_PREFIX + "expire",
      ttlMs: 5000,
    });
    expect(lock2.acquired).toBe(true);
    await lockService.release(lock2.lockKey, lock2.ownerId);
  });

  it("should release lock when withLock callback throws", async () => {
    if (process.env.SKIP_REDIS_TESTS) return;

    await expect(
      lockService.withLock(
        { key: TEST_KEY_PREFIX + "error", ttlMs: 5000 },
        async () => {
          throw new Error("test error");
        },
      ),
    ).rejects.toThrow("test error");

    // Lock should be released — next acquire should succeed
    const lock = await lockService.acquire({
      key: TEST_KEY_PREFIX + "error",
      ttlMs: 5000,
    });
    expect(lock.acquired).toBe(true);
    await lockService.release(lock.lockKey, lock.ownerId);
  });

  it("should allow independent keys to be acquired simultaneously", async () => {
    if (process.env.SKIP_REDIS_TESTS) return;

    const lockA = await lockService.acquire({
      key: TEST_KEY_PREFIX + "key-a",
      ttlMs: 5000,
    });
    const lockB = await lockService.acquire({
      key: TEST_KEY_PREFIX + "key-b",
      ttlMs: 5000,
    });

    expect(lockA.acquired).toBe(true);
    expect(lockB.acquired).toBe(true);

    await lockService.release(lockA.lockKey, lockA.ownerId);
    await lockService.release(lockB.lockKey, lockB.ownerId);
  });
});
