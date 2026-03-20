import { describe, it, expect } from "vitest";
import {
  isWorkerCommand,
  isWorkerEvent,
  WorkerCommand,
  WorkerEvent,
  GameConfig,
  PlayerConfig,
  WorkerInitData,
} from "../../../src/workers/messages";

describe("Worker Messages", () => {
  describe.concurrent("isWorkerCommand", () => {
    it("should return true for ADD_PLAYER command", () => {
      const command: WorkerCommand = {
        type: "ADD_PLAYER",
        player: { id: "bot-1", name: "TestBot", endpoint: "http://localhost:8080" },
      };
      expect(isWorkerCommand(command)).toBe(true);
    });

    it("should return true for REMOVE_PLAYER command", () => {
      const command: WorkerCommand = { type: "REMOVE_PLAYER", playerId: "bot-1" };
      expect(isWorkerCommand(command)).toBe(true);
    });

    it("should return true for STOP command", () => {
      const command: WorkerCommand = { type: "STOP" };
      expect(isWorkerCommand(command)).toBe(true);
    });

    it("should return true for GET_STATE command", () => {
      const command: WorkerCommand = { type: "GET_STATE" };
      expect(isWorkerCommand(command)).toBe(true);
    });

    it("should return true for UPDATE_BLINDS command", () => {
      const command: WorkerCommand = {
        type: "UPDATE_BLINDS",
        smallBlind: 25,
        bigBlind: 50,
        ante: 5,
      };
      expect(isWorkerCommand(command)).toBe(true);
    });

    it("should return false for invalid object", () => {
      expect(isWorkerCommand({ type: "INVALID" })).toBe(false);
      expect(isWorkerCommand({ foo: "bar" })).toBe(false);
      expect(isWorkerCommand(null)).toBe(false);
      expect(isWorkerCommand(undefined)).toBe(false);
      expect(isWorkerCommand("string")).toBe(false);
      expect(isWorkerCommand(123)).toBe(false);
    });
  });

  describe.concurrent("isWorkerEvent", () => {
    it("should return true for READY event", () => {
      const event: WorkerEvent = { type: "READY", tableId: "table-1" };
      expect(isWorkerEvent(event)).toBe(true);
    });

    it("should return true for STATE_UPDATE event", () => {
      const event: WorkerEvent = {
        type: "STATE_UPDATE",
        tableId: "table-1",
        state: {
          tableId: "table-1",
          gameId: "game-1",
          status: "running",
          handNumber: 1,
          stage: "flop",
          pot: 100,
          currentBet: 20,
          communityCards: ["Ah", "Kd", "Qc"],
          activePlayerId: "bot-1",
          smallBlind: 10,
          bigBlind: 20,
          ante: 0,
          players: [],
          log: [],
        },
      };
      expect(isWorkerEvent(event)).toBe(true);
    });

    it("should return true for PLAYER_JOINED event", () => {
      const event: WorkerEvent = {
        type: "PLAYER_JOINED",
        tableId: "table-1",
        playerId: "bot-1",
        playerName: "TestBot",
      };
      expect(isWorkerEvent(event)).toBe(true);
    });

    it("should return true for PLAYER_LEFT event", () => {
      const event: WorkerEvent = {
        type: "PLAYER_LEFT",
        tableId: "table-1",
        playerId: "bot-1",
      };
      expect(isWorkerEvent(event)).toBe(true);
    });

    it("should return true for HAND_STARTED event", () => {
      const event: WorkerEvent = {
        type: "HAND_STARTED",
        tableId: "table-1",
        handNumber: 1,
        dealerName: "TestBot",
      };
      expect(isWorkerEvent(event)).toBe(true);
    });

    it("should return true for HAND_COMPLETE event", () => {
      const event: WorkerEvent = {
        type: "HAND_COMPLETE",
        tableId: "table-1",
        handNumber: 1,
        winners: [{ playerId: "bot-1", playerName: "TestBot", amount: 100 }],
        atShowdown: true,
      };
      expect(isWorkerEvent(event)).toBe(true);
    });

    it("should return true for GAME_FINISHED event", () => {
      const event: WorkerEvent = {
        type: "GAME_FINISHED",
        tableId: "table-1",
        winnerId: "bot-1",
        winnerName: "TestBot",
      };
      expect(isWorkerEvent(event)).toBe(true);
    });

    it("should return true for ERROR event", () => {
      const event: WorkerEvent = {
        type: "ERROR",
        tableId: "table-1",
        error: "Something went wrong",
        fatal: false,
      };
      expect(isWorkerEvent(event)).toBe(true);
    });

    it("should return true for LOG event", () => {
      const event: WorkerEvent = {
        type: "LOG",
        tableId: "table-1",
        level: "info",
        message: "Test message",
      };
      expect(isWorkerEvent(event)).toBe(true);
    });

    it("should return false for invalid object", () => {
      expect(isWorkerEvent({ type: "INVALID" })).toBe(false);
      expect(isWorkerEvent({ foo: "bar" })).toBe(false);
      expect(isWorkerEvent(null)).toBe(false);
      expect(isWorkerEvent(undefined)).toBe(false);
      expect(isWorkerEvent("string")).toBe(false);
      expect(isWorkerEvent(123)).toBe(false);
    });
  });

  describe.concurrent("Type definitions", () => {
    it("should allow creating valid GameConfig", () => {
      const config: GameConfig = {
        tableId: "table-1",
        gameDbId: "game-1",
        smallBlind: 10,
        bigBlind: 20,
        ante: 0,
        startingChips: 1000,
        turnTimeoutMs: 10000,
      };
      expect(config.tableId).toBe("table-1");
      expect(config.tournamentId).toBeUndefined();
    });

    it("should allow creating valid PlayerConfig", () => {
      const player: PlayerConfig = {
        id: "bot-1",
        name: "TestBot",
        endpoint: "http://localhost:8080",
        chips: 1000,
      };
      expect(player.id).toBe("bot-1");
      expect(player.chips).toBe(1000);
    });

    it("should allow creating valid WorkerInitData", () => {
      const initData: WorkerInitData = {
        gameConfig: {
          tableId: "table-1",
          gameDbId: "game-1",
          smallBlind: 10,
          bigBlind: 20,
          ante: 0,
          startingChips: 1000,
          turnTimeoutMs: 10000,
        },
        players: [
          { id: "bot-1", name: "Bot1", endpoint: "http://localhost:8080" },
          { id: "bot-2", name: "Bot2", endpoint: "http://localhost:8081" },
        ],
      };
      expect(initData.gameConfig.tableId).toBe("table-1");
      expect(initData.players?.length).toBe(2);
    });
  });
});
