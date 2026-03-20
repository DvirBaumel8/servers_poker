import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Logger", () => {
  let logger: typeof import("../../src/logger").default;

  beforeEach(async () => {
    vi.resetModules();
    process.env.NODE_ENV = "development";
    process.env.LOG_LEVEL = "debug";
    logger = (await import("../../src/logger")).default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("basic logging", () => {
    it("should have debug method", () => {
      expect(typeof logger.debug).toBe("function");
    });

    it("should have info method", () => {
      expect(typeof logger.info).toBe("function");
    });

    it("should have warn method", () => {
      expect(typeof logger.warn).toBe("function");
    });

    it("should have error method", () => {
      expect(typeof logger.error).toBe("function");
    });

    it("should have critical method", () => {
      expect(typeof logger.critical).toBe("function");
    });

    it("should log debug messages", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      logger.debug("TestComponent", "Debug message");
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should log info messages", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      logger.info("TestComponent", "Info message");
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should log warn messages", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      logger.warn("TestComponent", "Warning message");
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should log error messages", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      logger.error("TestComponent", "Error message");
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should log with context", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      logger.info("TestComponent", "Message with context", { key: "value" });
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should log with error object", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const testError = new Error("Test error");
      logger.error("TestComponent", "Error with stack", {}, testError);
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe("gameError", () => {
    it("should log game errors with context", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const mockGame = {
        gameId: "game-123",
        handNumber: 5,
        stage: "flop",
        ante: 0,
        smallBlind: 10,
        bigBlind: 20,
        potManager: { getTotalPot: () => 100 },
        players: [
          {
            name: "Bot1",
            chips: 1000,
            bet: 20,
            folded: false,
            allIn: false,
            disconnected: false,
            strikes: 0,
            holeCards: [
              { rank: "A", suit: "s" },
              { rank: "K", suit: "s" },
            ],
          },
        ],
        communityCards: [
          { rank: "Q", suit: "h" },
          { rank: "J", suit: "d" },
          { rank: "T", suit: "c" },
        ],
      };

      logger.gameError("Betting", "Invalid bet amount", mockGame, {
        betAmount: -100,
      });

      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should handle null game object", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      logger.gameError("Betting", "Game is null", null);
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe("tournamentError", () => {
    it("should log tournament errors with context", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const mockDirector = {
        tournamentId: "tourney-123",
        currentLevel: 3,
        handsThisLevel: 25,
        activeBots: new Set(["bot1", "bot2"]),
        tables: new Map([["table1", {}]]),
        bustOrder: ["bot3"],
      };

      logger.tournamentError("Tournament", "Player bust", mockDirector, {
        botId: "bot4",
      });

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe("assert", () => {
    it("should not throw when condition is true", () => {
      expect(() => {
        logger.assert(true, "Test", "Condition should be true");
      }).not.toThrow();
    });

    it("should throw when condition is false", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() => {
        logger.assert(false, "Test", "Condition should be true");
      }).toThrow("Assertion failed");
    });

    it("should not throw when shouldThrow is false", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const result = logger.assert(
        false,
        "Test",
        "Condition should be true",
        {},
        false,
      );
      expect(result).toBe(false);
    });

    it("should return true for truthy condition", () => {
      const result = logger.assert(1, "Test", "Truthy check");
      expect(result).toBe(true);
    });
  });

  describe("getRecentErrors", () => {
    it("should return array of recent errors", () => {
      const errors = logger.getRecentErrors();
      expect(Array.isArray(errors)).toBe(true);
    });

    it("should accept custom count", () => {
      const errors = logger.getRecentErrors(10);
      expect(Array.isArray(errors)).toBe(true);
    });
  });
});
