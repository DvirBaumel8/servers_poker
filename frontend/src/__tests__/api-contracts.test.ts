import { describe, it, expect } from "vitest";

const API_BASE = "http://localhost:3000/api/v1";

describe("API Contract Tests", () => {
  describe("GET /games", () => {
    it("returns tables with expected structure", async () => {
      const response = await fetch(`${API_BASE}/games`);
      expect(response.ok).toBe(true);

      const tables = await response.json();
      expect(Array.isArray(tables)).toBe(true);

      if (tables.length > 0) {
        const table = tables[0];
        expect(table).toHaveProperty("id");
        expect(table).toHaveProperty("name");
        expect(table).toHaveProperty("status");
        expect(table).toHaveProperty("config");
        expect(table.config).toHaveProperty("small_blind");
        expect(table.config).toHaveProperty("big_blind");
        expect(table.config).toHaveProperty("max_players");
        expect(table).toHaveProperty("players");
        expect(Array.isArray(table.players)).toBe(true);
      }
    });
  });

  describe("GET /games/leaderboard", () => {
    it("returns leaderboard entries with expected structure", async () => {
      const response = await fetch(`${API_BASE}/games/leaderboard?limit=10&period=all`);
      expect(response.ok).toBe(true);

      const entries = await response.json();
      expect(Array.isArray(entries)).toBe(true);

      if (entries.length > 0) {
        const entry = entries[0];
        expect(entry).toHaveProperty("name");
        expect(entry).toHaveProperty("bot_id");
        expect(entry).toHaveProperty("games_played");
        expect(entry).toHaveProperty("total_hands");
        expect(entry).toHaveProperty("total_wins");
        expect(entry).toHaveProperty("total_winnings");
        expect(entry).toHaveProperty("win_rate_pct");
      }
    });
  });

  describe("GET /tournaments", () => {
    it("returns tournaments with expected structure", async () => {
      const response = await fetch(`${API_BASE}/tournaments`);
      expect(response.ok).toBe(true);

      const tournaments = await response.json();
      expect(Array.isArray(tournaments)).toBe(true);

      if (tournaments.length > 0) {
        const tournament = tournaments[0];
        expect(tournament).toHaveProperty("id");
        expect(tournament).toHaveProperty("name");
        expect(tournament).toHaveProperty("status");
        expect(tournament).toHaveProperty("buy_in");
        expect(tournament).toHaveProperty("starting_chips");
        expect(tournament).toHaveProperty("min_players");
        expect(tournament).toHaveProperty("max_players");
      }
    });
  });

  describe("GET /bots", () => {
    it("returns bots with expected structure", async () => {
      const response = await fetch(`${API_BASE}/bots`);
      expect(response.ok).toBe(true);

      const bots = await response.json();
      expect(Array.isArray(bots)).toBe(true);

      if (bots.length > 0) {
        const bot = bots[0];
        expect(bot).toHaveProperty("id");
        expect(bot).toHaveProperty("name");
        expect(bot).toHaveProperty("endpoint");
        expect(bot).toHaveProperty("active");
        expect(bot).toHaveProperty("created_at");
      }
    });
  });

  describe("GET /games/:id/state", () => {
    it("returns game state with expected structure", async () => {
      const tablesResponse = await fetch(`${API_BASE}/games`);
      const tables = await tablesResponse.json();
      
      const runningTable = tables.find((t: { status: string }) => t.status === "running" || t.status === "finished");
      if (!runningTable) {
        console.log("No running/finished tables to test game state");
        return;
      }

      const response = await fetch(`${API_BASE}/games/${runningTable.id}/state`);
      expect(response.ok).toBe(true);

      const state = await response.json();
      expect(state).toHaveProperty("tableId");
      expect(state).toHaveProperty("status");
      expect(state).toHaveProperty("handNumber");
      expect(state).toHaveProperty("stage");
      expect(state).toHaveProperty("pot");
      expect(state).toHaveProperty("communityCards");
      expect(state).toHaveProperty("players");
      expect(state).toHaveProperty("smallBlind");
      expect(state).toHaveProperty("bigBlind");
      
      expect(Array.isArray(state.players)).toBe(true);
      if (state.players.length > 0) {
        const player = state.players[0];
        expect(player).toHaveProperty("id");
        expect(player).toHaveProperty("name");
        expect(player).toHaveProperty("chips");
        expect(player).toHaveProperty("folded");
        expect(player).toHaveProperty("allIn");
      }
    });
  });

  describe("POST /auth/login", () => {
    it("returns auth response with expected structure on valid credentials", async () => {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "alice@example.com", password: "testpass123" }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      
      expect(data).toHaveProperty("accessToken");
      expect(data).toHaveProperty("user");
      expect(data.user).toHaveProperty("id");
      expect(data.user).toHaveProperty("email");
      expect(data.user).toHaveProperty("name");
    });

    it("returns error on invalid credentials", async () => {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "invalid@test.com", password: "wrong" }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });
});
