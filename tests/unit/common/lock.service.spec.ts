import { describe, it, expect, vi, beforeEach } from "vitest";
import { LockService } from "../../../src/common/redis/lock.service";
import { RedisService } from "../../../src/common/redis/redis.service";

describe("LockService", () => {
  let lockService: LockService;
  let redisService: Partial<RedisService>;

  beforeEach(() => {
    redisService = {
      setNX: vi.fn(),
      eval: vi.fn(),
      getKeyPrefix: vi.fn().mockReturnValue("poker:"),
    };
    lockService = new LockService(redisService as RedisService);
  });

  describe("acquire", () => {
    it("should call setNX with correct key, owner UUID, and TTL in seconds", async () => {
      (redisService.setNX as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await lockService.acquire({
        key: "lock:test",
        ttlMs: 60_000,
      });

      expect(result.acquired).toBe(true);
      expect(result.lockKey).toBe("lock:test");
      expect(result.ownerId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(redisService.setNX).toHaveBeenCalledWith(
        "lock:test",
        result.ownerId,
        expect.any(Number),
      );
    });

    it("should apply clock drift safety margin to TTL", async () => {
      (redisService.setNX as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await lockService.acquire({ key: "lock:test", ttlMs: 60_000 });

      // Effective TTL = 60000 - (60000 * 0.05) - 2 = 56998ms → ceil(56998/1000) = 57s
      const ttlArg = (redisService.setNX as ReturnType<typeof vi.fn>).mock
        .calls[0][2];
      expect(ttlArg).toBe(57);
    });

    it("should return acquired=false when setNX returns false", async () => {
      (redisService.setNX as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const result = await lockService.acquire({
        key: "lock:test",
        ttlMs: 10_000,
      });

      expect(result.acquired).toBe(false);
    });

    it("should return acquired=false on Redis error", async () => {
      (redisService.setNX as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Connection refused"),
      );

      const result = await lockService.acquire({
        key: "lock:test",
        ttlMs: 10_000,
      });

      expect(result.acquired).toBe(false);
    });

    it("should generate unique owner IDs for each call", async () => {
      (redisService.setNX as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const r1 = await lockService.acquire({
        key: "lock:a",
        ttlMs: 10_000,
      });
      const r2 = await lockService.acquire({
        key: "lock:b",
        ttlMs: 10_000,
      });

      expect(r1.ownerId).not.toBe(r2.ownerId);
    });
  });

  describe("release", () => {
    it("should call eval with Lua script and raw key (ioredis prefixes automatically)", async () => {
      (redisService.eval as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await lockService.release("lock:test", "owner-123");

      expect(result).toBe(true);
      expect(redisService.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("get", KEYS[1])'),
        ["lock:test"],
        ["owner-123"],
      );
    });

    it("should return false when Lua script returns 0 (different owner)", async () => {
      (redisService.eval as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      const result = await lockService.release("lock:test", "wrong-owner");

      expect(result).toBe(false);
    });

    it("should return false on Redis error", async () => {
      (redisService.eval as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Connection refused"),
      );

      const result = await lockService.release("lock:test", "owner-123");

      expect(result).toBe(false);
    });
  });

  describe("extend", () => {
    it("should call eval with extend script, raw key, and TTL", async () => {
      (redisService.eval as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await lockService.extend("lock:test", "owner-123", 5000);

      expect(result).toBe(true);
      expect(redisService.eval).toHaveBeenCalledWith(
        expect.stringContaining("pexpire"),
        ["lock:test"],
        ["owner-123", 5000],
      );
    });

    it("should return false when lock is not owned", async () => {
      (redisService.eval as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      const result = await lockService.extend("lock:test", "wrong-owner", 5000);

      expect(result).toBe(false);
    });
  });

  describe("withLock", () => {
    it("should execute callback and return its result when lock acquired", async () => {
      (redisService.setNX as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (redisService.eval as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const result = await lockService.withLock(
        { key: "lock:test", ttlMs: 10_000 },
        async () => "success",
      );

      expect(result).toBe("success");
      expect(redisService.eval).toHaveBeenCalled(); // release called
    });

    it("should return null when lock cannot be acquired", async () => {
      (redisService.setNX as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const callback = vi.fn();

      const result = await lockService.withLock(
        { key: "lock:test", ttlMs: 10_000 },
        callback,
      );

      expect(result).toBeNull();
      expect(callback).not.toHaveBeenCalled();
    });

    it("should release lock even when callback throws", async () => {
      (redisService.setNX as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (redisService.eval as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      await expect(
        lockService.withLock({ key: "lock:test", ttlMs: 10_000 }, async () => {
          throw new Error("callback error");
        }),
      ).rejects.toThrow("callback error");

      expect(redisService.eval).toHaveBeenCalled(); // release was called
    });

    it("should not call release when acquire fails", async () => {
      (redisService.setNX as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await lockService.withLock(
        { key: "lock:test", ttlMs: 10_000 },
        async () => "nope",
      );

      expect(redisService.eval).not.toHaveBeenCalled();
    });
  });
});
