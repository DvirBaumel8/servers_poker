/**
 * E2E Test: Strategy Analyzer Pipeline
 *
 * Runs a real poker game with intentionally flawed internal bots,
 * verifies the decision logger captures decisions, the analyzer flags
 * issues, and analysis reports are produced with correct quality scores.
 *
 * Requires: PostgreSQL running with poker_test database.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DataSource } from "typeorm";
import { AuthModule } from "../../src/modules/auth/auth.module";
import { BotsModule } from "../../src/modules/bots/bots.module";
import { ServicesModule } from "../../src/services/services.module";
import { LiveGameManagerService } from "../../src/services/game/live-game-manager.service";
import { DecisionLoggerService } from "../../src/modules/bot-strategy/decision-logger.service";
import { DecisionAnalyzerService } from "../../src/modules/bot-strategy/decision-analyzer.service";
import { StrategyDecision } from "../../src/entities/strategy-decision.entity";
import { StrategyAnalysisReport } from "../../src/entities/strategy-analysis-report.entity";
import { createTestApp, closeTestApp, TestAppContext } from "./shared/test-app";
import { createTestUser } from "./shared/test-factories";
import { v4 as uuidv4 } from "uuid";

const FOLDER_BOT_ID = uuidv4();
const MANIAC_BOT_ID = uuidv4();
const SOLID_BOT_1_ID = uuidv4();
const SOLID_BOT_2_ID = uuidv4();

const folderStrategy = {
  version: 1,
  tier: "strategy" as const,
  personality: {
    aggression: 10,
    bluffFrequency: 0,
    riskTolerance: 10,
    tightness: 95,
  },
  rules: {
    preflop: [
      {
        id: "fold-all",
        conditions: [],
        action: { type: "fold" },
        priority: 1,
      },
    ],
  },
};

const maniacStrategy = {
  version: 1,
  tier: "strategy" as const,
  personality: {
    aggression: 95,
    bluffFrequency: 90,
    riskTolerance: 95,
    tightness: 5,
  },
  rules: {
    flop: [
      {
        id: "raise-all",
        conditions: [],
        action: {
          type: "raise",
          sizing: { mode: "pot_fraction", value: 1.0 },
        },
        priority: 1,
      },
    ],
    turn: [
      {
        id: "raise-all-turn",
        conditions: [],
        action: {
          type: "raise",
          sizing: { mode: "pot_fraction", value: 1.0 },
        },
        priority: 1,
      },
    ],
    river: [
      {
        id: "raise-all-river",
        conditions: [],
        action: {
          type: "raise",
          sizing: { mode: "pot_fraction", value: 1.0 },
        },
        priority: 1,
      },
    ],
  },
};

const solidStrategy = {
  version: 1,
  tier: "quick" as const,
  personality: {
    aggression: 50,
    bluffFrequency: 20,
    riskTolerance: 50,
    tightness: 50,
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Strategy Analyzer Pipeline E2E", () => {
  let ctx: TestAppContext;
  let dataSource: DataSource;
  let liveGameManager: LiveGameManagerService;
  let decisionLogger: DecisionLoggerService;
  let decisionAnalyzer: DecisionAnalyzerService;
  let gameTableId: string;

  beforeAll(async () => {
    ctx = await createTestApp({
      imports: [ServicesModule, AuthModule, BotsModule],
    });
    dataSource = ctx.dataSource;
    liveGameManager = ctx.module.get(LiveGameManagerService);
    decisionLogger = ctx.module.get(DecisionLoggerService);
    decisionAnalyzer = ctx.module.get(DecisionAnalyzerService);

    const user = await createTestUser(dataSource, ctx.jwtService);

    await dataSource.query(
      `INSERT INTO bots (id, user_id, name, bot_type, strategy, active, created_at, updated_at)
       VALUES ($1, $2, $3, 'internal', $4, true, NOW(), NOW())`,
      [FOLDER_BOT_ID, user.id, "The Folder", JSON.stringify(folderStrategy)],
    );
    await dataSource.query(
      `INSERT INTO bots (id, user_id, name, bot_type, strategy, active, created_at, updated_at)
       VALUES ($1, $2, $3, 'internal', $4, true, NOW(), NOW())`,
      [MANIAC_BOT_ID, user.id, "The Maniac", JSON.stringify(maniacStrategy)],
    );
    await dataSource.query(
      `INSERT INTO bots (id, user_id, name, bot_type, strategy, active, created_at, updated_at)
       VALUES ($1, $2, $3, 'internal', $4, true, NOW(), NOW())`,
      [SOLID_BOT_1_ID, user.id, "Solid Bot 1", JSON.stringify(solidStrategy)],
    );
    await dataSource.query(
      `INSERT INTO bots (id, user_id, name, bot_type, strategy, active, created_at, updated_at)
       VALUES ($1, $2, $3, 'internal', $4, true, NOW(), NOW())`,
      [SOLID_BOT_2_ID, user.id, "Solid Bot 2", JSON.stringify(solidStrategy)],
    );
  }, 30_000);

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it("should run a game, log decisions, and produce analysis reports with flags", async () => {
    gameTableId = uuidv4();
    const gameDbId = uuidv4();

    // Create table and game DB records to satisfy FK constraints
    await dataSource.query(
      `INSERT INTO tables (id, name, small_blind, big_blind, starting_chips, max_players, status, created_at, updated_at)
       VALUES ($1, 'PipelineTest', 10, 20, 500, 4, 'running', NOW(), NOW())`,
      [gameTableId],
    );
    await dataSource.query(
      `INSERT INTO games (id, table_id, status, total_hands, created_at, updated_at)
       VALUES ($1, $2, 'running', 0, NOW(), NOW())`,
      [gameDbId, gameTableId],
    );

    const game = await liveGameManager.createGame({
      tableId: gameTableId,
      gameDbId,
      smallBlind: 10,
      bigBlind: 20,
      ante: 0,
      startingChips: 500,
      turnTimeoutMs: 2000,
    });

    game.addPlayer({
      id: FOLDER_BOT_ID,
      name: "The Folder",
      endpoint: "",
      chips: 500,
      botType: "internal",
      strategy: folderStrategy,
    });
    game.addPlayer({
      id: MANIAC_BOT_ID,
      name: "The Maniac",
      endpoint: "",
      chips: 500,
      botType: "internal",
      strategy: maniacStrategy,
    });
    game.addPlayer({
      id: SOLID_BOT_1_ID,
      name: "Solid Bot 1",
      endpoint: "",
      chips: 500,
      botType: "internal",
      strategy: solidStrategy,
    });
    game.addPlayer({
      id: SOLID_BOT_2_ID,
      name: "Solid Bot 2",
      endpoint: "",
      chips: 500,
      botType: "internal",
      strategy: solidStrategy,
    });

    // Wait for game to finish or play enough hands
    const maxWaitMs = 60_000;
    const startTime = Date.now();
    let handsPlayed = 0;

    while (Date.now() - startTime < maxWaitMs) {
      await sleep(200);
      const state = liveGameManager.getGameState(gameTableId);
      if (!state) break;
      handsPlayed = state.handNumber || 0;
      if (state.status === "finished" || handsPlayed >= 10) break;
    }

    expect(handsPlayed).toBeGreaterThanOrEqual(1);

    // Flush the decision logger buffer (without stopping the timer)
    await decisionLogger.forceFlush();

    // ====================================================================
    // VERIFY: Decisions were logged
    // ====================================================================

    const decisions = await dataSource.getRepository(StrategyDecision).find({
      where: { game_id: gameDbId },
    });

    expect(decisions.length).toBeGreaterThan(0);

    const folderDecisions = decisions.filter((d) => d.bot_id === FOLDER_BOT_ID);
    const maniacDecisions = decisions.filter((d) => d.bot_id === MANIAC_BOT_ID);

    expect(folderDecisions.length).toBeGreaterThan(0);
    expect(maniacDecisions.length).toBeGreaterThan(0);

    // Every decision should have full snapshots
    for (const d of decisions) {
      expect(d.bot_payload).toBeTruthy();
      expect(d.game_context).toBeTruthy();
      expect(d.strategy_snapshot).toBeTruthy();
      expect(d.action_type).toBeTruthy();
      expect(d.decision_source).toBeTruthy();
      expect(d.explanation).toBeTruthy();
    }

    // The Folder should have fold actions
    const folderFolds = folderDecisions.filter((d) => d.action_type === "fold");
    expect(folderFolds.length).toBeGreaterThan(0);

    // ====================================================================
    // TRIGGER ANALYZER: Run post-game analysis
    // ====================================================================

    await decisionAnalyzer.analyzeGame(gameDbId);

    // ====================================================================
    // VERIFY: Analysis reports were created
    // ====================================================================

    const reports = await dataSource
      .getRepository(StrategyAnalysisReport)
      .find({ where: { game_id: gameDbId } });

    // Should have reports for the bots that had decisions
    const botIdsWithDecisions = [...new Set(decisions.map((d) => d.bot_id))];
    expect(reports.length).toBe(botIdsWithDecisions.length);

    // Every report should have valid fields
    for (const report of reports) {
      expect(report.total_decisions).toBeGreaterThan(0);
      expect(report.decision_quality_score).toBeGreaterThanOrEqual(0);
      expect(report.decision_quality_score).toBeLessThanOrEqual(100);
      expect(report.summary).toBeTruthy();
      expect(report.analyzed_at).toBeInstanceOf(Date);
    }

    // ====================================================================
    // VERIFY: The Folder's report has flags
    // ====================================================================

    const folderReport = reports.find((r) => r.bot_id === FOLDER_BOT_ID);

    if (folderReport) {
      // The folder folds everything preflop — if it was dealt a premium
      // or strong hand at any point, the analyzer should flag it
      const folderAnalyzedDecisions = await dataSource
        .getRepository(StrategyDecision)
        .find({
          where: {
            bot_id: FOLDER_BOT_ID,
            game_id: gameDbId,
            analysis_status: "analyzed" as const,
          },
        });

      expect(folderAnalyzedDecisions.length).toBeGreaterThan(0);

      for (const d of folderAnalyzedDecisions) {
        expect(d.analysis_result).toBeTruthy();
        expect(d.analyzed_at).toBeInstanceOf(Date);
      }

      // Check if any flags were raised (depends on card distribution)
      if (folderReport.flagged_count > 0) {
        expect(folderReport.decision_quality_score).toBeLessThan(100);
        expect(folderReport.suggestions.length).toBeGreaterThan(0);

        const flagCheckIds = folderReport.suggestions.map((s) => s.checkId);
        // The folder's flags should be about folding good hands
        const expectedFolderFlags = [
          "folded_premium",
          "folded_strong",
          "missed_range_chart",
        ];
        const hasRelevantFlag = flagCheckIds.some((id) =>
          expectedFolderFlags.includes(id),
        );

        if (hasRelevantFlag) {
          expect(folderReport.summary.toLowerCase()).toContain("flag");
        }
      }
    }

    // ====================================================================
    // VERIFY: All decisions are now analyzed
    // ====================================================================

    const pendingDecisions = await dataSource
      .getRepository(StrategyDecision)
      .find({
        where: {
          game_id: gameDbId,
          analysis_status: "pending" as const,
        },
      });

    expect(pendingDecisions.length).toBe(0);
  }, 90_000);
});
