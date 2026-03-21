import { beforeEach, describe, expect, it, vi } from "vitest";
import { tournamentsApi } from "./tournaments";
import { api } from "./client";

vi.mock("./client", () => ({
  api: {
    get: vi.fn(),
  },
}));

describe("tournamentsApi", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it("maps leaderboard entries from API shape", async () => {
    vi.mocked(api.get).mockResolvedValue([
      {
        position: 1,
        bot_id: "bot-1",
        bot_name: "Bot One",
        chips: 15000,
        busted: false,
      },
    ]);

    await expect(tournamentsApi.getLeaderboard("tourney-1")).resolves.toEqual([
      {
        position: 1,
        botId: "bot-1",
        botName: "Bot One",
        chips: 15000,
        busted: false,
      },
    ]);
  });

  it("maps tournament results from API shape", async () => {
    vi.mocked(api.get).mockResolvedValue([
      {
        bot_id: "bot-2",
        bot_name: "Bot Two",
        finish_position: 2,
        payout: 350,
      },
    ]);

    await expect(tournamentsApi.getResults("tourney-1")).resolves.toEqual([
      {
        botId: "bot-2",
        botName: "Bot Two",
        finishPosition: 2,
        payout: 350,
      },
    ]);
  });
});
