import * as fs from "fs";
import * as path from "path";
import type { CoverageData } from "./game-simulator";

/**
 * CoverageTracker aggregates test scenario coverage across multiple game simulations.
 * Serializes metrics to test-coverage.json at project root.
 */
export class CoverageTracker {
  private data: CoverageData = {
    allInWithSidePots: 0,
    headsUp: 0,
    splitPot: 0,
    playerElimination: 0,
    everyoneFoldsToBlind: 0,
    showdown: 0,
  };

  private lastUpdated: string = new Date().toISOString();

  /**
   * Merge coverage hits from a single game simulation
   */
  mergeGameCoverage(hits: Partial<CoverageData>): void {
    for (const [key, value] of Object.entries(hits)) {
      if (key in this.data && typeof value === "number") {
        this.data[key as keyof CoverageData] += value;
      }
    }
    this.lastUpdated = new Date().toISOString();
  }

  /**
   * Get current coverage data
   */
  getData(): CoverageData {
    return { ...this.data };
  }

  /**
   * Save coverage to test-coverage.json at project root
   */
  saveToFile(projectRoot: string = process.cwd()): string {
    const filePath = path.join(projectRoot, "test-coverage.json");

    const payload = {
      timestamp: new Date().toISOString(),
      coverage: this.data,
    };

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");

    return filePath;
  }

  /**
   * Load from existing file (if it exists)
   */
  static loadFromFile(projectRoot: string = process.cwd()): CoverageTracker {
    const filePath = path.join(projectRoot, "test-coverage.json");
    const tracker = new CoverageTracker();

    if (fs.existsSync(filePath)) {
      try {
        const contents = fs.readFileSync(filePath, "utf-8");
        const data = JSON.parse(contents);
        if (data.coverage) {
          tracker.data = { ...tracker.data, ...data.coverage };
          tracker.lastUpdated = data.timestamp || new Date().toISOString();
        }
      } catch (e) {
        console.warn(
          `Failed to load test-coverage.json: ${(e as Error).message}`,
        );
      }
    }

    return tracker;
  }
}
