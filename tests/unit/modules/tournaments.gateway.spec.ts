import { describe, it, expect, beforeEach, vi } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { TournamentsGateway } from "../../../src/modules/tournaments/tournaments.gateway";
import { TournamentsService } from "../../../src/modules/tournaments/tournaments.service";
import { TournamentRepository } from "../../../src/repositories/tournament.repository";
import { Server, Socket } from "socket.io";

describe("TournamentsGateway", () => {
  let gateway: TournamentsGateway;
  let mockServer: Partial<Server>;
  let mockJwtService: Partial<JwtService>;
  let mockConfigService: Partial<ConfigService>;
  let mockTournamentsService: Partial<TournamentsService>;
  let mockTournamentRepository: Partial<TournamentRepository>;

  beforeEach(async () => {
    // Mock Socket.IO server
    mockServer = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
      sockets: {
        adapter: {
          rooms: new Map(),
        },
      } as any,
    };

    mockJwtService = {
      verify: vi.fn(),
    };

    mockConfigService = {
      get: vi.fn(),
    };

    mockTournamentsService = {
      findById: vi.fn(),
    };

    mockTournamentRepository = {
      getEntries: vi.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentsGateway,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: TournamentsService, useValue: mockTournamentsService },
        { provide: TournamentRepository, useValue: mockTournamentRepository },
      ],
    }).compile();

    gateway = module.get<TournamentsGateway>(TournamentsGateway);
    // Manually inject the mock server
    gateway.server = mockServer as Server;
  });

  describe("Event Handlers - Server Initialization Check", () => {
    it("should handle stateUpdated event when server is initialized", () => {
      const event = {
        tournamentId: "tournament-1",
        status: "running",
        registeredCount: 5,
      };

      gateway.handleStateUpdated(event);

      expect(mockServer.to).toHaveBeenCalledWith("tournament:tournament-1");
      expect(mockServer.emit).toHaveBeenCalled();
    });

    it("should gracefully handle stateUpdated when server is not initialized", () => {
      const loggerSpy = vi.spyOn(gateway["logger"], "warn");
      gateway.server = undefined as any;

      const event = {
        tournamentId: "tournament-1",
        status: "running",
        registeredCount: 5,
      };

      // Should not throw
      expect(() => gateway.handleStateUpdated(event)).not.toThrow();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("Server not initialized"),
      );
    });

    it("should handle botRegistered event when server is initialized", () => {
      const event = {
        tournamentId: "tournament-1",
        botId: "bot-1",
        botName: "TestBot",
        userId: "user-1",
      };

      gateway.handleBotRegistered(event);

      expect(mockServer.to).toHaveBeenCalledWith("tournament:tournament-1");
      expect(mockServer.emit).toHaveBeenCalled();
    });

    it("should gracefully handle botRegistered when server is not initialized", () => {
      const loggerSpy = vi.spyOn(gateway["logger"], "warn");
      gateway.server = undefined as any;

      const event = {
        tournamentId: "tournament-1",
        botId: "bot-1",
        botName: "TestBot",
        userId: "user-1",
      };

      // Should not throw
      expect(() => gateway.handleBotRegistered(event)).not.toThrow();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("Server not initialized"),
      );
    });

    it("should handle playerBusted event when server is initialized", () => {
      const event = {
        tournamentId: "tournament-1",
        botId: "bot-1",
        botName: "TestBot",
        position: 5,
      };

      gateway.handlePlayerBusted(event);

      expect(mockServer.to).toHaveBeenCalledWith("tournament:tournament-1");
      expect(mockServer.emit).toHaveBeenCalled();
    });

    it("should gracefully handle playerBusted when server is not initialized", () => {
      const loggerSpy = vi.spyOn(gateway["logger"], "warn");
      gateway.server = undefined as any;

      const event = {
        tournamentId: "tournament-1",
        botId: "bot-1",
        botName: "TestBot",
        position: 5,
      };

      // Should not throw
      expect(() => gateway.handlePlayerBusted(event)).not.toThrow();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("Server not initialized"),
      );
    });

    it("should handle finished event when server is initialized", () => {
      const event = {
        tournamentId: "tournament-1",
        winnerId: "bot-1",
        winnerName: "TestBot",
      };

      gateway.handleTournamentFinished(event);

      expect(mockServer.to).toHaveBeenCalledWith("tournament:tournament-1");
      expect(mockServer.emit).toHaveBeenCalled();
    });

    it("should gracefully handle finished when server is not initialized", () => {
      const loggerSpy = vi.spyOn(gateway["logger"], "warn");
      gateway.server = undefined as any;

      const event = {
        tournamentId: "tournament-1",
        winnerId: "bot-1",
        winnerName: "TestBot",
      };

      // Should not throw
      expect(() => gateway.handleTournamentFinished(event)).not.toThrow();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("Server not initialized"),
      );
    });
  });

  describe("Optional Chaining for rooms", () => {
    it("should handle missing sockets.adapter gracefully", () => {
      // Create server with no sockets property
      gateway.server = {
        to: vi.fn().mockReturnThis(),
        emit: vi.fn(),
        sockets: {} as any, // Missing adapter
      } as any;

      const event = {
        tournamentId: "tournament-1",
        status: "running",
        registeredCount: 5,
      };

      // Should not throw even if sockets.adapter is missing
      expect(() => gateway.handleStateUpdated(event)).not.toThrow();
      expect((gateway.server.to as any).mock.calls.length).toBeGreaterThan(0);
    });

    it("should handle completely missing sockets gracefully", () => {
      // Create server with no sockets property
      gateway.server = {
        to: vi.fn().mockReturnThis(),
        emit: vi.fn(),
      } as any;

      const event = {
        tournamentId: "tournament-1",
        status: "running",
        registeredCount: 5,
      };

      // Should not throw even if sockets is missing
      expect(() => gateway.handleStateUpdated(event)).not.toThrow();
      expect((gateway.server.to as any).mock.calls.length).toBeGreaterThan(0);
    });
  });
});
