import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  BotResilienceService,
  GameContext,
  FallbackStrategy,
} from "../../../src/services/bot-resilience.service";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";

describe("BotResilienceService", () => {
  let service: BotResilienceService;
  let mockBotCaller: {
    callBot: ReturnType<typeof vi.fn>;
  };
  let mockConfigService: {
    get: ReturnType<typeof vi.fn>;
  };
  let mockEventEmitter: {
    emit: ReturnType<typeof vi.fn>;
  };

  const defaultGameContext: GameContext = {
    gameId: "game-123",
    handNumber: 1,
    stage: "preflop",
    pot: 100,
    currentBet: 20,
    toCall: 20,
    canCheck: false,
    minRaise: 40,
    maxRaise: 1000,
  };

  beforeEach(() => {
    mockBotCaller = {
      callBot: vi.fn(),
    };

    mockConfigService = {
      get: vi.fn().mockReturnValue("conservative"),
    };

    mockEventEmitter = {
      emit: vi.fn(),
    };

    service = new BotResilienceService(
      mockBotCaller as never,
      mockConfigService as ConfigService,
      mockEventEmitter as EventEmitter2,
    );
  });

  describe("callBotWithFallback", () => {
    it("should return bot response when successful and valid", async () => {
      mockBotCaller.callBot.mockResolvedValue({
        success: true,
        response: { type: "call" },
      });

      const result = await service.callBotWithFallback({
        botId: "bot-123",
        endpoint: "http://localhost:4000/action",
        payload: {},
        gameContext: defaultGameContext,
      });

      expect(result.action.type).toBe("call");
      expect(result.usedFallback).toBe(false);
    });

    it("should use fallback when bot call fails", async () => {
      mockBotCaller.callBot.mockResolvedValue({
        success: false,
        error: "Connection timeout",
      });

      const result = await service.callBotWithFallback({
        botId: "bot-123",
        endpoint: "http://localhost:4000/action",
        payload: {},
        gameContext: defaultGameContext,
      });

      expect(result.usedFallback).toBe(true);
      expect(result.fallbackReason).toBe("Connection timeout");
    });

    it("should use fallback when response is invalid", async () => {
      mockBotCaller.callBot.mockResolvedValue({
        success: true,
        response: { invalid: "response" },
      });

      const result = await service.callBotWithFallback({
        botId: "bot-123",
        endpoint: "http://localhost:4000/action",
        payload: {},
        gameContext: defaultGameContext,
      });

      expect(result.usedFallback).toBe(true);
      expect(result.fallbackReason).toBe("invalid_response");
    });

    it("should emit event when fallback is used", async () => {
      mockBotCaller.callBot.mockResolvedValue({
        success: false,
        error: "timeout",
      });

      await service.callBotWithFallback({
        botId: "bot-123",
        endpoint: "http://localhost:4000/action",
        payload: {},
        gameContext: defaultGameContext,
      });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        "bot.usedFallback",
        expect.objectContaining({
          botId: "bot-123",
          gameId: "game-123",
        }),
      );
    });
  });

  describe("generateFallbackAction", () => {
    describe("conservative strategy", () => {
      it("should check when allowed", () => {
        const context = { ...defaultGameContext, canCheck: true };
        const action = service.generateFallbackAction("conservative", context);
        expect(action.type).toBe("check");
      });

      it("should call when to_call is small relative to pot", () => {
        const context = { ...defaultGameContext, toCall: 10, pot: 100 };
        const action = service.generateFallbackAction("conservative", context);
        expect(action.type).toBe("call");
      });

      it("should fold when to_call is large relative to pot", () => {
        const context = { ...defaultGameContext, toCall: 50, pot: 100 };
        const action = service.generateFallbackAction("conservative", context);
        expect(action.type).toBe("fold");
      });
    });

    describe("aggressive strategy", () => {
      it("should sometimes raise when can check", () => {
        const context = { ...defaultGameContext, canCheck: true };
        const actions = new Set<string>();

        vi.spyOn(Math, "random").mockReturnValue(0.9);
        const action1 = service.generateFallbackAction("aggressive", context);
        actions.add(action1.type);

        vi.spyOn(Math, "random").mockReturnValue(0.1);
        const action2 = service.generateFallbackAction("aggressive", context);
        actions.add(action2.type);

        expect(actions.has("check") || actions.has("raise")).toBe(true);
        vi.restoreAllMocks();
      });

      it("should call when to_call is moderate", () => {
        const context = { ...defaultGameContext, toCall: 30, pot: 100 };
        const action = service.generateFallbackAction("aggressive", context);
        expect(action.type).toBe("call");
      });

      it("should fold when to_call is very high", () => {
        const context = { ...defaultGameContext, toCall: 100, pot: 100 };
        const action = service.generateFallbackAction("aggressive", context);
        expect(action.type).toBe("fold");
      });
    });

    describe("random strategy", () => {
      it("should include check when allowed", () => {
        const context = { ...defaultGameContext, canCheck: true };
        vi.spyOn(Math, "random").mockReturnValue(0);
        const action = service.generateFallbackAction("random", context);
        expect(action.type).toBe("check");
        vi.restoreAllMocks();
      });

      it("should include fold when cannot check", () => {
        const context = { ...defaultGameContext, canCheck: false };
        vi.spyOn(Math, "random").mockReturnValue(0);
        const action = service.generateFallbackAction("random", context);
        expect(action.type).toBe("fold");
        vi.restoreAllMocks();
      });
    });

    describe("check_fold strategy", () => {
      it("should check when allowed", () => {
        const context = { ...defaultGameContext, canCheck: true };
        const action = service.generateFallbackAction("check_fold", context);
        expect(action.type).toBe("check");
      });

      it("should fold when cannot check", () => {
        const context = { ...defaultGameContext, canCheck: false };
        const action = service.generateFallbackAction("check_fold", context);
        expect(action.type).toBe("fold");
      });
    });
  });

  describe("validateAndNormalizeAction", () => {
    it("should accept valid fold", async () => {
      mockBotCaller.callBot.mockResolvedValue({
        success: true,
        response: { type: "fold" },
      });

      const result = await service.callBotWithFallback({
        botId: "bot-123",
        endpoint: "http://localhost:4000/action",
        payload: {},
        gameContext: defaultGameContext,
      });

      expect(result.action.type).toBe("fold");
      expect(result.usedFallback).toBe(false);
    });

    it("should accept valid check when allowed", async () => {
      mockBotCaller.callBot.mockResolvedValue({
        success: true,
        response: { type: "check" },
      });

      const result = await service.callBotWithFallback({
        botId: "bot-123",
        endpoint: "http://localhost:4000/action",
        payload: {},
        gameContext: { ...defaultGameContext, canCheck: true },
      });

      expect(result.action.type).toBe("check");
      expect(result.usedFallback).toBe(false);
    });

    it("should reject check when not allowed", async () => {
      mockBotCaller.callBot.mockResolvedValue({
        success: true,
        response: { type: "check" },
      });

      const result = await service.callBotWithFallback({
        botId: "bot-123",
        endpoint: "http://localhost:4000/action",
        payload: {},
        gameContext: { ...defaultGameContext, canCheck: false },
      });

      expect(result.usedFallback).toBe(true);
    });

    it("should accept valid call", async () => {
      mockBotCaller.callBot.mockResolvedValue({
        success: true,
        response: { type: "call" },
      });

      const result = await service.callBotWithFallback({
        botId: "bot-123",
        endpoint: "http://localhost:4000/action",
        payload: {},
        gameContext: defaultGameContext,
      });

      expect(result.action.type).toBe("call");
    });

    it("should accept valid raise with amount", async () => {
      mockBotCaller.callBot.mockResolvedValue({
        success: true,
        response: { type: "raise", amount: 100 },
      });

      const result = await service.callBotWithFallback({
        botId: "bot-123",
        endpoint: "http://localhost:4000/action",
        payload: {},
        gameContext: defaultGameContext,
      });

      expect(result.action.type).toBe("raise");
      expect(result.action.amount).toBe(100);
    });

    it("should clamp raise to min raise", async () => {
      mockBotCaller.callBot.mockResolvedValue({
        success: true,
        response: { type: "raise", amount: 10 },
      });

      const result = await service.callBotWithFallback({
        botId: "bot-123",
        endpoint: "http://localhost:4000/action",
        payload: {},
        gameContext: { ...defaultGameContext, minRaise: 40 },
      });

      expect(result.action.amount).toBe(40);
    });

    it("should clamp raise to max raise", async () => {
      mockBotCaller.callBot.mockResolvedValue({
        success: true,
        response: { type: "raise", amount: 5000 },
      });

      const result = await service.callBotWithFallback({
        botId: "bot-123",
        endpoint: "http://localhost:4000/action",
        payload: {},
        gameContext: { ...defaultGameContext, maxRaise: 1000 },
      });

      expect(result.action.amount).toBe(1000);
    });

    it("should accept all_in", async () => {
      mockBotCaller.callBot.mockResolvedValue({
        success: true,
        response: { type: "all_in" },
      });

      const result = await service.callBotWithFallback({
        botId: "bot-123",
        endpoint: "http://localhost:4000/action",
        payload: {},
        gameContext: defaultGameContext,
      });

      expect(result.action.type).toBe("all_in");
    });

    it("should reject invalid response object", async () => {
      mockBotCaller.callBot.mockResolvedValue({
        success: true,
        response: "not an object",
      });

      const result = await service.callBotWithFallback({
        botId: "bot-123",
        endpoint: "http://localhost:4000/action",
        payload: {},
        gameContext: defaultGameContext,
      });

      expect(result.usedFallback).toBe(true);
    });

    it("should reject response without type", async () => {
      mockBotCaller.callBot.mockResolvedValue({
        success: true,
        response: { amount: 100 },
      });

      const result = await service.callBotWithFallback({
        botId: "bot-123",
        endpoint: "http://localhost:4000/action",
        payload: {},
        gameContext: defaultGameContext,
      });

      expect(result.usedFallback).toBe(true);
    });

    it("should reject raise without valid amount", async () => {
      mockBotCaller.callBot.mockResolvedValue({
        success: true,
        response: { type: "raise", amount: -50 },
      });

      const result = await service.callBotWithFallback({
        botId: "bot-123",
        endpoint: "http://localhost:4000/action",
        payload: {},
        gameContext: defaultGameContext,
      });

      expect(result.usedFallback).toBe(true);
    });

    it("should handle case-insensitive action types", async () => {
      mockBotCaller.callBot.mockResolvedValue({
        success: true,
        response: { type: "FOLD" },
      });

      const result = await service.callBotWithFallback({
        botId: "bot-123",
        endpoint: "http://localhost:4000/action",
        payload: {},
        gameContext: defaultGameContext,
      });

      expect(result.action.type).toBe("fold");
    });
  });
});
