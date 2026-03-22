import { BaseMonster } from "../shared/base-monster";
import { RunConfig } from "../shared/types";
import { runMonsterCli } from "../shared/cli-runner";
import { findFiles } from "../shared/fs-utils";
import * as fs from "fs";
import * as path from "path";

/**
 * Data Analytics Monster
 *
 * Verifies the data recording pipeline described in docs/DATA.md:
 * "The data is the product."
 *
 * Checks that every game event is properly recorded into the analytics tables:
 * bot_stats, chip_movements, hands, hand_players, actions, bot_events.
 *
 * This is a STATIC analysis monster — it reads source code and verifies
 * the recording logic is correct without requiring a running server.
 */
class DataAnalyticsMonster extends BaseMonster {
  private workspaceRoot = process.cwd();

  constructor() {
    super({
      name: "Data Analytics Monster",
      type: "data-analytics",
      timeout: 60000,
      verbose: true,
    });
  }

  protected async setup(_runConfig: RunConfig): Promise<void> {
    this.log("Verifying data recording pipeline per docs/DATA.md");
  }

  protected async execute(_runConfig: RunConfig): Promise<void> {
    this.log("\n=== CHECK 1: Chip Movement Recording Completeness ===");
    this.checkChipMovementCompleteness();

    this.log("\n=== CHECK 2: Bot Stats Update Correctness ===");
    this.checkBotStatsUpdateCorrectness();

    this.log("\n=== CHECK 3: Hand History Recording Completeness ===");
    this.checkHandHistoryCompleteness();

    this.log("\n=== CHECK 4: Event Listener Registration ===");
    this.checkEventListenerRegistration();

    this.log("\n=== CHECK 5: Chip Conservation in Recording ===");
    this.checkChipConservationInRecording();

    this.log("\n=== CHECK 6: Analytics Aggregation Consistency ===");
    this.checkAnalyticsAggregation();

    this.log("\n=== CHECK 7: Error Swallowing in Data Pipeline ===");
    this.checkErrorSwallowing();

    this.log("\n=== CHECK 8: DATA.md Contract Compliance ===");
    this.checkDataMdCompliance();

    this.log("\n=== CHECK 9: Leaderboard Data Source Integrity ===");
    this.checkLeaderboardIntegrity();

    this.log("\n=== CHECK 10: Replay Data Completeness ===");
    this.checkReplayDataCompleteness();
  }

  protected async teardown(): Promise<void> {}

  // ============================================================================
  // CHECK 1: Are ALL chip movement types from DATA.md actually recorded?
  // ============================================================================
  private checkChipMovementCompleteness(): void {
    const persistencePath = path.join(
      this.workspaceRoot,
      "src/services/game/game-data-persistence.service.ts",
    );
    if (!fs.existsSync(persistencePath)) {
      this.log("  Skipping: persistence service not found");
      return;
    }

    const content = fs.readFileSync(persistencePath, "utf-8");

    const requiredMovementTypes = [
      { type: "bet", description: "Player bets/raises" },
      { type: "win", description: "Player wins pot" },
      { type: "ante", description: "Ante payment" },
      { type: "blind", description: "Blind payment" },
      { type: "refund", description: "Uncalled bet refund" },
      { type: "tournament_buyin", description: "Tournament buy-in" },
      { type: "tournament_payout", description: "Tournament payout" },
      { type: "rebuy", description: "Tournament rebuy" },
    ];

    for (const { type, description } of requiredMovementTypes) {
      this.recordCheck();
      const isRecorded =
        content.includes(`movement_type: "${type}"`) ||
        content.includes(`movement_type: '${type}'`) ||
        content.includes(`"${type}" as const`);

      if (!isRecorded) {
        this.addFinding({
          category: "BUG",
          severity: type === "ante" || type === "blind" ? "critical" : "high",
          title: `Chip movement type "${type}" is never recorded`,
          description:
            `DATA.md defines "${type}" (${description}) as a chip movement type, ` +
            `but the persistence service never creates a chip_movement with this type. ` +
            `The chip audit trail is incomplete — these movements are invisible.`,
          location: {
            file: "src/services/game/game-data-persistence.service.ts",
          },
          reproducible: true,
          tags: ["data-analytics", "chip-movements", "audit-trail"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }
  }

  // ============================================================================
  // CHECK 2: Bot stats update logic correctness
  // ============================================================================
  private checkBotStatsUpdateCorrectness(): void {
    const persistencePath = path.join(
      this.workspaceRoot,
      "src/services/game/game-data-persistence.service.ts",
    );
    if (!fs.existsSync(persistencePath)) return;

    const content = fs.readFileSync(persistencePath, "utf-8");

    const requiredStats = [
      { field: "total_hands", context: "Incremented per player per hand" },
      { field: "total_net", context: "Net chips won/lost" },
      { field: "vpip_hands", context: "Voluntarily put money in pot" },
      { field: "pfr_hands", context: "Preflop raise" },
      { field: "wtsd_hands", context: "Went to showdown" },
      { field: "wmsd_hands", context: "Won money at showdown" },
      { field: "aggressive_actions", context: "Bets/raises" },
      { field: "passive_actions", context: "Calls/checks" },
      { field: "total_tournaments", context: "Tournament count" },
      { field: "tournament_wins", context: "Tournament wins" },
    ];

    for (const { field, context } of requiredStats) {
      this.recordCheck();
      const isUpdated =
        content.includes(`"${field}"`) ||
        content.includes(`'${field}'`) ||
        content.includes(field);

      if (!isUpdated) {
        this.addFinding({
          category: "BUG",
          severity: "high",
          title: `Bot stat "${field}" is never updated in persistence service`,
          description:
            `The bot_stats.${field} field (${context}) is defined in the entity ` +
            `but the persistence service never updates it. This metric will always be 0.`,
          location: {
            file: "src/services/game/game-data-persistence.service.ts",
          },
          reproducible: true,
          tags: ["data-analytics", "bot-stats", "missing-update"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }

    this.recordCheck();
    const vpipSection = this.extractMethodBody(
      content,
      "recordPlayerActionEvent",
    );
    if (vpipSection) {
      const checksPreflop =
        vpipSection.includes("preflop") || vpipSection.includes("pre-flop");
      const incrementsVpip = vpipSection.includes("vpip_hands");
      const incrementsPfr = vpipSection.includes("pfr_hands");

      if (!checksPreflop || !incrementsVpip) {
        this.addFinding({
          category: "BUG",
          severity: "high",
          title:
            "VPIP calculation may be wrong — not filtering by preflop stage",
          description:
            `VPIP should only count preflop voluntary actions. The recordPlayerActionEvent method ` +
            `${!checksPreflop ? "doesn't check for preflop stage" : "doesn't increment vpip_hands"}. ` +
            `This makes the VPIP metric unreliable for bot analytics.`,
          location: {
            file: "src/services/game/game-data-persistence.service.ts",
          },
          reproducible: true,
          tags: ["data-analytics", "vpip", "calculation-error"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }

      this.recordCheck();
      if (!incrementsPfr) {
        this.addFinding({
          category: "BUG",
          severity: "high",
          title: "PFR never incremented in player action handler",
          description:
            `The recordPlayerActionEvent handler doesn't increment pfr_hands. ` +
            `Preflop raise percentage will always show 0%.`,
          location: {
            file: "src/services/game/game-data-persistence.service.ts",
          },
          reproducible: true,
          tags: ["data-analytics", "pfr", "calculation-error"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }

    this.recordCheck();
    const updateMethod = this.extractMethodBody(content, "updateBotStats");
    if (updateMethod) {
      const hasTransaction =
        updateMethod.includes("transaction") ||
        updateMethod.includes("queryRunner");

      if (!hasTransaction) {
        this.addFinding({
          category: "BUG",
          severity: "high",
          title:
            "updateBotStats performs multiple increments without a transaction",
          description:
            `updateBotStats increments total_hands, total_net, wtsd_hands, and wmsd_hands ` +
            `as separate operations without a transaction. If any fails mid-way, ` +
            `bot_stats will have inconsistent data (e.g., total_hands incremented but total_net not).`,
          location: {
            file: "src/services/game/game-data-persistence.service.ts",
          },
          reproducible: true,
          tags: [
            "data-analytics",
            "bot-stats",
            "transaction-safety",
            "consistency",
          ],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }
  }

  // ============================================================================
  // CHECK 3: Hand history recording (hands, hand_players, actions)
  // ============================================================================
  private checkHandHistoryCompleteness(): void {
    const persistencePath = path.join(
      this.workspaceRoot,
      "src/services/game/game-data-persistence.service.ts",
    );
    if (!fs.existsSync(persistencePath)) return;

    const content = fs.readFileSync(persistencePath, "utf-8");

    const requiredRecordings = [
      {
        event: "game.handStarted",
        mustCreate: ["hand", "handPlayer"],
        description: "Hand start must create hand + hand_player rows",
      },
      {
        event: "game.playerAction",
        mustCreate: ["action"],
        description: "Each player action must create an action row",
      },
      {
        event: "game.handComplete",
        mustUpdate: ["hand", "handPlayer", "gamePlayer"],
        description:
          "Hand completion must update hand, hand_players, and game_players",
      },
      {
        event: "game.finished",
        mustUpdate: ["game"],
        description: "Game finish must update game status",
      },
    ];

    for (const req of requiredRecordings) {
      this.recordCheck();
      const listenerRegistered = content.includes(`"${req.event}"`);

      if (!listenerRegistered) {
        this.addFinding({
          category: "BUG",
          severity: "critical",
          title: `Event "${req.event}" has no listener in persistence service`,
          description: `${req.description}. Without this listener, data will be silently lost.`,
          location: {
            file: "src/services/game/game-data-persistence.service.ts",
          },
          reproducible: true,
          tags: ["data-analytics", "event-listener", "data-loss"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }

    this.recordCheck();
    const handStartMethod = this.extractMethodBody(content, "onHandStarted");
    if (handStartMethod) {
      const createsHand =
        this.methodUsesInjectedRepositoryPersistence(
          handStartMethod,
          "handRepository",
        ) || this.methodUsesGetRepositoryPersistence(handStartMethod, "Hand");
      const createsHandPlayers =
        this.methodUsesInjectedRepositoryPersistence(
          handStartMethod,
          "handPlayerRepository",
        ) ||
        this.methodUsesGetRepositoryPersistence(handStartMethod, "HandPlayer");

      if (!createsHand) {
        this.addFinding({
          category: "BUG",
          severity: "critical",
          title: "onHandStarted doesn't create a hand record",
          description:
            `The hand start handler doesn't write to the hands table. ` +
            `Every hand played will be invisible in the hand history.`,
          location: {
            file: "src/services/game/game-data-persistence.service.ts",
          },
          reproducible: true,
          tags: ["data-analytics", "hand-history", "data-loss"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }

      this.recordCheck();
      if (!createsHandPlayers) {
        this.addFinding({
          category: "BUG",
          severity: "critical",
          title: "onHandStarted doesn't create hand_player records",
          description:
            `The hand start handler doesn't write to hand_players. ` +
            `Player participation in hands will not be tracked — ` +
            `hole cards, positions, and per-player hand outcomes will be missing.`,
          location: {
            file: "src/services/game/game-data-persistence.service.ts",
          },
          reproducible: true,
          tags: ["data-analytics", "hand-players", "data-loss"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }

    this.recordCheck();
    const actionMethod = this.extractMethodBody(content, "onPlayerAction");
    if (actionMethod) {
      const directlyCreatesAction =
        actionMethod.includes("actionRepository") &&
        (actionMethod.includes(".create(") ||
          actionMethod.includes(".save(") ||
          actionMethod.includes(".insert("));
      const delegatesToHelper = actionMethod.includes("recordHandActionRow");
      const createsAction = directlyCreatesAction || delegatesToHelper;

      if (!createsAction) {
        this.addFinding({
          category: "BUG",
          severity: "critical",
          title: "onPlayerAction doesn't create action records",
          description:
            `Player actions are not saved to the actions table. ` +
            `The complete decision audit trail will be empty — ` +
            `hand replays, strategy analysis, and cheat detection are impossible.`,
          location: {
            file: "src/services/game/game-data-persistence.service.ts",
          },
          reproducible: true,
          tags: ["data-analytics", "actions", "audit-trail", "data-loss"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }
  }

  // ============================================================================
  // CHECK 4: Event listener registration completeness
  // ============================================================================
  private checkEventListenerRegistration(): void {
    const persistencePath = path.join(
      this.workspaceRoot,
      "src/services/game/game-data-persistence.service.ts",
    );
    if (!fs.existsSync(persistencePath)) return;

    const content = fs.readFileSync(persistencePath, "utf-8");

    const gameLogicFiles = [
      "src/game/poker-game.service.ts",
      "src/workers/game.worker.ts",
      "src/services/game/live-game-manager.service.ts",
    ];

    const emittedEvents = new Set<string>();
    for (const relPath of gameLogicFiles) {
      const fullPath = path.join(this.workspaceRoot, relPath);
      if (!fs.existsSync(fullPath)) continue;

      const gameContent = fs.readFileSync(fullPath, "utf-8");
      const emitRegex = /emit\(\s*["']([^"']+)["']/g;
      let match;
      while ((match = emitRegex.exec(gameContent)) !== null) {
        emittedEvents.add(match[1]);
      }
    }

    const gameEvents = [...emittedEvents].filter((e) => e.startsWith("game."));

    const informationalEvents = new Set([
      "game.playerJoined",
      "game.playerRemoved",
      "game.turnChanged",
      "game.handEnded",
      "game.actionProcessed",
      "game.handCancelled",
      "game.stateUpdated",
      "game.recovered",
    ]);

    for (const event of gameEvents) {
      if (informationalEvents.has(event)) continue;
      this.recordCheck();
      const hasListener =
        content.includes(`"${event}"`) || content.includes(`'${event}'`);

      if (!hasListener) {
        this.addFinding({
          category: "CONCERN",
          severity: "medium",
          title: `Game event "${event}" has no persistence listener`,
          description:
            `The game engine emits "${event}" but the persistence service doesn't listen for it. ` +
            `This event's data is silently discarded. Review if it contains recordable information.`,
          location: {
            file: "src/services/game/game-data-persistence.service.ts",
          },
          reproducible: true,
          tags: ["data-analytics", "event-listener", "coverage-gap"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }
  }

  // ============================================================================
  // CHECK 5: Chip conservation in recording logic
  // ============================================================================
  private checkChipConservationInRecording(): void {
    const persistencePath = path.join(
      this.workspaceRoot,
      "src/services/game/game-data-persistence.service.ts",
    );
    if (!fs.existsSync(persistencePath)) return;

    const content = fs.readFileSync(persistencePath, "utf-8");
    const recordMethod = this.extractMethodBody(content, "recordChipMovements");

    if (!recordMethod) {
      this.recordCheck();
      this.addFinding({
        category: "BUG",
        severity: "critical",
        title: "recordChipMovements method not found",
        description: "The chip movement recording method is missing entirely.",
        location: {
          file: "src/services/game/game-data-persistence.service.ts",
        },
        reproducible: true,
        tags: ["data-analytics", "chip-movements", "missing-method"],
      });
      this.recordTest(false);
      return;
    }

    this.recordCheck();
    const validatesBalance =
      recordMethod.includes("balance_before") &&
      recordMethod.includes("balance_after");
    if (!validatesBalance) {
      this.addFinding({
        category: "BUG",
        severity: "high",
        title: "Chip movements don't track balance_before/balance_after",
        description:
          `The recordChipMovements method doesn't set balance_before and balance_after. ` +
          `Without these, the chip audit trail can't verify balance consistency. ` +
          `DATA.md requires: "Snapshot context at the moment of the event."`,
        location: {
          file: "src/services/game/game-data-persistence.service.ts",
        },
        reproducible: true,
        tags: ["data-analytics", "chip-conservation", "balance-tracking"],
      });
      this.recordTest(false);
    } else {
      this.recordTest(true);
    }

    this.recordCheck();
    const hasConsistencyCheck =
      recordMethod.includes("balance_before") &&
      recordMethod.includes("amount") &&
      (recordMethod.includes("assert") ||
        recordMethod.includes("if (") ||
        recordMethod.includes("!==") ||
        recordMethod.includes("!="));
    if (!hasConsistencyCheck) {
      this.addFinding({
        category: "CODE_QUALITY",
        severity: "medium",
        title: "No balance consistency assertion in chip movement recording",
        description:
          `recordChipMovements records balance_before and balance_after but never asserts ` +
          `that balance_after === balance_before + amount. Silent balance errors could accumulate.`,
        location: {
          file: "src/services/game/game-data-persistence.service.ts",
        },
        reproducible: true,
        tags: ["data-analytics", "chip-conservation", "invariant-missing"],
      });
      this.recordTest(false);
    } else {
      this.recordTest(true);
    }
  }

  // ============================================================================
  // CHECK 6: Analytics aggregation (bot_stats vs hand_players consistency)
  // ============================================================================
  private checkAnalyticsAggregation(): void {
    const analyticsRepoPath = path.join(
      this.workspaceRoot,
      "src/repositories/analytics.repository.ts",
    );
    if (!fs.existsSync(analyticsRepoPath)) {
      this.log("  Skipping: analytics repository not found");
      return;
    }

    const content = fs.readFileSync(analyticsRepoPath, "utf-8");

    this.recordCheck();
    const hasBotStatsReconciliation =
      content.includes("bot_stats") &&
      (content.includes("hand_players") || content.includes("actions")) &&
      (content.includes("SUM") || content.includes("COUNT"));

    if (!hasBotStatsReconciliation) {
      this.addFinding({
        category: "CONCERN",
        severity: "medium",
        title: "No bot_stats reconciliation query exists",
        description:
          `There's no query that cross-checks bot_stats against the source tables ` +
          `(hand_players, actions). If the incremental updates in updateBotStats drift, ` +
          `there's no way to detect or fix the discrepancy. ` +
          `DATA.md notes bot_stats is "Rebuildable" — but no rebuild mechanism exists.`,
        location: { file: "src/repositories/analytics.repository.ts" },
        reproducible: true,
        tags: ["data-analytics", "reconciliation", "bot-stats"],
      });
      this.recordTest(false);
    } else {
      this.recordTest(true);
    }

    this.recordCheck();
    const hasChipAuditQuery =
      content.includes("chip_conservation") ||
      content.includes("total_in") ||
      content.includes("total_out") ||
      (content.includes("chip_movements") &&
        content.includes("SUM") &&
        content.includes("GROUP BY"));

    if (!hasChipAuditQuery) {
      this.addFinding({
        category: "CONCERN",
        severity: "medium",
        title: "No chip conservation audit query exists",
        description:
          `DATA.md includes a "Chip Conservation Audit" SQL query pattern, ` +
          `but the analytics repository doesn't implement it. ` +
          `There's no automated way to detect chip leaks or duplications.`,
        location: { file: "src/repositories/analytics.repository.ts" },
        reproducible: true,
        tags: ["data-analytics", "chip-conservation", "audit-query"],
      });
      this.recordTest(false);
    } else {
      this.recordTest(true);
    }
  }

  // ============================================================================
  // CHECK 7: Error swallowing in the data pipeline
  // ============================================================================
  private checkErrorSwallowing(): void {
    const persistencePath = path.join(
      this.workspaceRoot,
      "src/services/game/game-data-persistence.service.ts",
    );
    if (!fs.existsSync(persistencePath)) return;

    const content = fs.readFileSync(persistencePath, "utf-8");

    this.recordCheck();
    const fireAndForgetPattern =
      /\.catch\(\s*\(e\)\s*=>\s*\n?\s*this\.logger\.error/g;
    const fireAndForgetCount = (content.match(fireAndForgetPattern) || [])
      .length;

    if (fireAndForgetCount > 0) {
      this.addFinding({
        category: "BUG",
        severity: "high",
        title: `${fireAndForgetCount} fire-and-forget data recording calls with swallowed errors`,
        description:
          `The persistence service calls updateBotStats() and recordChipMovements() ` +
          `as fire-and-forget promises (.catch(log)). If they fail, the error is logged ` +
          `but the data is silently lost. For "the data is the product", failures should ` +
          `trigger retries or at minimum be tracked as incidents.`,
        location: {
          file: "src/services/game/game-data-persistence.service.ts",
        },
        reproducible: true,
        tags: ["data-analytics", "error-handling", "data-loss-risk"],
      });
      this.recordTest(false);
    } else {
      this.recordTest(true);
    }

    this.recordCheck();
    const tryCatchBlocks = (content.match(/catch\s*\(/g) || []).length;
    const loggerErrorInCatch = (content.match(/this\.logger\.error\(/g) || [])
      .length;
    const rethrowsOrMetrics =
      (content.match(/throw\s/g) || []).length +
      (content.match(/metrics|counter|increment.*error/gi) || []).length;

    if (tryCatchBlocks > 5 && rethrowsOrMetrics === 0) {
      this.addFinding({
        category: "CODE_QUALITY",
        severity: "low",
        title: `${tryCatchBlocks} catch blocks that only log — no error metrics or retries`,
        description:
          `All ${tryCatchBlocks} error handlers in the persistence service only log errors. ` +
          `None retry, none increment error counters, none trigger alerts. ` +
          `Data loss from transient DB issues will go unnoticed until someone checks logs.`,
        location: {
          file: "src/services/game/game-data-persistence.service.ts",
        },
        reproducible: true,
        tags: ["data-analytics", "observability", "error-handling"],
      });
      this.recordTest(false);
    } else {
      this.recordTest(true);
    }
  }

  // ============================================================================
  // CHECK 8: DATA.md contract compliance
  // ============================================================================
  private checkDataMdCompliance(): void {
    const dataMdPath = path.join(this.workspaceRoot, "docs/DATA.md");
    if (!fs.existsSync(dataMdPath)) {
      this.log("  Skipping: docs/DATA.md not found");
      return;
    }

    const dataMd = fs.readFileSync(dataMdPath, "utf-8");
    const persistencePath = path.join(
      this.workspaceRoot,
      "src/services/game/game-data-persistence.service.ts",
    );
    if (!fs.existsSync(persistencePath)) return;
    const persistenceContent = fs.readFileSync(persistencePath, "utf-8");

    const rules = [
      {
        rule: "Never hard-delete any gameplay record",
        check: () => {
          const hasDelete =
            persistenceContent.includes(".delete(") ||
            persistenceContent.includes(".remove(");
          const deleteTargets = (
            persistenceContent.match(
              /(?:hand|action|handPlayer|gamePlayer)Repository\.\s*(?:delete|remove)\(/g,
            ) || []
          ).length;
          return deleteTargets === 0;
        },
        severity: "critical" as const,
      },
      {
        rule: "Record causality, not just outcome",
        check: () => {
          return (
            persistenceContent.includes("actionRepository") &&
            persistenceContent.includes("action_seq") &&
            persistenceContent.includes("stage")
          );
        },
        severity: "high" as const,
      },
      {
        rule: "Snapshot context at the moment of the event",
        check: () => {
          return (
            persistenceContent.includes("balance_before") &&
            persistenceContent.includes("balance_after") &&
            persistenceContent.includes("pot_after") &&
            persistenceContent.includes("chips_after")
          );
        },
        severity: "high" as const,
      },
      {
        rule: "Materialize expensive aggregates (bot_stats)",
        check: () => {
          return (
            persistenceContent.includes("botStatsRepository") &&
            persistenceContent.includes("increment")
          );
        },
        severity: "high" as const,
      },
    ];

    for (const { rule, check, severity } of rules) {
      this.recordCheck();
      const passes = check();

      if (!passes) {
        this.addFinding({
          category: "BUG",
          severity,
          title: `DATA.md rule violated: "${rule}"`,
          description:
            `The persistence service violates the DATA.md contract: "${rule}". ` +
            `This rule exists because "the data is the product."`,
          location: {
            file: "src/services/game/game-data-persistence.service.ts",
          },
          reproducible: true,
          tags: ["data-analytics", "data-contract", "data-md"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }
  }

  // ============================================================================
  // CHECK 9: Leaderboard data source integrity
  // ============================================================================
  private checkLeaderboardIntegrity(): void {
    const gameRepoFiles = findFiles(
      path.join(this.workspaceRoot, "src/repositories"),
      ".ts",
    );

    for (const file of gameRepoFiles) {
      const content = fs.readFileSync(file, "utf-8");
      if (!content.includes("leaderboard") && !content.includes("Leaderboard"))
        continue;

      this.recordCheck();
      const usesTotalNet =
        content.includes("total_net") || content.includes("totalNet");
      const usesBotStats =
        content.includes("bot_stats") || content.includes("BotStats");

      if (usesTotalNet && usesBotStats) {
        const joinsWithBots =
          content.includes("JOIN") &&
          (content.includes("bots") || content.includes("Bot"));
        const hasActiveFilter =
          content.includes("active") || content.includes("WHERE");

        this.recordCheck();
        if (!hasActiveFilter) {
          this.addFinding({
            category: "BUG",
            severity: "medium",
            title: "Leaderboard query may include inactive bots",
            description:
              `The leaderboard query uses bot_stats but doesn't filter by bot active status. ` +
              `Deactivated bots could appear on the leaderboard.`,
            location: {
              file: path.relative(this.workspaceRoot, file),
            },
            reproducible: true,
            tags: ["data-analytics", "leaderboard", "filter-gap"],
          });
          this.recordTest(false);
        } else {
          this.recordTest(true);
        }
      }
    }
  }

  // ============================================================================
  // CHECK 10: Replay data completeness
  // ============================================================================
  private checkReplayDataCompleteness(): void {
    const persistencePath = path.join(
      this.workspaceRoot,
      "src/services/game/game-data-persistence.service.ts",
    );
    if (!fs.existsSync(persistencePath)) return;

    const content = fs.readFileSync(persistencePath, "utf-8");

    const replayFields = [
      {
        field: "community_cards",
        table: "hands",
        importance: "Card display in replay",
      },
      {
        field: "hole_cards",
        table: "hand_players",
        importance: "Player cards in replay",
      },
      {
        field: "pot_after",
        table: "actions",
        importance: "Pot progression in replay",
      },
      {
        field: "chips_after",
        table: "actions",
        importance: "Stack changes in replay",
      },
      {
        field: "response_time_ms",
        table: "actions",
        importance: "Bot performance tracking",
      },
      {
        field: "best_hand",
        table: "hand_players",
        importance: "Winning hand display",
      },
    ];

    for (const { field, table, importance } of replayFields) {
      this.recordCheck();
      const isRecorded = content.includes(field);

      if (!isRecorded) {
        this.addFinding({
          category: "BUG",
          severity: "high",
          title: `Replay field "${field}" (${table}) not recorded by persistence`,
          description:
            `The field "${field}" is needed for ${importance} but the persistence ` +
            `service never sets it. Hand replay will be incomplete.`,
          location: {
            file: "src/services/game/game-data-persistence.service.ts",
          },
          reproducible: true,
          tags: ["data-analytics", "hand-replay", "missing-field"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Injected repo field (e.g. this.handRepository) with a write call somewhere in the method.
   */
  private methodUsesInjectedRepositoryPersistence(
    methodBody: string,
    repoFieldName: string,
  ): boolean {
    if (!methodBody.includes(repoFieldName)) return false;
    return (
      methodBody.includes(".create(") ||
      methodBody.includes(".save(") ||
      methodBody.includes(".insert(")
    );
  }

  /**
   * EntityManager / transactional pattern: getRepository(Entity).create|save|insert(
   * Uses \\b on the entity name so Hand does not match HandPlayer.
   */
  private methodUsesGetRepositoryPersistence(
    methodBody: string,
    entityClassName: string,
  ): boolean {
    const escaped = entityClassName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `getRepository\\s*\\(\\s*${escaped}\\b\\s*\\)\\s*\\.\\s*(?:create|save|insert)\\s*\\(`,
    );
    return re.test(methodBody);
  }

  private extractMethodBody(
    content: string,
    methodName: string,
  ): string | null {
    const patterns = [
      new RegExp(
        `(?:private|protected|public|async)\\s+(?:async\\s+)?${methodName}\\s*\\(`,
      ),
      new RegExp(`${methodName}\\s*\\(`),
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(content);
      if (!match) continue;

      const start = content.indexOf("{", match.index);
      if (start === -1) continue;

      let depth = 1;
      let end = start + 1;
      for (; end < content.length && depth > 0; end++) {
        if (content[end] === "{") depth++;
        if (content[end] === "}") depth--;
      }

      return content.slice(start, end);
    }

    return null;
  }
}

runMonsterCli(new DataAnalyticsMonster(), "data-analytics");
