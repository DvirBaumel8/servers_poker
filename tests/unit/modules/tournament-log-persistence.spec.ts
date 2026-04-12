import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { TournamentsService } from "../../../src/modules/tournaments/tournaments.service";

// ── Minimal stubs ────────────────────────────────────────────────────────────

const mockTournamentRepo = {
  findById: vi.fn(),
  findByStatus: vi.fn(),
  updateStatus: vi.fn(),
  create: vi.fn(),
  saveLogData: vi.fn(),
};

const mockBotRepo = {
  findActiveByUserId: vi.fn(),
};

const mockAnalyticsRepo = {};
const mockRedisCache = {};
const mockEventEmitter = { emit: vi.fn() };

const SAMPLE_LOG = {
  tournament_summary: {
    id: "t1",
    timestamp: "2026-01-01T00:00:00Z",
    participants: [],
  },
  hands: [
    {
      hand_id: "h1",
      hand_number: 1,
      dealer_bot_id: "b1",
      board: [],
      initial_stacks: {},
      actions: [],
    },
  ],
};

let mockQueryResult: unknown[] = [];
const mockDataSource = {
  query: vi.fn().mockImplementation(() => Promise.resolve(mockQueryResult)),
};

function createService(): TournamentsService {
  return new TournamentsService(
    mockTournamentRepo as any,
    mockBotRepo as any,
    mockAnalyticsRepo as any,
    mockEventEmitter as any,
    mockRedisCache as any,
    mockDataSource as any,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("TournamentsService.getParticipatedTournaments", () => {
  let service: TournamentsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createService();
  });

  it("returns participation rows with tournament and bot info", async () => {
    mockQueryResult = [
      {
        tournament_id: "t1",
        tournament_name: "Championship",
        finished_at: new Date("2026-01-10"),
        status: "finished",
        bot_id: "b1",
        bot_name: "Alpha",
      },
      {
        tournament_id: "t1",
        tournament_name: "Championship",
        finished_at: new Date("2026-01-10"),
        status: "finished",
        bot_id: "b2",
        bot_name: "Beta",
      },
      {
        tournament_id: "t2",
        tournament_name: "Nightly",
        finished_at: new Date("2026-01-09"),
        status: "finished",
        bot_id: "b1",
        bot_name: "Alpha",
      },
    ];
    const result = await service.getParticipatedTournaments("user-1");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      tournamentId: "t1",
      tournamentName: "Championship",
      finishedAt: new Date("2026-01-10"),
      status: "finished",
      botId: "b1",
      botName: "Alpha",
    });
  });

  it("returns one row per (tournament, bot) pair — not deduplicated", async () => {
    mockQueryResult = [
      {
        tournament_id: "t1",
        tournament_name: "X",
        finished_at: new Date("2026-01-10"),
        status: "finished",
        bot_id: "b1",
        bot_name: "Bot1",
      },
      {
        tournament_id: "t1",
        tournament_name: "X",
        finished_at: new Date("2026-01-10"),
        status: "finished",
        bot_id: "b2",
        bot_name: "Bot2",
      },
    ];
    const result = await service.getParticipatedTournaments("user-1");
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.botId)).toEqual(["b1", "b2"]);
  });

  it("passes userId as query parameter", async () => {
    mockQueryResult = [];
    await service.getParticipatedTournaments("user-abc");
    expect(mockDataSource.query).toHaveBeenCalledWith(
      expect.stringContaining("log_data IS NOT NULL"),
      ["user-abc"],
    );
  });

  it("returns empty array when user has no qualifying tournaments", async () => {
    mockQueryResult = [];
    const result = await service.getParticipatedTournaments("user-nobody");
    expect(result).toEqual([]);
  });
});

describe("TournamentsService.getTournamentLog", () => {
  let service: TournamentsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createService();
  });

  it("returns log_data when user has an active bot in the tournament", async () => {
    mockQueryResult = [{ id: "t1" }];
    mockTournamentRepo.findById.mockResolvedValue({
      id: "t1",
      log_data: SAMPLE_LOG,
    });
    const result = await service.getTournamentLog("t1", "user-1");
    expect(result.log_data).toEqual(SAMPLE_LOG);
    expect(result).toHaveProperty("nameMap");
  });

  it("throws ForbiddenException when user has no active bot in the tournament", async () => {
    mockQueryResult = [];
    mockTournamentRepo.findById.mockResolvedValue({
      id: "t1",
      log_data: SAMPLE_LOG,
    });
    await expect(
      service.getTournamentLog("t1", "user-stranger"),
    ).rejects.toThrow(ForbiddenException);
  });

  it("throws NotFoundException when tournament does not exist", async () => {
    mockQueryResult = [];
    mockTournamentRepo.findById.mockResolvedValue(null);
    await expect(
      service.getTournamentLog("nonexistent", "user-1"),
    ).rejects.toThrow(NotFoundException);
  });

  it("returns empty log_data when log_data is null", async () => {
    mockQueryResult = [{ id: "t1" }];
    mockTournamentRepo.findById.mockResolvedValue({ id: "t1", log_data: null });
    const result = await service.getTournamentLog("t1", "user-1");
    expect(result.log_data).toEqual({});
  });
});
