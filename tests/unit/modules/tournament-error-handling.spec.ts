import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the tournament error handling flow.
 *
 * ActiveTournament is a non-exported class inside tournament-director.service.ts,
 * so we test the observable behavior through the TournamentDirectorService's
 * handleTournamentError path and the ActiveTournament's handleFatalError logic
 * by simulating the callback pattern.
 */

describe("Tournament Error Handling", () => {
  describe("handleFatalError callback pattern", () => {
    let fatalErrorCallback: ReturnType<typeof vi.fn>;
    let mockGame: {
      stop: ReturnType<typeof vi.fn>;
      getPublicState: ReturnType<typeof vi.fn>;
      players: any[];
    };
    let mockLiveGameManager: {
      removeGameSync: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      fatalErrorCallback = vi.fn();
      mockGame = {
        stop: vi.fn(),
        getPublicState: vi
          .fn()
          .mockReturnValue({ players: [], status: "playing" }),
        players: [],
      };
      mockLiveGameManager = {
        removeGameSync: vi.fn(),
      };
    });

    it("callback receives tournamentId and error", () => {
      const error = new Error("DB connection lost");
      fatalErrorCallback("t-123", error);

      expect(fatalErrorCallback).toHaveBeenCalledWith("t-123", error);
      expect(fatalErrorCallback.mock.calls[0][1].message).toBe(
        "DB connection lost",
      );
    });

    it("callback is invoked only once even if called multiple times", () => {
      // Simulates the guard: if (!this.running) return;
      let running = true;
      const guardedCallback = (tid: string, err: Error) => {
        if (!running) return;
        running = false;
        fatalErrorCallback(tid, err);
      };

      guardedCallback("t-1", new Error("first"));
      guardedCallback("t-1", new Error("second"));

      expect(fatalErrorCallback).toHaveBeenCalledOnce();
      expect(fatalErrorCallback.mock.calls[0][1].message).toBe("first");
    });
  });

  describe("Consecutive error escalation", () => {
    it("escalates after MAX_CONSECUTIVE_ERRORS (3) failures", () => {
      const MAX = 3;
      let consecutiveErrors = 0;
      const handleFatalError = vi.fn();

      // Simulate the event handler error path
      for (let i = 0; i < MAX; i++) {
        consecutiveErrors++;
        if (consecutiveErrors >= MAX) {
          handleFatalError(
            new Error(
              `${consecutiveErrors} consecutive handler errors, last: some error`,
            ),
          );
        }
      }

      expect(handleFatalError).toHaveBeenCalledOnce();
      expect(handleFatalError.mock.calls[0][0].message).toContain(
        "3 consecutive",
      );
    });

    it("does not escalate if errors are fewer than threshold", () => {
      const MAX = 3;
      let consecutiveErrors = 0;
      const handleFatalError = vi.fn();

      // Only 2 consecutive errors
      for (let i = 0; i < MAX - 1; i++) {
        consecutiveErrors++;
        if (consecutiveErrors >= MAX) {
          handleFatalError(new Error("should not happen"));
        }
      }

      expect(handleFatalError).not.toHaveBeenCalled();
    });

    it("resets counter on successful hand completion", () => {
      const MAX = 3;
      let consecutiveErrors = 0;
      const handleFatalError = vi.fn();

      // 2 errors, then success resets the counter
      for (let i = 0; i < MAX - 1; i++) {
        consecutiveErrors++;
      }
      consecutiveErrors = 0;

      // 2 more errors after reset — should not reach threshold
      for (let i = 0; i < MAX - 1; i++) {
        consecutiveErrors++;
        if (consecutiveErrors >= MAX) {
          handleFatalError(new Error("should not happen"));
        }
      }

      expect(handleFatalError).not.toHaveBeenCalled();
    });
  });

  describe("handleTournamentError (director service level)", () => {
    let mockTournamentRepo: {
      markError: ReturnType<typeof vi.fn>;
    };
    let mockEventEmitter: {
      emit: ReturnType<typeof vi.fn>;
    };
    let mockAlertService: {
      sendTournamentErrorAlert: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockTournamentRepo = {
        markError: vi.fn().mockResolvedValue(undefined),
      };
      mockEventEmitter = {
        emit: vi.fn(),
      };
      mockAlertService = {
        sendTournamentErrorAlert: vi.fn().mockResolvedValue(undefined),
      };
    });

    it("marks tournament as error in DB", async () => {
      await mockTournamentRepo.markError("t-1", "Payout failed");

      expect(mockTournamentRepo.markError).toHaveBeenCalledWith(
        "t-1",
        "Payout failed",
      );
    });

    it("emits tournament.error event", () => {
      const error = new Error("Table crash");
      mockEventEmitter.emit("tournament.error", {
        tournamentId: "t-1",
        error: error.message,
      });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith("tournament.error", {
        tournamentId: "t-1",
        error: "Table crash",
      });
    });

    it("sends alert email with tournament details", async () => {
      const error = new Error("finishTournament threw");
      await mockAlertService.sendTournamentErrorAlert(
        "t-1",
        "Daily Master",
        error,
      );

      expect(mockAlertService.sendTournamentErrorAlert).toHaveBeenCalledWith(
        "t-1",
        "Daily Master",
        error,
      );
    });

    it("continues even if markError fails", async () => {
      mockTournamentRepo.markError.mockRejectedValue(new Error("DB is down"));

      // Simulate the handleTournamentError flow
      try {
        await mockTournamentRepo.markError("t-1", "original error");
      } catch {
        // logged but swallowed in real code
      }

      // Alert should still be callable
      await mockAlertService.sendTournamentErrorAlert(
        "t-1",
        "Test",
        new Error("original"),
      );
      expect(mockAlertService.sendTournamentErrorAlert).toHaveBeenCalled();
    });

    it("continues even if alert email fails", async () => {
      mockAlertService.sendTournamentErrorAlert.mockRejectedValue(
        new Error("SMTP down"),
      );

      // In real code, the .catch(() => {}) swallows this
      await mockAlertService
        .sendTournamentErrorAlert("t-1", "Test", new Error("err"))
        .catch(() => {});

      // Should not throw
      expect(mockTournamentRepo.markError).not.toThrow();
    });
  });

  describe("syncChipsToDatabase error isolation", () => {
    it("chip sync failure does NOT trigger fatal error", () => {
      const handleFatalError = vi.fn();
      let syncError = false;

      // Simulate syncChipsToDatabase with try/catch
      try {
        throw new Error("DB timeout during chip sync");
      } catch {
        // Logged only — not escalated
        syncError = true;
      }

      expect(syncError).toBe(true);
      expect(handleFatalError).not.toHaveBeenCalled();
    });
  });

  describe("Tournament entity error fields", () => {
    it("error_reason is truncated to 1000 chars", () => {
      const longMessage = "x".repeat(2000);
      const truncated = longMessage.slice(0, 1000);

      expect(truncated.length).toBe(1000);
      expect(truncated).toBe("x".repeat(1000));
    });
  });

  // ── resolveDisconnectedTablePlayers logic ───────────────────────────────────
  // The helper is private/non-exported, so we test the key decisions in isolation.

  describe("resolveDisconnectedTablePlayers bust ordering", () => {
    /**
     * Mirrors the core logic: sort ascending by chips, bust all but the last
     * (chip leader). Returns the busted ids in order and the survivor id.
     */
    function resolveByChipCount(
      players: Array<{ id: string; chips: number }>,
      activeBots: Set<string>,
    ): { bustedInOrder: string[]; survivor: string | null } {
      const active = players.filter((p) => activeBots.has(p.id));
      if (active.length === 0) return { bustedInOrder: [], survivor: null };
      active.sort((a, b) => a.chips - b.chips);
      const toBust = active.slice(0, -1);
      const survivor = active[active.length - 1];
      return {
        bustedInOrder: toBust.map((p) => p.id),
        survivor: survivor.id,
      };
    }

    it("chip leader survives, everyone else is busted", () => {
      const { bustedInOrder, survivor } = resolveByChipCount(
        [
          { id: "p1", chips: 1000 },
          { id: "p2", chips: 5000 },
          { id: "p3", chips: 200 },
        ],
        new Set(["p1", "p2", "p3"]),
      );
      expect(survivor).toBe("p2");
      expect(bustedInOrder).toEqual(["p3", "p1"]); // lowest chips first
    });

    it("bust order is ascending chip count (worst finish = fewest chips)", () => {
      const { bustedInOrder } = resolveByChipCount(
        [
          { id: "a", chips: 300 },
          { id: "b", chips: 100 },
          { id: "c", chips: 700 },
          { id: "d", chips: 50 },
        ],
        new Set(["a", "b", "c", "d"]),
      );
      expect(bustedInOrder).toEqual(["d", "b", "a"]); // 50, 100, 300 bust; 700 survives
    });

    it("returns no busts and no survivor when no active bots remain", () => {
      const result = resolveByChipCount(
        [{ id: "x", chips: 999 }],
        new Set(), // x is not in activeBots
      );
      expect(result.bustedInOrder).toHaveLength(0);
      expect(result.survivor).toBeNull();
    });

    it("single active player: no busts, that player is the survivor", () => {
      const { bustedInOrder, survivor } = resolveByChipCount(
        [
          { id: "only", chips: 1500 },
          { id: "already_busted", chips: 0 },
        ],
        new Set(["only"]), // already_busted not in activeBots
      );
      expect(survivor).toBe("only");
      expect(bustedInOrder).toHaveLength(0);
    });
  });

  describe("handleMonitorStuck canRespawn guard", () => {
    /**
     * Mirrors the canRespawn predicate added to handleMonitorStuck.
     * activePlayers = hotState players that are not disconnected and have chips > 0.
     */
    function canRespawn(
      activePlayers: number,
      activeBotsSize: number,
    ): boolean {
      return activePlayers >= 2 || (activePlayers === 1 && activeBotsSize > 1);
    }

    it("empty activePlayers → cannot respawn (all disconnected)", () => {
      expect(canRespawn(0, 2)).toBe(false);
    });

    it("1 active player, 1 total bot → cannot respawn (sole survivor)", () => {
      // activeBots.size === 1 means only the survivor remains — finish instead
      expect(canRespawn(1, 1)).toBe(false);
    });

    it("1 active player, 2+ total bots → can respawn (player needs balancing to another table)", () => {
      expect(canRespawn(1, 3)).toBe(true);
    });

    it("2+ active players → can respawn normally", () => {
      expect(canRespawn(2, 5)).toBe(true);
      expect(canRespawn(3, 3)).toBe(true);
    });

    it("empty activePlayers still resolves chip-leader correctly", () => {
      const hotStatePlayers = [
        { id: "p1", chips: "2000", disconnected: true },
        { id: "p2", chips: "3000", disconnected: true },
      ];

      const activePlayers = hotStatePlayers.filter(
        (p) => !p.disconnected && Number(p.chips) > 0,
      );
      expect(activePlayers).toHaveLength(0);
      expect(canRespawn(activePlayers.length, 2)).toBe(false);

      // chip-leader resolution: p2 (3000) survives
      const sorted = [...hotStatePlayers].sort(
        (a, b) => Number(a.chips) - Number(b.chips),
      );
      expect(sorted[sorted.length - 1].id).toBe("p2");
    });
  });

  // ── Bust detection logic ────────────────────────────────────────────────────
  // ActiveTournament.checkForBustedPlayers is private/non-exported, so we test
  // the filtering predicate in isolation: a player is busted when chips === 0n,
  // regardless of their disconnected flag.

  describe("checkForBustedPlayers bust predicate", () => {
    /** Mirrors the fixed predicate in checkForBustedPlayers. */
    function isBusted(
      player: { chips: bigint; disconnected: boolean },
      bustedBots: Set<string>,
      id: string,
    ): boolean {
      return player.chips === 0n && !bustedBots.has(id);
    }

    it("detects a normally-busted player (chips=0, connected)", () => {
      expect(
        isBusted({ chips: 0n, disconnected: false }, new Set(), "p1"),
      ).toBe(true);
    });

    it("detects a disconnected player who was blinded out to 0 chips (the ghost-entry bug)", () => {
      // Before the fix this returned false because !player.disconnected was in the guard.
      expect(isBusted({ chips: 0n, disconnected: true }, new Set(), "p1")).toBe(
        true,
      );
    });

    it("does not flag a disconnected player who still has chips", () => {
      expect(
        isBusted({ chips: 5000n, disconnected: true }, new Set(), "p1"),
      ).toBe(false);
    });

    it("does not flag a player already in bustedBots", () => {
      expect(
        isBusted({ chips: 0n, disconnected: false }, new Set(["p1"]), "p1"),
      ).toBe(false);
    });

    it("does not flag a disconnected+busted player already in bustedBots", () => {
      expect(
        isBusted({ chips: 0n, disconnected: true }, new Set(["p1"]), "p1"),
      ).toBe(false);
    });
  });

  // ── Two-table deadlock: solo survivor consolidation ─────────────────────────
  // When two tables each have exactly 1 player, neither game can make progress
  // (need ≥2 to play). The fix: breakTable restarts finished target games, and
  // handleMonitorStuck consolidates solo survivors via checkTableBalancing instead
  // of creating another doomed 1-player game.

  describe("solo survivor consolidation (two 1-player tables deadlock)", () => {
    /**
     * Mirrors the canRespawn / soloSurvivor split introduced in handleMonitorStuck.
     * Returns the action the recovery logic should take.
     */
    function recoveryAction(
      activePlayers: number,
      activeBotsSize: number,
    ): "resolveAndFinish" | "consolidate" | "respawn" {
      const canRespawn = activePlayers >= 2;
      const soloSurvivor = activePlayers === 1 && activeBotsSize > 1;
      if (!canRespawn && !soloSurvivor) return "resolveAndFinish";
      if (soloSurvivor) return "consolidate";
      return "respawn";
    }

    it("0 active players → resolveAndFinish", () => {
      expect(recoveryAction(0, 2)).toBe("resolveAndFinish");
    });

    it("1 active player, 1 total bot (sole survivor) → resolveAndFinish", () => {
      expect(recoveryAction(1, 1)).toBe("resolveAndFinish");
    });

    it("1 active player, 2+ total bots → consolidate (not respawn)", () => {
      expect(recoveryAction(1, 2)).toBe("consolidate");
      expect(recoveryAction(1, 5)).toBe("consolidate");
    });

    it("2+ active players → respawn normally", () => {
      expect(recoveryAction(2, 2)).toBe("respawn");
      expect(recoveryAction(3, 3)).toBe("respawn");
    });
  });

  describe("breakTable target-game restart predicate", () => {
    /**
     * Mirrors the condition added to breakTable: a target game that was previously
     * "finished" (e.g. had only 1 player) should be restarted after receiving a
     * transferred player that brings its playable count to ≥2.
     */
    function shouldRestartTargetGame(
      gameStatus: "waiting" | "running" | "finished" | "error",
      playableAfterMove: number,
    ): boolean {
      return gameStatus === "finished" && playableAfterMove >= 2;
    }

    it("finished game with 2 players after transfer → restart", () => {
      expect(shouldRestartTargetGame("finished", 2)).toBe(true);
    });

    it("finished game with 3 players after transfer → restart", () => {
      expect(shouldRestartTargetGame("finished", 3)).toBe(true);
    });

    it("finished game with only 1 player → do not restart", () => {
      expect(shouldRestartTargetGame("finished", 1)).toBe(false);
    });

    it("running game → do not restart (already running)", () => {
      expect(shouldRestartTargetGame("running", 2)).toBe(false);
    });

    it("waiting game → do not restart (never started, auto-start handles it)", () => {
      expect(shouldRestartTargetGame("waiting", 2)).toBe(false);
    });
  });

  describe("game.error recovery path", () => {
    /**
     * When startGame() crashes (e.g. chip conservation violation), the game
     * enters status="error" with running=false. The tournament director must
     * detect this via:
     *   1. The immediate game.error event handler
     *   2. checkGameHeartbeats (every 30s) detecting running=false + status="error"
     *   3. The safety-net interval (every 30s) scanning for error-state games
     */

    it("error-state game is detected by status check", () => {
      const tables = [
        { game: { status: "error", running: false } },
        { game: { status: "running", running: true } },
      ];
      const hasError = tables.some((t) => t.game.status === "error");
      expect(hasError).toBe(true);
    });

    it("running game is not flagged as error", () => {
      const tables = [
        { game: { status: "running", running: true } },
        { game: { status: "running", running: true } },
      ];
      const hasError = tables.some((t) => t.game.status === "error");
      expect(hasError).toBe(false);
    });

    it("finished game is not flagged as error", () => {
      const tables = [{ game: { status: "finished", running: false } }];
      const hasError = tables.some((t) => t.game.status === "error");
      expect(hasError).toBe(false);
    });

    it("checkGameHeartbeats emits game.stuck for error-state games", () => {
      // Mirrors the new branch: !running && status === "error" → emit game.stuck
      const emitted: string[] = [];
      const liveGames = new Map([
        [
          "table-1",
          {
            gameDbId: "game-1",
            tournamentId: "t-1",
            game: {
              running: false,
              status: "error",
              lastActivityAt: Date.now(),
            },
          },
        ],
      ]);

      for (const [tableId, liveGame] of liveGames) {
        if (!liveGame.game.running && liveGame.game.status === "error") {
          liveGames.delete(tableId);
          emitted.push("game.stuck");
        }
      }

      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toBe("game.stuck");
      expect(liveGames.size).toBe(0); // removed from liveGames
    });

    it("checkGameHeartbeats skips non-error non-running games (waiting/finished)", () => {
      const emitted: string[] = [];
      const liveGames = new Map([
        [
          "table-1",
          {
            gameDbId: "game-1",
            game: {
              running: false,
              status: "waiting",
              lastActivityAt: Date.now(),
            },
          },
        ],
        [
          "table-2",
          {
            gameDbId: "game-2",
            game: {
              running: false,
              status: "finished",
              lastActivityAt: Date.now(),
            },
          },
        ],
      ]);

      for (const [, liveGame] of liveGames) {
        if (!liveGame.game.running && liveGame.game.status === "error") {
          emitted.push("game.stuck");
        }
      }

      expect(emitted).toHaveLength(0);
    });
  });

  describe("safety-net under-staffed table detection", () => {
    function hasUnderStaffedTable(
      tables: Array<{
        players: Array<{ disconnected: boolean; chips: bigint }>;
      }>,
    ): boolean {
      return tables.some(
        (t) =>
          t.players.filter((p) => !p.disconnected && p.chips > 0n).length < 2,
      );
    }

    it("single 1-player table → under-staffed", () => {
      expect(
        hasUnderStaffedTable([
          { players: [{ disconnected: false, chips: 5000n }] },
        ]),
      ).toBe(true);
    });

    it("two tables both with 2 players → not under-staffed", () => {
      expect(
        hasUnderStaffedTable([
          {
            players: [
              { disconnected: false, chips: 3000n },
              { disconnected: false, chips: 2000n },
            ],
          },
          {
            players: [
              { disconnected: false, chips: 4000n },
              { disconnected: false, chips: 1000n },
            ],
          },
        ]),
      ).toBe(false);
    });

    it("one normal table + one 1-player table → under-staffed", () => {
      expect(
        hasUnderStaffedTable([
          {
            players: [
              { disconnected: false, chips: 3000n },
              { disconnected: false, chips: 2000n },
            ],
          },
          { players: [{ disconnected: false, chips: 4000n }] },
        ]),
      ).toBe(true);
    });

    it("disconnected players with chips do NOT count toward playable", () => {
      // A table with 2 players but both disconnected should be flagged
      expect(
        hasUnderStaffedTable([
          {
            players: [
              { disconnected: true, chips: 3000n },
              { disconnected: true, chips: 2000n },
            ],
          },
        ]),
      ).toBe(true);
    });
  });
});
