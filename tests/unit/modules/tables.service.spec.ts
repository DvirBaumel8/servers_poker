import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { TablesService } from "../../../src/modules/games/tables.service";

describe("TablesService", () => {
  let service: TablesService;
  let mockTableRepository: {
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    findByStatus: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
    getSeatCount: ReturnType<typeof vi.fn>;
    atomicJoinTable: ReturnType<typeof vi.fn>;
  };
  let mockBotRepository: {
    findById: ReturnType<typeof vi.fn>;
  };
  let mockGameRepository: {
    createGame: ReturnType<typeof vi.fn>;
    addGamePlayer: ReturnType<typeof vi.fn>;
  };
  let mockLiveGameManager: {
    getGame: ReturnType<typeof vi.fn>;
    createGame: ReturnType<typeof vi.fn>;
    getGameState: ReturnType<typeof vi.fn>;
    registerBotInGame: ReturnType<typeof vi.fn>;
  };
  let mockGameWorkerManager: {
    isEnabled: ReturnType<typeof vi.fn>;
    hasGame: ReturnType<typeof vi.fn>;
    createGame: ReturnType<typeof vi.fn>;
    addPlayer: ReturnType<typeof vi.fn>;
    getGameState: ReturnType<typeof vi.fn>;
    getAllGames: ReturnType<typeof vi.fn>;
  };
  let mockDataSource: {
    transaction: ReturnType<typeof vi.fn>;
  };

  const mockTable = {
    id: "table-123",
    name: "Test Table",
    small_blind: 10,
    big_blind: 20,
    starting_chips: 1000,
    max_players: 9,
    turn_timeout_ms: 10000,
    status: "waiting",
    created_at: new Date(),
  };

  const mockBot = {
    id: "bot-123",
    name: "TestBot",
    endpoint: "http://localhost:4000/action",
    user_id: "user-123",
    active: true,
  };

  beforeEach(() => {
    mockTableRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      findAll: vi.fn(),
      findByStatus: vi.fn(),
      updateStatus: vi.fn(),
      getSeatCount: vi.fn(),
      atomicJoinTable: vi.fn(),
    };

    mockBotRepository = {
      findById: vi.fn(),
    };

    mockGameRepository = {
      createGame: vi.fn(),
      addGamePlayer: vi.fn(),
    };

    mockLiveGameManager = {
      getGame: vi.fn(),
      createGame: vi.fn(),
      getGameState: vi.fn(),
      registerBotInGame: vi.fn(),
    };

    mockGameWorkerManager = {
      isEnabled: vi.fn().mockReturnValue(false),
      hasGame: vi.fn(),
      createGame: vi.fn(),
      addPlayer: vi.fn(),
      getGameState: vi.fn(),
      getAllGames: vi.fn(),
    };

    mockDataSource = {
      transaction: vi.fn(),
    };

    service = new TablesService(
      mockTableRepository as never,
      mockBotRepository as never,
      mockGameRepository as never,
      mockLiveGameManager as never,
      mockGameWorkerManager as never,
      mockDataSource as never,
    );
  });

  describe("create", () => {
    it("should create table successfully", async () => {
      mockTableRepository.create.mockResolvedValue(mockTable);

      const result = await service.create({ name: "Test Table" });

      expect(result.name).toBe("Test Table");
      expect(mockTableRepository.create).toHaveBeenCalled();
    });

    it("should use default values when not provided", async () => {
      mockTableRepository.create.mockResolvedValue(mockTable);

      await service.create({ name: "Test Table" });

      expect(mockTableRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Test Table",
          small_blind: 10,
          big_blind: 20,
          starting_chips: 1000,
          max_players: 9,
          turn_timeout_ms: 10000,
        }),
      );
    });

    it("should throw BadRequestException for duplicate table name", async () => {
      mockTableRepository.create.mockRejectedValue({ code: "23505" });

      await expect(service.create({ name: "Duplicate" })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw BadRequestException for invalid configuration", async () => {
      mockTableRepository.create.mockRejectedValue({ code: "23514" });

      await expect(service.create({ name: "Invalid" })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("findById", () => {
    it("should return table when found", async () => {
      mockTableRepository.findById.mockResolvedValue(mockTable);

      const result = await service.findById("table-123");

      expect(result).toEqual(mockTable);
    });

    it("should return null when not found", async () => {
      mockTableRepository.findById.mockResolvedValue(null);

      const result = await service.findById("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("findAll", () => {
    it("should return all tables", async () => {
      mockTableRepository.findAll.mockResolvedValue([mockTable]);

      const result = await service.findAll();

      expect(result).toHaveLength(1);
    });
  });

  describe("findAllWithState", () => {
    it("should return tables with state info", async () => {
      mockTableRepository.findAll.mockResolvedValue([mockTable]);
      mockLiveGameManager.getGame.mockReturnValue(null);
      mockLiveGameManager.getGameState.mockReturnValue(null);

      const result = await service.findAllWithState();

      expect(result).toHaveLength(1);
      expect(result[0].config).toBeDefined();
    });
  });

  describe("findByStatus", () => {
    it("should return tables with specified status", async () => {
      mockTableRepository.findByStatus.mockResolvedValue([mockTable]);

      const result = await service.findByStatus("waiting");

      expect(mockTableRepository.findByStatus).toHaveBeenCalledWith("waiting");
      expect(result).toHaveLength(1);
    });
  });

  describe("updateStatus", () => {
    it("should update table status", async () => {
      mockTableRepository.updateStatus.mockResolvedValue({
        ...mockTable,
        status: "running",
      });

      const result = await service.updateStatus("table-123", "running");

      expect(result?.status).toBe("running");
    });
  });

  describe("getSeatCount", () => {
    it("should return seat count", async () => {
      mockTableRepository.getSeatCount.mockResolvedValue(3);

      const result = await service.getSeatCount("table-123");

      expect(result).toBe(3);
    });
  });

  describe("joinTable", () => {
    it("should throw BadRequestException when bot_id missing", async () => {
      await expect(
        service.joinTable("table-123", {}, "user-123"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw NotFoundException when table not found", async () => {
      mockTableRepository.findById.mockResolvedValue(null);

      await expect(
        service.joinTable("nonexistent", { bot_id: "bot-123" }, "user-123"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ConflictException when table is finished", async () => {
      mockTableRepository.findById.mockResolvedValue({
        ...mockTable,
        status: "finished",
      });

      await expect(
        service.joinTable("table-123", { bot_id: "bot-123" }, "user-123"),
      ).rejects.toThrow(ConflictException);
    });

    it("should throw NotFoundException when bot not found", async () => {
      mockTableRepository.findById.mockResolvedValue(mockTable);
      mockBotRepository.findById.mockResolvedValue(null);

      await expect(
        service.joinTable("table-123", { bot_id: "nonexistent" }, "user-123"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user does not own bot", async () => {
      mockTableRepository.findById.mockResolvedValue(mockTable);
      mockBotRepository.findById.mockResolvedValue({
        ...mockBot,
        user_id: "other-user",
      });

      await expect(
        service.joinTable("table-123", { bot_id: "bot-123" }, "user-123"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should throw ConflictException when bot is deactivated", async () => {
      mockTableRepository.findById.mockResolvedValue(mockTable);
      mockBotRepository.findById.mockResolvedValue({
        ...mockBot,
        active: false,
      });

      await expect(
        service.joinTable("table-123", { bot_id: "bot-123" }, "user-123"),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("getTableState", () => {
    it("should return state from live game manager", async () => {
      const gameState = { status: "running", players: [] };
      mockLiveGameManager.getGameState.mockReturnValue(gameState);

      const result = await service.getTableState("table-123");

      expect(result).toEqual(gameState);
    });

    it("should return table status when no game state", async () => {
      mockLiveGameManager.getGameState.mockReturnValue(null);
      mockTableRepository.findById.mockResolvedValue(mockTable);

      const result = await service.getTableState("table-123");

      expect(result.status).toBe("waiting");
      expect(result.players).toEqual([]);
    });

    it("should throw NotFoundException when table not found", async () => {
      mockLiveGameManager.getGameState.mockReturnValue(null);
      mockTableRepository.findById.mockResolvedValue(null);

      await expect(service.getTableState("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
