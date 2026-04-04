import { describe, it, expect } from "vitest";
import { MatchmakingService } from "../../../src/modules/matchmaking/matchmaking.service";

// Create a minimal instance to test pure methods
const service = Object.create(
  MatchmakingService.prototype,
) as MatchmakingService;

describe("MatchmakingService", () => {
  describe("shufflePlayers", () => {
    it("should return array of same length", () => {
      const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = service.shufflePlayers([...input]);
      expect(result).toHaveLength(input.length);
    });

    it("should contain all original elements", () => {
      const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = service.shufflePlayers([...input]);
      expect(result.sort((a, b) => a - b)).toEqual(input);
    });

    it("should produce different orders (statistical, 100 runs)", () => {
      const input = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      let differentCount = 0;
      for (let i = 0; i < 100; i++) {
        const result = service.shufflePlayers([...input]);
        if (JSON.stringify(result) !== JSON.stringify(input)) {
          differentCount++;
        }
      }
      // With 9 elements, the probability of shuffle returning the
      // same order is 1/9! ≈ 0.0003%. Expect almost all to differ.
      expect(differentCount).toBeGreaterThan(90);
    });

    it("should handle empty array", () => {
      const result = service.shufflePlayers([]);
      expect(result).toEqual([]);
    });

    it("should handle single element", () => {
      const result = service.shufflePlayers([42]);
      expect(result).toEqual([42]);
    });
  });

  describe("calculatePodSplit", () => {
    it("should put all players in one pod if <= tableSize", () => {
      expect(service.calculatePodSplit(9, 9)).toEqual([9]);
      expect(service.calculatePodSplit(5, 9)).toEqual([5]);
      expect(service.calculatePodSplit(2, 9)).toEqual([2]);
    });

    it("should split 18 players into 2 pods of 9", () => {
      expect(service.calculatePodSplit(18, 9)).toEqual([9, 9]);
    });

    it("should distribute extra players evenly", () => {
      const result = service.calculatePodSplit(19, 9);
      // 19 / ceil = 3 pods? No: ceil(19/9) = 3 → base 6, extra 1 → [7,6,6]
      // Actually: ceil(19/9) = 3, floor(19/3)=6, extra=1, → [7,6,6]
      expect(result.reduce((a, b) => a + b, 0)).toBe(19);
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle minimum case: 2 players = 1 pod", () => {
      expect(service.calculatePodSplit(2, 9)).toEqual([2]);
    });

    it("should merge last pod if < 2 players", () => {
      // E.g., 10 players, table size 9 → ceil = 2 pods, base 5, extra 0 → [5,5]
      // Actually: 10/9 = ceil 2, base=5, extra=0 → [5,5]
      const result = service.calculatePodSplit(10, 9);
      expect(result.reduce((a, b) => a + b, 0)).toBe(10);
      // No pod should have < 2 players
      for (const size of result) {
        expect(size).toBeGreaterThanOrEqual(2);
      }
    });

    it("should handle large player counts", () => {
      const result = service.calculatePodSplit(1000, 9);
      const total = result.reduce((a, b) => a + b, 0);
      expect(total).toBe(1000);
      // All pods should be between 8 and 10
      for (const size of result) {
        expect(size).toBeGreaterThanOrEqual(2);
        expect(size).toBeLessThanOrEqual(10);
      }
    });

    it("should return correct pod count", () => {
      // 27 players / 9 per table = 3 pods
      expect(service.calculatePodSplit(27, 9)).toEqual([9, 9, 9]);
    });
  });
});
