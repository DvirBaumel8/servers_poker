import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan } from "typeorm";
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { StrategyAnalysisReport } from "../../entities/strategy-analysis-report.entity";
import { StrategyTunerRun } from "../../entities/strategy-tuner-run.entity";
import { STRATEGY_TUNABLES } from "./strategy-tunables";

interface AggregatedCheck {
  checkId: string;
  totalOccurrences: number;
  affectedBots: number;
  avgQualityScore: number;
  reports: number;
}

interface TuningOpportunity {
  parameter: string;
  currentValue: number;
  proposedValue: number;
  rationale: string;
  triggerCheckId: string;
  occurrences: number;
  affectedBots: number;
}

const MAX_CHANGE_RATIO = 0.2;
const MIN_OCCURRENCES_TO_TRIGGER = 5;
const MIN_AFFECTED_BOTS = 2;

@Injectable()
export class StrategyTunerService {
  private readonly logger = new Logger(StrategyTunerService.name);
  private readonly projectRoot: string;
  private readonly tunablesPath: string;

  constructor(
    @InjectRepository(StrategyAnalysisReport)
    private readonly reportRepo: Repository<StrategyAnalysisReport>,
    @InjectRepository(StrategyTunerRun)
    private readonly runRepo: Repository<StrategyTunerRun>,
  ) {
    this.projectRoot = join(__dirname, "..", "..", "..");
    this.tunablesPath = join(__dirname, "strategy-tunables.ts");
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async scheduledRun(): Promise<void> {
    this.logger.log("Scheduled tuner run starting");
    await this.runTuner();
  }

  async runTuner(): Promise<StrategyTunerRun> {
    const run = this.runRepo.create({
      status: "running",
      reports_analyzed: 0,
      proposed_changes: [],
      pr_url: null,
      branch_name: null,
      error_message: null,
      summary: null,
      started_at: new Date(),
      completed_at: null,
    });
    await this.runRepo.save(run);

    try {
      const lastRun = await this.getLastSuccessfulRun();
      const since = lastRun?.completed_at ?? new Date(0);

      const reports = await this.fetchReports(since);
      run.reports_analyzed = reports.length;

      if (reports.length === 0) {
        run.status = "no_changes";
        run.summary = "No new analysis reports to process.";
        run.completed_at = new Date();
        await this.runRepo.save(run);
        this.logger.log("No reports to analyze");
        return run;
      }

      const aggregated = this.aggregateReports(reports);
      const opportunities = this.detectOpportunities(aggregated);

      if (opportunities.length === 0) {
        run.status = "no_changes";
        run.summary = `Analyzed ${reports.length} reports. No tuning opportunities detected.`;
        run.completed_at = new Date();
        await this.runRepo.save(run);
        this.logger.log("No tuning opportunities found");
        return run;
      }

      run.proposed_changes = opportunities.map((o) => ({
        parameter: o.parameter,
        previousValue: o.currentValue,
        newValue: o.proposedValue,
        rationale: o.rationale,
        triggerCheckId: o.triggerCheckId,
        occurrences: o.occurrences,
        affectedBots: o.affectedBots,
      }));

      const result = await this.createPR(run, opportunities);
      run.status = result.status;
      run.pr_url = result.prUrl;
      run.branch_name = result.branchName;
      run.error_message = result.error;
      run.summary = this.buildSummary(run, opportunities);
      run.completed_at = new Date();
      await this.runRepo.save(run);

      this.logger.log(`Tuner run complete: ${run.status}`);
      return run;
    } catch (error: any) {
      run.status = "error";
      run.error_message = error.message;
      run.summary = `Tuner run failed: ${error.message}`;
      run.completed_at = new Date();
      await this.runRepo.save(run);
      this.logger.error(`Tuner run failed: ${error.message}`);
      return run;
    }
  }

  async getHistory(limit = 20): Promise<StrategyTunerRun[]> {
    return this.runRepo.find({
      order: { created_at: "DESC" },
      take: limit,
    });
  }

  // ===========================================================================
  // Aggregation
  // ===========================================================================

  private async fetchReports(since: Date): Promise<StrategyAnalysisReport[]> {
    return this.reportRepo.find({
      where: { analyzed_at: MoreThan(since) },
      order: { analyzed_at: "ASC" },
    });
  }

  aggregateReports(reports: StrategyAnalysisReport[]): AggregatedCheck[] {
    const checkMap = new Map<
      string,
      {
        occurrences: number;
        bots: Set<string>;
        qualityScores: number[];
        reports: number;
      }
    >();

    for (const report of reports) {
      for (const suggestion of report.suggestions) {
        const existing = checkMap.get(suggestion.checkId);
        if (existing) {
          existing.occurrences += suggestion.occurrences;
          existing.bots.add(report.bot_id);
          existing.qualityScores.push(report.decision_quality_score);
          existing.reports++;
        } else {
          checkMap.set(suggestion.checkId, {
            occurrences: suggestion.occurrences,
            bots: new Set([report.bot_id]),
            qualityScores: [report.decision_quality_score],
            reports: 1,
          });
        }
      }
    }

    return Array.from(checkMap.entries()).map(([checkId, data]) => ({
      checkId,
      totalOccurrences: data.occurrences,
      affectedBots: data.bots.size,
      avgQualityScore:
        data.qualityScores.reduce((a, b) => a + b, 0) /
        data.qualityScores.length,
      reports: data.reports,
    }));
  }

  // ===========================================================================
  // Detection Rules
  // ===========================================================================

  detectOpportunities(checks: AggregatedCheck[]): TuningOpportunity[] {
    const opportunities: TuningOpportunity[] = [];

    for (const check of checks) {
      if (
        check.totalOccurrences < MIN_OCCURRENCES_TO_TRIGGER ||
        check.affectedBots < MIN_AFFECTED_BOTS
      ) {
        continue;
      }

      const opp = this.mapCheckToTuning(check);
      if (opp) {
        opportunities.push(opp);
      }
    }

    return opportunities;
  }

  private mapCheckToTuning(check: AggregatedCheck): TuningOpportunity | null {
    switch (check.checkId) {
      case "folded_premium":
      case "folded_strong": {
        const param = "personality.preflopBluffDivisor";
        const current = STRATEGY_TUNABLES.personality.preflopBluffDivisor;
        const proposed = this.clampChange(current, current * 0.85);
        return {
          parameter: param,
          currentValue: current,
          proposedValue: proposed,
          rationale: `"${check.checkId}" seen ${check.totalOccurrences} times across ${check.affectedBots} bots. Lowering the preflop bluff divisor makes the personality engine less likely to fold marginal hands.`,
          triggerCheckId: check.checkId,
          occurrences: check.totalOccurrences,
          affectedBots: check.affectedBots,
        };
      }

      case "passive_strong_hand": {
        const param = "personality.strongHandThreshold";
        const current = STRATEGY_TUNABLES.personality.strongHandThreshold;
        const proposed = this.clampChange(current, current * 0.85);
        return {
          parameter: param,
          currentValue: current,
          proposedValue: proposed,
          rationale: `"passive_strong_hand" seen ${check.totalOccurrences} times across ${check.affectedBots} bots. Lowering the strong hand threshold means the engine recognizes more hands as "strong" and plays them aggressively.`,
          triggerCheckId: check.checkId,
          occurrences: check.totalOccurrences,
          affectedBots: check.affectedBots,
        };
      }

      case "overaggressive_weak": {
        const param = "sizing.postflopAggressionBonus";
        const current = STRATEGY_TUNABLES.sizing.postflopAggressionBonus;
        const proposed = this.clampChange(current, current * 0.85);
        return {
          parameter: param,
          currentValue: current,
          proposedValue: proposed,
          rationale: `"overaggressive_weak" seen ${check.totalOccurrences} times across ${check.affectedBots} bots. Reducing the postflop aggression bonus leads to smaller bet sizes, reducing reckless bluffs.`,
          triggerCheckId: check.checkId,
          occurrences: check.totalOccurrences,
          affectedBots: check.affectedBots,
        };
      }

      case "personality_inconsistent_passive": {
        const param = "personality.raiseWeightAggression";
        const current = STRATEGY_TUNABLES.personality.raiseWeightAggression;
        const proposed = this.clampChange(current, current * 1.1);
        return {
          parameter: param,
          currentValue: current,
          proposedValue: proposed,
          rationale: `"personality_inconsistent_passive" seen ${check.totalOccurrences} times across ${check.affectedBots} bots. Increasing the aggression weight makes the personality engine more responsive to high-aggression settings.`,
          triggerCheckId: check.checkId,
          occurrences: check.totalOccurrences,
          affectedBots: check.affectedBots,
        };
      }

      case "personality_inconsistent_aggressive": {
        const param = "personality.raiseWeightAggression";
        const current = STRATEGY_TUNABLES.personality.raiseWeightAggression;
        const proposed = this.clampChange(current, current * 0.9);
        return {
          parameter: param,
          currentValue: current,
          proposedValue: proposed,
          rationale: `"personality_inconsistent_aggressive" seen ${check.totalOccurrences} times across ${check.affectedBots} bots. Decreasing the aggression weight reduces unintended raises from low-aggression bots.`,
          triggerCheckId: check.checkId,
          occurrences: check.totalOccurrences,
          affectedBots: check.affectedBots,
        };
      }

      case "called_allin_trash": {
        const param = "personality.weakAllInCallDivisor";
        const current = STRATEGY_TUNABLES.personality.weakAllInCallDivisor;
        const proposed = this.clampChange(current, current * 1.15);
        return {
          parameter: param,
          currentValue: current,
          proposedValue: proposed,
          rationale: `"called_allin_trash" seen ${check.totalOccurrences} times across ${check.affectedBots} bots. Increasing the all-in call divisor makes hero-calls with weak hands rarer.`,
          triggerCheckId: check.checkId,
          occurrences: check.totalOccurrences,
          affectedBots: check.affectedBots,
        };
      }

      default:
        return null;
    }
  }

  private clampChange(current: number, proposed: number): number {
    const maxDelta = Math.abs(current) * MAX_CHANGE_RATIO;
    const delta = proposed - current;
    const clamped = Math.max(-maxDelta, Math.min(maxDelta, delta));
    const result = current + clamped;
    return Math.round(result * 1000) / 1000;
  }

  // ===========================================================================
  // Git + PR Automation
  // ===========================================================================

  private async createPR(
    run: StrategyTunerRun,
    opportunities: TuningOpportunity[],
  ): Promise<{
    status: "completed" | "tests_failed" | "git_failed";
    prUrl: string | null;
    branchName: string | null;
    error: string | null;
  }> {
    const now = new Date();
    const branchName = `auto-tune/${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

    try {
      if (!this.isGitClean()) {
        this.exec("git stash");
      }

      this.exec("git checkout main");
      this.exec("git pull origin main");
      this.exec(`git checkout -b ${branchName}`);

      this.applyChanges(opportunities);

      const testsPass = this.runTests();
      if (!testsPass) {
        this.exec("git checkout -- .");
        this.exec("git checkout main");
        this.exec(`git branch -D ${branchName}`);
        return {
          status: "tests_failed",
          prUrl: null,
          branchName,
          error: "Unit tests failed after applying changes. Changes reverted.",
        };
      }

      const commitMsg = this.buildCommitMessage(opportunities);
      this.exec("git add src/modules/bot-strategy/strategy-tunables.ts");
      this.exec(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
      this.exec(`git push -u origin ${branchName}`);

      const prBody = this.buildPRBody(run, opportunities);
      const prUrl = this.createGitHubPR(branchName, prBody);

      this.exec("git checkout main");

      return { status: "completed", prUrl, branchName, error: null };
    } catch (error: any) {
      try {
        this.exec("git checkout main 2>/dev/null || true");
        this.exec(`git branch -D ${branchName} 2>/dev/null || true`);
      } catch {
        // cleanup best-effort
      }
      return {
        status: "git_failed",
        prUrl: null,
        branchName,
        error: error.message,
      };
    }
  }

  private applyChanges(opportunities: TuningOpportunity[]): void {
    let content = readFileSync(this.tunablesPath, "utf-8");

    for (const opp of opportunities) {
      const parts = opp.parameter.split(".");
      const key = parts[parts.length - 1];
      const regex = new RegExp(
        `(${key}:\\s*)${this.escapeRegex(String(opp.currentValue))}`,
        "g",
      );
      content = content.replace(regex, `$1${opp.proposedValue}`);
    }

    writeFileSync(this.tunablesPath, content, "utf-8");
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private runTests(): boolean {
    try {
      this.exec("npx vitest run tests/unit/bot-strategy --reporter=dot", {
        timeout: 60_000,
      });
      return true;
    } catch {
      return false;
    }
  }

  private isGitClean(): boolean {
    try {
      const status = this.exec("git status --porcelain");
      return status.trim() === "";
    } catch {
      return false;
    }
  }

  private createGitHubPR(branchName: string, body: string): string | null {
    try {
      this.exec("gh auth status");
    } catch {
      this.logger.warn("gh CLI not authenticated — skipping PR creation");
      return null;
    }

    try {
      const result = this.exec(
        `gh pr create --base main --head ${branchName} --title "Auto-tune: strategy engine parameter adjustments" --body "${body.replace(/"/g, '\\"')}" --draft --label auto-tune`,
      );
      const urlMatch = result.match(/https:\/\/github\.com\/[^\s]+/);
      return urlMatch ? urlMatch[0] : null;
    } catch (error: any) {
      this.logger.warn(`Failed to create PR: ${error.message}`);
      return null;
    }
  }

  private exec(cmd: string, opts: { timeout?: number } = {}): string {
    return execSync(cmd, {
      cwd: this.projectRoot,
      encoding: "utf-8",
      timeout: opts.timeout || 30_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }

  // ===========================================================================
  // Message Builders
  // ===========================================================================

  private buildCommitMessage(opportunities: TuningOpportunity[]): string {
    const paramList = opportunities.map((o) => o.parameter).join(", ");
    return `auto-tune: adjust ${paramList}\n\nData-driven parameter tuning based on analysis of strategy decision reports.`;
  }

  private buildPRBody(
    run: StrategyTunerRun,
    opportunities: TuningOpportunity[],
  ): string {
    const rows = opportunities
      .map(
        (o) =>
          `| ${o.parameter} | ${o.currentValue} | ${o.proposedValue} | ${o.triggerCheckId} | ${o.occurrences} | ${o.affectedBots} |`,
      )
      .join("\n");

    return `## Auto-Tune: Strategy Engine Parameters

**Tuner Run ID:** ${run.id}
**Reports Analyzed:** ${run.reports_analyzed}
**Changes Proposed:** ${opportunities.length}

### Parameter Changes

| Parameter | Previous | Proposed | Trigger Check | Occurrences | Affected Bots |
|-----------|----------|----------|---------------|-------------|---------------|
${rows}

### Rationale

${opportunities.map((o) => `- **${o.parameter}**: ${o.rationale}`).join("\n")}

### Safety

- Max 20% change per parameter per cycle
- All unit tests pass with these changes
- This is a draft PR -- requires human approval before merge`;
  }

  private buildSummary(
    run: StrategyTunerRun,
    opportunities: TuningOpportunity[],
  ): string {
    const parts = [
      `Analyzed ${run.reports_analyzed} reports.`,
      `Proposed ${opportunities.length} parameter change(s).`,
    ];
    if (run.pr_url) {
      parts.push(`PR created: ${run.pr_url}`);
    } else if (run.branch_name) {
      parts.push(
        `Branch: ${run.branch_name} (PR creation skipped — gh not authenticated)`,
      );
    }
    return parts.join(" ");
  }

  private async getLastSuccessfulRun(): Promise<StrategyTunerRun | null> {
    return this.runRepo.findOne({
      where: [{ status: "completed" }, { status: "no_changes" }],
      order: { completed_at: "DESC" },
    });
  }
}
