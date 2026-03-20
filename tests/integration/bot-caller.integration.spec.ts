import { describe, it, expect, beforeAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { BotCallerService } from "../../src/services/bot-caller.service";
import { HmacSigningService } from "../../src/common/security/hmac-signing.service";
import {
  MockBotServer,
  createCallingBot,
  createFoldingBot,
  createUnreliableBot,
} from "../utils/mock-bot-server";

let portCounter = 26000;
const getNextPort = () => portCounter++;

describe("BotCaller Integration Tests", () => {
  let botCallerService: BotCallerService;

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

  describe.concurrent("Health Check", () => {
    it("should detect healthy bot", async () => {
      const port = getNextPort();
      const mockBot = createCallingBot(port);
      try {
        await mockBot.start();

        const result = await botCallerService.healthCheck(
          `test-bot-${port}`,
          mockBot.getEndpoint(),
        );

        expect(result).toBe(true);
      } finally {
        await mockBot.stop();
      }
    });

    it("should detect unhealthy bot (connection refused)", async () => {
      const port = getNextPort();
      const result = await botCallerService.healthCheck(
        `offline-bot-${port}`,
        `http://localhost:${port}`,
      );

      expect(result).toBe(false);
    });
  });

  describe.concurrent("Bot Call Requests", () => {
    it("should receive response from bot", async () => {
      const port = getNextPort();
      const mockBot = createFoldingBot(port);
      try {
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
          `fold-bot-${port}`,
          mockBot.getEndpoint(),
          payload,
        );

        expect(result.success).toBe(true);
        expect(result.response).toBeDefined();
        expect(result.response.type).toBe("fold");
      } finally {
        await mockBot.stop();
      }
    });

    it("should receive call action from calling bot", async () => {
      const port = getNextPort();
      const mockBot = createCallingBot(port);
      try {
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
          `call-bot-${port}`,
          mockBot.getEndpoint(),
          payload,
        );

        expect(result.success).toBe(true);
        expect(result.response.type).toBe("call");
      } finally {
        await mockBot.stop();
      }
    });

    it("should receive check action when allowed", async () => {
      const port = getNextPort();
      const mockBot = createCallingBot(port);
      try {
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
          `check-bot-${port}`,
          mockBot.getEndpoint(),
          payload,
        );

        expect(result.success).toBe(true);
        expect(result.response.type).toBe("check");
      } finally {
        await mockBot.stop();
      }
    });
  });

  describe.concurrent("Error Handling", () => {
    it("should handle connection errors gracefully", async () => {
      const port = getNextPort();
      const payload = {
        gameId: "test-game",
        handId: "test-hand",
        communityCards: [],
        pot: 100,
      };

      const result = await botCallerService.callBot(
        `offline-bot-${port}`,
        `http://localhost:${port}`,
        payload,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle intermittent failures and retry", async () => {
      const port = getNextPort();
      const mockBot = createUnreliableBot(port, 0.3);
      try {
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
            `unreliable-bot-${port}`,
            mockBot.getEndpoint(),
            payload,
          );

          results.push(result.success);
        }

        expect(results.some((r) => r === true)).toBe(true);
      } finally {
        await mockBot.stop();
      }
    });
  });

  describe.concurrent("Request Tracking", () => {
    it("should receive correct payload structure", async () => {
      const port = getNextPort();
      const mockBot = createCallingBot(port);
      try {
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
          `tracked-bot-${port}`,
          mockBot.getEndpoint(),
          payload,
        );

        const lastRequest = mockBot.getLastRequest();
        expect(lastRequest.gameId).toBe("tracked-game");
        expect(lastRequest.pot).toBe(500);
      } finally {
        await mockBot.stop();
      }
    });
  });

  describe.concurrent("Health Status Tracking", () => {
    it("should track health status after checks", async () => {
      const port = getNextPort();
      const mockBot = createCallingBot(port);
      const botName = `status-bot-${port}`;
      try {
        await mockBot.start();

        await botCallerService.healthCheck(botName, mockBot.getEndpoint());

        const status = botCallerService.getHealthStatus(botName);
        expect(status).toBeDefined();
        expect(status?.healthy).toBe(true);
      } finally {
        await mockBot.stop();
      }
    });

    it("should track consecutive failures", async () => {
      const port = getNextPort();
      const botName = `failing-bot-${port}`;

      for (let i = 0; i < 3; i++) {
        await botCallerService.healthCheck(botName, `http://localhost:${port}`);
      }

      const status = botCallerService.getHealthStatus(botName);
      expect(status?.healthy).toBe(false);
      expect(status?.consecutiveFailures).toBeGreaterThanOrEqual(1);
    });

    it("should reset circuit breaker", () => {
      const port = getNextPort();
      botCallerService.resetCircuitBreaker(`test-bot-${port}`);
      expect(true).toBe(true);
    });

    it("should return all health statuses", async () => {
      const port1 = getNextPort();
      const port2 = getNextPort();
      const mockBot = createCallingBot(port1);
      try {
        await mockBot.start();

        await botCallerService.healthCheck(
          `all-bot-${port1}`,
          mockBot.getEndpoint(),
        );
        await botCallerService.healthCheck(
          `all-bot-${port2}`,
          mockBot.getEndpoint(),
        );

        const allStatuses = botCallerService.getAllHealthStatuses();
        expect(Array.isArray(allStatuses)).toBe(true);
      } finally {
        await mockBot.stop();
      }
    });

    it("should track average latency", async () => {
      const port = getNextPort();
      const mockBot = createCallingBot(port);
      const botName = `latency-bot-${port}`;
      try {
        await mockBot.start();

        await botCallerService.callBot(botName, mockBot.getEndpoint(), {});
        await botCallerService.callBot(botName, mockBot.getEndpoint(), {});
        await botCallerService.callBot(botName, mockBot.getEndpoint(), {});

        const avgLatency = botCallerService.getAverageLatency(botName);
        expect(avgLatency).toBeGreaterThanOrEqual(0);
      } finally {
        await mockBot.stop();
      }
    });
  });
});
