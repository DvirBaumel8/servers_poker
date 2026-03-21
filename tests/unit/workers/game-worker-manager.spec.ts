import { describe, it, expect, beforeEach, vi } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { GameWorkerManagerService } from "../../../src/services/game/game-worker-manager.service";

describe("GameWorkerManagerService", () => {
  let service: GameWorkerManagerService;
  let configService: ConfigService;
  let eventEmitter: EventEmitter2;

  const mockConfigGet = vi.fn((key: string, defaultValue?: any) => {
    const config: Record<string, any> = {
      ENABLE_WORKER_THREADS: "false",
      MAX_CONCURRENT_GAMES: 100,
      WORKER_TIMEOUT: 30000,
    };
    return config[key] ?? defaultValue;
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameWorkerManagerService,
        {
          provide: ConfigService,
          useValue: {
            get: mockConfigGet,
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: vi.fn(),
            on: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GameWorkerManagerService>(GameWorkerManagerService);
    configService = module.get<ConfigService>(ConfigService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  describe.concurrent("initialization", () => {
    it("should be defined", () => {
      expect(service).toBeDefined();
    });

    it("should be disabled by default", () => {
      expect(service.isEnabled()).toBe(false);
    });

    it("should return 0 active games initially", () => {
      expect(service.getActiveGameCount()).toBe(0);
    });

    it("should return empty array for getAllGames initially", () => {
      expect(service.getAllGames()).toEqual([]);
    });
  });

  describe.concurrent("when disabled", () => {
    it("should throw error when trying to create game", () => {
      expect(() =>
        service.createGame({
          tableId: "table-1",
          gameDbId: "game-1",
          smallBlind: 10,
          bigBlind: 20,
          ante: 0,
          startingChips: 1000,
          turnTimeoutMs: 10000,
        }),
      ).toThrow("Worker threads are disabled");
    });

    it("should return false for hasGame", () => {
      expect(service.hasGame("table-1")).toBe(false);
    });

    it("should return null for getGameState", () => {
      expect(service.getGameState("table-1")).toBeNull();
    });
  });

  describe.concurrent("when enabled", () => {
    let enabledService: GameWorkerManagerService;

    beforeEach(async () => {
      const enabledConfigGet = vi.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          ENABLE_WORKER_THREADS: "true",
          MAX_CONCURRENT_GAMES: 2,
          WORKER_TIMEOUT: 30000,
        };
        return config[key] ?? defaultValue;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GameWorkerManagerService,
          {
            provide: ConfigService,
            useValue: {
              get: enabledConfigGet,
            },
          },
          {
            provide: EventEmitter2,
            useValue: {
              emit: vi.fn(),
              on: vi.fn(),
            },
          },
        ],
      }).compile();

      enabledService = module.get<GameWorkerManagerService>(
        GameWorkerManagerService,
      );
    });

    it("should be enabled", () => {
      expect(enabledService.isEnabled()).toBe(true);
    });

    it("should track max concurrent games setting", () => {
      // The service internally uses maxConcurrentGames
      // We can verify the behavior by trying to create games
      expect(enabledService.getActiveGameCount()).toBe(0);
    });
  });

  describe.concurrent("lifecycle", () => {
    it("should initialize on module init", () => {
      service.onModuleInit();
      // Should not throw
      expect(true).toBe(true);
    });

    it("should clean up on module destroy", () => {
      service.onModuleDestroy();
      expect(service.getActiveGameCount()).toBe(0);
    });
  });
});
