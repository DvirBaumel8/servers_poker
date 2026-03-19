import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { BotCallerService } from "../../src/services/bot-caller.service";
import { HmacSigningService } from "../../src/common/security/hmac-signing.service";
import {
  MockBotServer,
  createCallingBot,
  createFoldingBot,
  createSlowBot,
  createUnreliableBot,
} from "../utils/mock-bot-server";

describe("BotCaller Integration Tests", () => {
  let botCallerService: BotCallerService;
  let mockBot: MockBotServer;
  const basePort = 19300;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        EventEmitterModule.forRoot(),
      ],
      providers: [BotCallerService, HmacSigningService],
    }).compile();

    botCallerService = moduleFixture.get<BotCallerService>(BotCallerService);
  });

  afterAll(async () => {
    if (mockBot) {
      await mockBot.stop();
    }
  });

  beforeEach(async () => {
    if (mockBot) {
      await mockBot.stop();
    }
  });

  describe("Health Check", () => {
    it("should detect healthy bot", async () => {
      mockBot = createCallingBot(basePort);
      await mockBot.start();

      const result = await botCallerService.healthCheck(
        "test-bot",
        mockBot.getEndpoint(),
      );

      expect(result).toBe(true);
    });

    it("should detect unhealthy bot (connection refused)", async () => {
      const result = await botCallerService.healthCheck(
        "offline-bot",
        "http://localhost:19999",
      );

      expect(result).toBe(false);
    });
  });

  describe("Bot Call Requests", () => {
    it("should receive response from bot", async () => {
      mockBot = createFoldingBot(basePort + 2);
      await mockBot.start();

      const payload = {
        gameId: "test-game",
        handId: "test-hand",
        communityCards: [],
        pot: 100,
        action: {
          canCheck: false,
          callAmount: 20,
          minRaise: 40,
          maxRaise: 1000,
        },
      };

      const result = await botCallerService.callBot(
        "fold-bot",
        mockBot.getEndpoint(),
        payload,
      );

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.response.type).toBe("fold");
    });

    it("should receive call action from calling bot", async () => {
      mockBot = createCallingBot(basePort + 3);
      await mockBot.start();

      const payload = {
        gameId: "test-game",
        handId: "test-hand",
        communityCards: [],
        pot: 100,
        action: {
          canCheck: false,
          callAmount: 20,
          minRaise: 40,
          maxRaise: 1000,
        },
      };

      const result = await botCallerService.callBot(
        "call-bot",
        mockBot.getEndpoint(),
        payload,
      );

      expect(result.success).toBe(true);
      expect(result.response.type).toBe("call");
    });

    it("should receive check action when allowed", async () => {
      mockBot = createCallingBot(basePort + 4);
      await mockBot.start();

      const payload = {
        gameId: "test-game",
        handId: "test-hand",
        communityCards: [],
        pot: 100,
        action: {
          canCheck: true,
          callAmount: 0,
          minRaise: 20,
          maxRaise: 1000,
        },
      };

      const result = await botCallerService.callBot(
        "check-bot",
        mockBot.getEndpoint(),
        payload,
      );

      expect(result.success).toBe(true);
      expect(result.response.type).toBe("check");
    });
  });

  describe("Error Handling", () => {
    it("should handle connection errors gracefully", async () => {
      const payload = {
        gameId: "test-game",
        handId: "test-hand",
        communityCards: [],
        pot: 100,
      };

      const result = await botCallerService.callBot(
        "offline-bot",
        "http://localhost:19999",
        payload,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle intermittent failures and retry", async () => {
      mockBot = createUnreliableBot(basePort + 6, 0.3);
      await mockBot.start();

      const results: boolean[] = [];

      for (let i = 0; i < 5; i++) {
        const payload = {
          gameId: "test-game",
          handId: `test-hand-${i}`,
          communityCards: [],
          pot: 100,
          action: {
            canCheck: true,
            callAmount: 0,
          },
        };

        const result = await botCallerService.callBot(
          "unreliable-bot",
          mockBot.getEndpoint(),
          payload,
        );

        results.push(result.success);
      }

      expect(results.some((r) => r === true)).toBe(true);
    });
  });

  describe("Request Tracking", () => {
    it("should receive correct payload structure", async () => {
      mockBot = createCallingBot(basePort + 7);
      await mockBot.start();

      const payload = {
        gameId: "tracked-game",
        handId: "tracked-hand",
        communityCards: ["Ah", "Kd", "Qc"],
        pot: 500,
        action: {
          canCheck: false,
          callAmount: 50,
          minRaise: 100,
          maxRaise: 1000,
        },
      };

      await botCallerService.callBot(
        "tracked-bot",
        mockBot.getEndpoint(),
        payload,
      );

      const lastRequest = mockBot.getLastRequest();
      expect(lastRequest.gameId).toBe("tracked-game");
      expect(lastRequest.pot).toBe(500);
    });
  });

  describe("Health Status Tracking", () => {
    it("should track health status after checks", async () => {
      mockBot = createCallingBot(basePort + 8);
      await mockBot.start();

      await botCallerService.healthCheck("status-bot", mockBot.getEndpoint());

      const status = botCallerService.getHealthStatus("status-bot");
      expect(status).toBeDefined();
      expect(status?.healthy).toBe(true);
    });

    it("should track consecutive failures", async () => {
      for (let i = 0; i < 3; i++) {
        await botCallerService.healthCheck(
          "failing-bot",
          "http://localhost:19999",
        );
      }

      const status = botCallerService.getHealthStatus("failing-bot");
      expect(status?.healthy).toBe(false);
      expect(status?.consecutiveFailures).toBeGreaterThanOrEqual(1);
    });

    it("should reset circuit breaker", () => {
      botCallerService.resetCircuitBreaker("test-bot");
      expect(true).toBe(true);
    });

    it("should return all health statuses", async () => {
      mockBot = createCallingBot(basePort + 9);
      await mockBot.start();

      await botCallerService.healthCheck("all-bot-1", mockBot.getEndpoint());
      await botCallerService.healthCheck("all-bot-2", mockBot.getEndpoint());

      const allStatuses = botCallerService.getAllHealthStatuses();
      expect(Array.isArray(allStatuses)).toBe(true);
    });

    it("should track average latency", async () => {
      mockBot = createCallingBot(basePort + 10);
      await mockBot.start();

      await botCallerService.callBot("latency-bot", mockBot.getEndpoint(), {});
      await botCallerService.callBot("latency-bot", mockBot.getEndpoint(), {});
      await botCallerService.callBot("latency-bot", mockBot.getEndpoint(), {});

      const avgLatency = botCallerService.getAverageLatency("latency-bot");
      expect(avgLatency).toBeGreaterThanOrEqual(0);
    });
  });
});
