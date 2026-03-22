import { BaseMonster } from "../shared/base-monster";
import { RunConfig } from "../shared/types";
import { runMonsterCli } from "../shared/cli-runner";
import { readJsonSafe } from "../shared/fs-utils";
import * as fs from "fs";
import * as path from "path";

interface BugRetrospective {
  id: string;
  summary: string;
  category: string;
  severity: string;
  rootCause: string;
  improvement: {
    type: string;
    description: string;
    filesChanged: string[];
    testAdded: string | null;
  };
  verified: boolean;
}

class RegressionMonster extends BaseMonster {
  private bugs: BugRetrospective[] = [];
  private workspaceRoot = process.cwd();

  constructor() {
    super({
      name: "Regression Monster",
      type: "regression",
      timeout: 30000,
      verbose: true,
    });
  }

  protected async setup(_runConfig: RunConfig): Promise<void> {
    const dataPath = path.join(
      this.workspaceRoot,
      "tests/qa/monsters/data/bug-retrospectives.json",
    );
    const data = readJsonSafe<{ bugs: BugRetrospective[] }>(dataPath);
    this.bugs = (data?.bugs ?? []).filter((b: BugRetrospective) => b.verified);
    this.log(`Loaded ${this.bugs.length} verified bug retrospectives`);
  }

  protected async execute(_runConfig: RunConfig): Promise<void> {
    for (const bug of this.bugs) {
      this.recordCheck();
      await this.checkBugRegression(bug);
    }
  }

  private async checkBugRegression(bug: BugRetrospective): Promise<void> {
    for (const file of bug.improvement.filesChanged) {
      this.recordCheck();
      const fullPath = path.join(this.workspaceRoot, file);

      if (!fs.existsSync(fullPath)) {
        this.addFinding({
          category: "REGRESSION",
          severity: "critical",
          title: `Fix file deleted: ${bug.id}`,
          description: `File ${file} was part of fix for "${bug.summary}" but has been deleted. Original root cause: ${bug.rootCause}`,
          location: { file },
          reproducible: true,
          tags: ["regression", bug.category],
        });
        this.recordTest(false);
        continue;
      }

      switch (bug.category) {
        case "api":
          await this.checkApiRegression(bug, file);
          break;
        case "security":
          await this.checkSecurityRegression(bug, file);
          break;
        case "code-quality":
          await this.checkCodeQualityRegression(bug, file);
          break;
        case "game-logic":
          await this.checkGameLogicRegression(bug, file);
          break;
        default:
          this.recordTest(true);
          break;
      }
    }

    if (bug.improvement.filesChanged.length === 0) {
      this.recordTest(true, true);
    }
  }

  private async checkApiRegression(
    bug: BugRetrospective,
    file: string,
  ): Promise<void> {
    const content = fs.readFileSync(
      path.join(this.workspaceRoot, file),
      "utf-8",
    );

    if (file.includes("api-monster.config.ts")) {
      const endpointMatch = bug.summary.match(/\/[\w/]+/);
      if (endpointMatch && !content.includes(endpointMatch[0])) {
        this.addFinding({
          category: "REGRESSION",
          severity: "high",
          title: `API test coverage removed: ${bug.id}`,
          description: `The fix for "${bug.summary}" added API test coverage that appears to have been removed from ${file}`,
          location: { file },
          reproducible: true,
          tags: ["regression", "api-coverage"],
        });
        this.recordTest(false);
        return;
      }
    }

    if (file.includes("contract-monster") && file.includes("contracts")) {
      const endpointMatch = bug.summary.match(/\/[\w/]+/);
      if (endpointMatch && !content.includes(endpointMatch[0])) {
        this.addFinding({
          category: "REGRESSION",
          severity: "high",
          title: `Contract test removed: ${bug.id}`,
          description: `The fix for "${bug.summary}" added contract validation that appears to have been removed from ${file}`,
          location: { file },
          reproducible: true,
          tags: ["regression", "contract-coverage"],
        });
        this.recordTest(false);
        return;
      }
    }

    this.recordTest(true);
  }

  private async checkSecurityRegression(
    bug: BugRetrospective,
    file: string,
  ): Promise<void> {
    const content = fs.readFileSync(
      path.join(this.workspaceRoot, file),
      "utf-8",
    );

    const securityKeywords = [
      "hidePoweredBy",
      "helmet",
      "sanitize",
      "BadRequestException",
      "Throttle",
      "rejectDangerousInput",
    ];
    const relevantKeyword = securityKeywords.find((k) =>
      bug.rootCause.toLowerCase().includes(k.toLowerCase()),
    );

    if (
      relevantKeyword &&
      !content.toLowerCase().includes(relevantKeyword.toLowerCase())
    ) {
      this.addFinding({
        category: "REGRESSION",
        severity: "critical",
        title: `Security fix reverted: ${bug.id}`,
        description: `The security fix for "${bug.summary}" appears to have been reverted. Expected to find "${relevantKeyword}" in ${file}`,
        location: { file },
        reproducible: true,
        tags: ["regression", "security"],
      });
      this.recordTest(false);
      return;
    }

    this.recordTest(true);
  }

  private async checkCodeQualityRegression(
    bug: BugRetrospective,
    file: string,
  ): Promise<void> {
    const fullPath = path.join(this.workspaceRoot, file);

    if (!fs.existsSync(fullPath)) {
      this.recordTest(false);
      return;
    }

    if (file.includes("timing.ts")) {
      const content = fs.readFileSync(fullPath, "utf-8");
      const hasExports =
        content.includes("export") &&
        (content.includes("TIMEOUT") ||
          content.includes("INTERVAL") ||
          content.includes("DELAY"));
      if (!hasExports) {
        this.addFinding({
          category: "REGRESSION",
          severity: "medium",
          title: `Timing constants removed: ${bug.id}`,
          description: `The centralized timing constants file ${file} appears to have lost its exports`,
          location: { file },
          reproducible: true,
          tags: ["regression", "code-quality"],
        });
        this.recordTest(false);
        return;
      }
    }

    this.recordTest(true);
  }

  private async checkGameLogicRegression(
    bug: BugRetrospective,
    file: string,
  ): Promise<void> {
    const fullPath = path.join(this.workspaceRoot, file);
    const content = fs.readFileSync(fullPath, "utf-8");

    if (file.includes("deck.ts")) {
      const hasCardToString = content.includes("cardToString");
      const hasParseCard = content.includes("parseCard");
      if (!hasCardToString || !hasParseCard) {
        this.addFinding({
          category: "REGRESSION",
          severity: "critical",
          title: `Card conversion functions removed: ${bug.id}`,
          description: `${file} is missing critical card conversion functions (cardToString: ${hasCardToString}, parseCard: ${hasParseCard}). Original bug: ${bug.summary}`,
          location: { file },
          reproducible: true,
          tags: ["regression", "game-logic"],
        });
        this.recordTest(false);
        return;
      }
    }

    this.recordTest(true);
  }

  protected async teardown(): Promise<void> {}
}

runMonsterCli(new RegressionMonster(), "regression");
