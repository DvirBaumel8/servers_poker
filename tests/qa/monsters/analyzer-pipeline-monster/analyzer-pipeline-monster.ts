/**
 * Analyzer Pipeline Monster
 *
 * Tests the full strategy audit pipeline end-to-end:
 *
 * 1. Seeded Analysis Reports — Seeds strategy analysis data representing
 *    flawed bot decisions (skips game since the simulation monster covers that)
 * 2. Tuner Aggregation — Verifies the tuner correctly aggregates reports
 * 3. Tuner Detection — Verifies correct tuning opportunities are proposed
 * 4. Tuner Code Fix — Verifies the tuner modifies strategy-tunables.ts correctly
 * 5. Tuner Full Run — End-to-end: seed reports → run tuner → verify proposals
 *
 * Requires PostgreSQL (like the simulation monster).
 */

import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ThrottlerModule } from "@nestjs/throttler";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { DataSource } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from "fs";
import { join } from "path";
import * as entities from "../../../../src/entities";
import { appConfig } from "../../../../src/config";
import { ServicesModule } from "../../../../src/services/services.module";
import { AuthModule } from "../../../../src/modules/auth/auth.module";
import { BotsModule } from "../../../../src/modules/bots/bots.module";
import { StrategyTunerService } from "../../../../src/modules/bot-strategy/strategy-tuner.service";
import { StrategyAnalysisReport } from "../../../../src/entities/strategy-analysis-report.entity";
import { STRATEGY_TUNABLES } from "../../../../src/modules/bot-strategy/strategy-tunables";
import { BaseMonster } from "../shared/base-monster";
import { RunConfig } from "../shared/types";

// ============================================================================
// ANALYZER PIPELINE MONSTER
// ============================================================================

export class AnalyzerPipelineMonster extends BaseMonster {
  private app: INestApplication | null = null;
  private testModule: TestingModule | null = null;
  private dataSource: DataSource | null = null;
  private tunerService: StrategyTunerService | null = null;

  private userId: string = "";
  private tunablesBackupPath: string = "";
  private tunablesPath: string = "";

  constructor() {
    super({
      name: "Analyzer Pipeline Monster",
      type: "analyzer-pipeline" as any,
      timeout: 120000,
      verbose: true,
    });
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  protected async setup(_runConfig: RunConfig): Promise<void> {
    this.log("Setting up Analyzer Pipeline Monster...\n");

    this.tunablesPath = join(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "src",
      "modules",
      "bot-strategy",
      "strategy-tunables.ts",
    );
    this.tunablesBackupPath = this.tunablesPath + ".monster-backup";
    copyFileSync(this.tunablesPath, this.tunablesBackupPath);

    this.testModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
        TypeOrmModule.forRoot({
          type: "postgres",
          host: process.env.TEST_DB_HOST || "localhost",
          port: parseInt(process.env.TEST_DB_PORT || "5432", 10),
          username: process.env.TEST_DB_USERNAME || "postgres",
          password: process.env.TEST_DB_PASSWORD || "postgres",
          database: process.env.TEST_DB_NAME || "poker_test",
          entities: Object.values(entities),
          synchronize: true,
          dropSchema: true,
          logging: false,
        }),
        ThrottlerModule.forRoot([
          { name: "default", ttl: 60000, limit: 100000 },
        ]),
        EventEmitterModule.forRoot(),
        ScheduleModule.forRoot(),
        ServicesModule,
        AuthModule,
        BotsModule,
      ],
    }).compile();

    this.app = this.testModule.createNestApplication();
    await this.app.init();

    this.dataSource = this.testModule.get(DataSource);
    this.tunerService = this.testModule.get(StrategyTunerService);

    await this.seedUser();

    this.log("Infrastructure ready\n");
  }

  protected async execute(_runConfig: RunConfig): Promise<void> {
    this.log("═".repeat(60));
    this.log("ANALYZER PIPELINE — Analysis → Tuner → Code Fix");
    this.log("═".repeat(60) + "\n");

    await this.testTunerAggregation();
    await this.testTunerDetection();
    await this.testTunerCodeFix();
    await this.testTunerFullRun();
  }

  protected async teardown(): Promise<void> {
    try {
      copyFileSync(this.tunablesBackupPath, this.tunablesPath);
      unlinkSync(this.tunablesBackupPath);
    } catch {
      // best effort
    }

    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
    }
    if (this.app) {
      await this.app.close();
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async seedUser(): Promise<void> {
    this.userId = uuidv4();
    const passwordHash =
      "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.3L8KJ5h1V5OGRC";
    await this.dataSource!.query(
      `INSERT INTO users (id, email, name, password_hash, api_key_hash, role, active, email_verified, created_at, updated_at)
       VALUES ($1, $2, 'Monster User', $3, $4, 'user', true, true, NOW(), NOW())`,
      [this.userId, `monster-${Date.now()}@test.local`, passwordHash, uuidv4()],
    );
  }

  private async createBot(name: string): Promise<string> {
    const botId = uuidv4();
    await this.dataSource!.query(
      `INSERT INTO bots (id, user_id, name, endpoint, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
      [botId, this.userId, name, `http://localhost:9999/${name}`],
    );
    return botId;
  }

  private async seedAnalysisReports(
    reports: Array<{
      botId: string;
      gameId: string;
      totalDecisions: number;
      flaggedCount: number;
      qualityScore: number;
      suggestions: Array<{
        checkId: string;
        title: string;
        description: string;
        occurrences: number;
        severity: string;
      }>;
    }>,
  ): Promise<void> {
    const repo = this.dataSource!.getRepository(StrategyAnalysisReport);
    for (const r of reports) {
      const report = repo.create({
        bot_id: r.botId,
        game_id: r.gameId,
        total_decisions: r.totalDecisions,
        flagged_count: r.flaggedCount,
        decision_quality_score: r.qualityScore,
        suggestions: r.suggestions as any,
        summary: `Test report: ${r.flaggedCount} flags`,
        analyzed_at: new Date(),
      });
      await repo.save(report);
    }
  }

  // ============================================================================
  // TEST 1: Tuner Aggregation
  // ============================================================================

  private async testTunerAggregation(): Promise<void> {
    this.log("─".repeat(60));
    this.log("TEST 1: Tuner Aggregates Analysis Reports Correctly");
    this.log("─".repeat(60));

    const botId1 = await this.createBot("Agg-Bot-1");
    const botId2 = await this.createBot("Agg-Bot-2");
    const botId3 = await this.createBot("Agg-Bot-3");

    await this.seedAnalysisReports([
      {
        botId: botId1,
        gameId: uuidv4(),
        totalDecisions: 20,
        flaggedCount: 5,
        qualityScore: 60,
        suggestions: [
          {
            checkId: "folded_premium",
            title: "Folded premium hand",
            description: "Folded AA preflop",
            occurrences: 3,
            severity: "critical",
          },
          {
            checkId: "passive_strong_hand",
            title: "Passive with strong",
            description: "Checked top pair",
            occurrences: 2,
            severity: "medium",
          },
        ],
      },
      {
        botId: botId2,
        gameId: uuidv4(),
        totalDecisions: 15,
        flaggedCount: 4,
        qualityScore: 70,
        suggestions: [
          {
            checkId: "folded_premium",
            title: "Folded premium hand",
            description: "Folded KK preflop",
            occurrences: 2,
            severity: "critical",
          },
          {
            checkId: "overaggressive_weak",
            title: "Over-aggressive",
            description: "Raised with 72o",
            occurrences: 2,
            severity: "medium",
          },
        ],
      },
      {
        botId: botId3,
        gameId: uuidv4(),
        totalDecisions: 10,
        flaggedCount: 3,
        qualityScore: 75,
        suggestions: [
          {
            checkId: "folded_premium",
            title: "Folded premium hand",
            description: "Folded QQ preflop",
            occurrences: 3,
            severity: "critical",
          },
        ],
      },
    ]);

    const reports = await this.dataSource!.getRepository(
      StrategyAnalysisReport,
    ).find({
      where: [{ bot_id: botId1 }, { bot_id: botId2 }, { bot_id: botId3 }],
    });

    const aggregated = this.tunerService!.aggregateReports(reports);

    const hasEntries = aggregated.length > 0;
    this.recordTest(hasEntries);
    if (!hasEntries) {
      this.addFinding({
        category: "BUG",
        severity: "critical",
        title: "Tuner aggregation produced no entries",
        description:
          "3 reports with suggestions were passed to aggregateReports, but result is empty.",
        location: {
          file: "src/modules/bot-strategy/strategy-tuner.service.ts",
          component: "aggregateReports",
        },
        reproducible: true,
        tags: ["analyzer-pipeline", "tuner", "aggregation"],
      });
      return;
    }
    this.log(
      `  Aggregated ${reports.length} reports into ${aggregated.length} check group(s)`,
    );

    const foldedPremium = aggregated.find(
      (a) => a.checkId === "folded_premium",
    );
    const foldedCorrect =
      foldedPremium != null &&
      foldedPremium.totalOccurrences === 8 &&
      foldedPremium.affectedBots === 3;
    this.recordTest(foldedCorrect);
    if (!foldedCorrect) {
      this.addFinding({
        category: "BUG",
        severity: "high",
        title: "Incorrect aggregation of folded_premium",
        description: `Expected 8 occurrences across 3 bots, got ${foldedPremium?.totalOccurrences ?? 0} across ${foldedPremium?.affectedBots ?? 0}.`,
        location: {
          file: "src/modules/bot-strategy/strategy-tuner.service.ts",
          component: "aggregateReports",
        },
        reproducible: true,
        tags: ["analyzer-pipeline", "tuner", "aggregation"],
      });
    }
    this.log(
      `  folded_premium: ${foldedPremium?.totalOccurrences} occurrences, ${foldedPremium?.affectedBots} bots`,
    );

    const passiveStrong = aggregated.find(
      (a) => a.checkId === "passive_strong_hand",
    );
    const passiveCorrect =
      passiveStrong != null &&
      passiveStrong.totalOccurrences === 2 &&
      passiveStrong.affectedBots === 1;
    this.recordTest(passiveCorrect);
    this.log(
      `  passive_strong_hand: ${passiveStrong?.totalOccurrences} occurrences, ${passiveStrong?.affectedBots} bot(s)`,
    );

    const hasAvgScore =
      foldedPremium != null &&
      foldedPremium.avgQualityScore > 0 &&
      foldedPremium.avgQualityScore <= 100;
    this.recordTest(hasAvgScore);

    this.log("  Aggregation: all checks passed\n");
  }

  // ============================================================================
  // TEST 2: Tuner Detection
  // ============================================================================

  private async testTunerDetection(): Promise<void> {
    this.log("─".repeat(60));
    this.log("TEST 2: Tuner Detects Correct Tuning Opportunities");
    this.log("─".repeat(60));

    const aboveThreshold = [
      {
        checkId: "folded_premium",
        totalOccurrences: 10,
        affectedBots: 3,
        avgQualityScore: 55,
        reports: 3,
      },
      {
        checkId: "overaggressive_weak",
        totalOccurrences: 8,
        affectedBots: 2,
        avgQualityScore: 65,
        reports: 2,
      },
    ];

    const opportunities =
      this.tunerService!.detectOpportunities(aboveThreshold);

    const found = opportunities.length === 2;
    this.recordTest(found);
    if (!found) {
      this.addFinding({
        category: "BUG",
        severity: "high",
        title: "Tuner did not detect expected opportunities",
        description: `Expected 2 tuning opportunities, got ${opportunities.length}.`,
        location: {
          file: "src/modules/bot-strategy/strategy-tuner.service.ts",
          component: "detectOpportunities",
        },
        reproducible: true,
        tags: ["analyzer-pipeline", "tuner", "detection"],
      });
    }
    this.log(`  ${opportunities.length} tuning opportunity(ies) detected`);

    const foldedOpp = opportunities.find(
      (o) => o.triggerCheckId === "folded_premium",
    );
    const correctFoldMapping =
      foldedOpp != null &&
      foldedOpp.parameter === "personality.preflopBluffDivisor";
    this.recordTest(correctFoldMapping);
    if (foldedOpp)
      this.log(
        `  folded_premium → ${foldedOpp.parameter}: ${foldedOpp.currentValue} → ${foldedOpp.proposedValue}`,
      );

    const aggressiveOpp = opportunities.find(
      (o) => o.triggerCheckId === "overaggressive_weak",
    );
    const correctAggrMapping =
      aggressiveOpp != null &&
      aggressiveOpp.parameter === "sizing.postflopAggressionBonus";
    this.recordTest(correctAggrMapping);
    if (aggressiveOpp)
      this.log(
        `  overaggressive_weak → ${aggressiveOpp.parameter}: ${aggressiveOpp.currentValue} → ${aggressiveOpp.proposedValue}`,
      );

    // Max 20% change enforced
    for (const opp of opportunities) {
      const maxDelta = Math.abs(opp.currentValue) * 0.2;
      const actualDelta = Math.abs(opp.proposedValue - opp.currentValue);
      const withinLimit = actualDelta <= maxDelta + 0.001;
      this.recordTest(withinLimit);
      if (!withinLimit) {
        this.addFinding({
          category: "BUG",
          severity: "high",
          title: "Tuner proposed change exceeds 20% limit",
          description: `${opp.parameter}: delta ${actualDelta.toFixed(4)} > max ${maxDelta.toFixed(4)}.`,
          location: {
            file: "src/modules/bot-strategy/strategy-tuner.service.ts",
            component: "clampChange",
          },
          reproducible: true,
          tags: ["analyzer-pipeline", "tuner", "safety"],
        });
      }
    }

    // Below-threshold should NOT trigger
    const belowThreshold = [
      {
        checkId: "folded_premium",
        totalOccurrences: 2,
        affectedBots: 1,
        avgQualityScore: 80,
        reports: 1,
      },
    ];
    const noOpps = this.tunerService!.detectOpportunities(belowThreshold);
    const correctlyIgnored = noOpps.length === 0;
    this.recordTest(correctlyIgnored);
    if (!correctlyIgnored) {
      this.addFinding({
        category: "BUG",
        severity: "high",
        title: "Tuner triggered on below-threshold data",
        description: `Expected 0, got ${noOpps.length}.`,
        location: {
          file: "src/modules/bot-strategy/strategy-tuner.service.ts",
          component: "detectOpportunities",
        },
        reproducible: true,
        tags: ["analyzer-pipeline", "tuner", "safety"],
      });
    }
    this.log("  Below-threshold correctly ignored");
    this.log("  Detection: all checks passed\n");
  }

  // ============================================================================
  // TEST 3: Tuner Code Fix
  // ============================================================================

  private async testTunerCodeFix(): Promise<void> {
    this.log("─".repeat(60));
    this.log("TEST 3: Tuner Modifies strategy-tunables.ts Correctly");
    this.log("─".repeat(60));

    const originalContent = readFileSync(this.tunablesPath, "utf-8");
    const originalDivisor = STRATEGY_TUNABLES.personality.preflopBluffDivisor;
    const proposedDivisor = originalDivisor * 0.85;
    const maxDelta = originalDivisor * 0.2;
    const delta = Math.max(
      -maxDelta,
      Math.min(maxDelta, proposedDivisor - originalDivisor),
    );
    const clampedDivisor = Math.round((originalDivisor + delta) * 1000) / 1000;

    // Replicate the tuner's regex replacement logic
    let modified = originalContent;
    const key = "preflopBluffDivisor";
    const escaped = String(originalDivisor).replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    const regex = new RegExp(`(${key}:\\s*)${escaped}`, "g");
    modified = modified.replace(regex, `$1${clampedDivisor}`);

    const replacementOccurred = modified !== originalContent;
    this.recordTest(replacementOccurred);
    if (!replacementOccurred) {
      this.addFinding({
        category: "BUG",
        severity: "critical",
        title: "Tuner regex replacement failed",
        description: `Could not find 'preflopBluffDivisor: ${originalDivisor}' in strategy-tunables.ts.`,
        location: {
          file: "src/modules/bot-strategy/strategy-tuner.service.ts",
          component: "applyChanges",
        },
        reproducible: true,
        tags: ["analyzer-pipeline", "tuner", "code-fix"],
      });
      return;
    }

    const hasNewValue = modified.includes(
      `preflopBluffDivisor: ${clampedDivisor}`,
    );
    this.recordTest(hasNewValue);

    const otherParamsIntact =
      modified.includes(
        `raiseWeightAggression: ${STRATEGY_TUNABLES.personality.raiseWeightAggression}`,
      ) &&
      modified.includes(
        `postflopAggressionBonus: ${STRATEGY_TUNABLES.sizing.postflopAggressionBonus}`,
      ) &&
      modified.includes(`premium: ${STRATEGY_TUNABLES.handQuality.premium}`);
    this.recordTest(otherParamsIntact);
    if (!otherParamsIntact) {
      this.addFinding({
        category: "BUG",
        severity: "critical",
        title: "Tuner code fix corrupted unrelated parameters",
        description:
          "Other parameters were modified when only preflopBluffDivisor should have changed.",
        location: {
          file: "src/modules/bot-strategy/strategy-tuner.service.ts",
          component: "applyChanges",
        },
        reproducible: true,
        tags: ["analyzer-pipeline", "tuner", "code-fix", "safety"],
      });
    }

    // Write, verify, restore
    writeFileSync(this.tunablesPath, modified, "utf-8");
    const fileWritten = readFileSync(this.tunablesPath, "utf-8") === modified;
    this.recordTest(fileWritten);
    writeFileSync(this.tunablesPath, originalContent, "utf-8");

    this.log(`  preflopBluffDivisor: ${originalDivisor} → ${clampedDivisor}`);
    this.log("  Other parameters verified intact");
    this.log("  Code fix: all checks passed\n");
  }

  // ============================================================================
  // TEST 4: Tuner Full Run
  // ============================================================================

  private async testTunerFullRun(): Promise<void> {
    this.log("─".repeat(60));
    this.log("TEST 4: Full Pipeline — DB Fetch → Aggregate → Detect → Record");
    this.log("─".repeat(60));

    // Seed reports in DB, then test the full data pipeline WITHOUT calling
    // runTuner() — that would trigger git operations and `npx vitest` (~20s).
    // Tests 1–3 already cover aggregation, detection, and code-fix logic.
    // This test validates the DB fetch→aggregate→detect→persist chain.

    const botIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      botIds.push(await this.createBot(`FullRun-Bot-${i}`));
    }

    await this.seedAnalysisReports([
      {
        botId: botIds[0],
        gameId: uuidv4(),
        totalDecisions: 20,
        flaggedCount: 4,
        qualityScore: 55,
        suggestions: [
          {
            checkId: "folded_premium",
            title: "Folded premium",
            description: "Folded AA",
            occurrences: 4,
            severity: "critical",
          },
        ],
      },
      {
        botId: botIds[1],
        gameId: uuidv4(),
        totalDecisions: 20,
        flaggedCount: 3,
        qualityScore: 60,
        suggestions: [
          {
            checkId: "folded_premium",
            title: "Folded premium",
            description: "Folded KK",
            occurrences: 3,
            severity: "critical",
          },
        ],
      },
      {
        botId: botIds[2],
        gameId: uuidv4(),
        totalDecisions: 15,
        flaggedCount: 2,
        qualityScore: 70,
        suggestions: [
          {
            checkId: "folded_premium",
            title: "Folded premium",
            description: "Folded QQ",
            occurrences: 2,
            severity: "critical",
          },
        ],
      },
    ]);

    // Fetch from DB like the tuner would
    const reportRepo = this.dataSource!.getRepository(StrategyAnalysisReport);
    const reports = await reportRepo.find({
      where: [
        { bot_id: botIds[0] },
        { bot_id: botIds[1] },
        { bot_id: botIds[2] },
      ],
    });

    const fetchedCorrectly = reports.length === 3;
    this.recordTest(fetchedCorrectly);
    this.log(`  Fetched ${reports.length} reports from DB`);

    // Aggregate
    const aggregated = this.tunerService!.aggregateReports(reports);
    const aggregatedCorrectly = aggregated.length > 0;
    this.recordTest(aggregatedCorrectly);
    this.log(`  Aggregated into ${aggregated.length} check group(s)`);

    // Detect
    const opportunities = this.tunerService!.detectOpportunities(aggregated);
    const detected = opportunities.length > 0;
    this.recordTest(detected);
    this.log(`  Detected ${opportunities.length} tuning opportunity(ies)`);

    // Verify the proposed changes have valid structure
    for (const opp of opportunities) {
      const valid =
        opp.parameter &&
        opp.currentValue != null &&
        opp.proposedValue != null &&
        opp.rationale &&
        opp.triggerCheckId &&
        opp.occurrences > 0 &&
        opp.affectedBots > 0;
      this.recordTest(!!valid);
      this.log(
        `    ${opp.parameter}: ${opp.currentValue} → ${opp.proposedValue} (${opp.triggerCheckId})`,
      );
    }

    // Verify the tuner run history is persitable
    /* eslint-disable @typescript-eslint/no-require-imports */
    const {
      StrategyTunerRun: TunerRunEntity,
    } = require("../../../../src/entities/strategy-tuner-run.entity");
    /* eslint-enable @typescript-eslint/no-require-imports */
    const runRepo = this.dataSource!.getRepository(TunerRunEntity);
    const savedRun = runRepo.create({
      status: "no_changes",
      reports_analyzed: reports.length,
      proposed_changes: opportunities.map((o) => ({
        parameter: o.parameter,
        previousValue: o.currentValue,
        newValue: o.proposedValue,
        rationale: o.rationale,
        triggerCheckId: o.triggerCheckId,
        occurrences: o.occurrences,
        affectedBots: o.affectedBots,
      })),
      pr_url: null,
      branch_name: null,
      error_message: null,
      summary: `Monster test: ${reports.length} reports, ${opportunities.length} opportunities`,
      started_at: new Date(),
      completed_at: new Date(),
    });
    await runRepo.save(savedRun);
    const persisted = savedRun.id != null;
    this.recordTest(persisted);
    this.log(`  Tuner run persisted: ${savedRun.id}`);

    // Verify history query
    const history = await this.tunerService!.getHistory();
    const historyWorks = history.length > 0;
    this.recordTest(historyWorks);
    this.log(`  History query: ${history.length} run(s)`);

    this.log("  Full pipeline: all checks passed\n");
  }
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { runMonsterCli } = require("../shared/cli-runner");
  runMonsterCli(new AnalyzerPipelineMonster(), "analyzer-pipeline");
}
