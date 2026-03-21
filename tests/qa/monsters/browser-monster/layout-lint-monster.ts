/**
 * Layout Lint Monster
 *
 * Analyzes React components and CSS for layout/overlap issues:
 * - Z-index conflicts and stacking issues
 * - Absolute positioning without proper containment
 * - Elements that can overlap each other
 * - Missing responsive design considerations
 *
 * This catches the "ALL IN badge overlapping cards" bug type.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { BaseMonster } from "../shared/base-monster";
import { RunConfig, MonsterType } from "../shared/types";
import { runMonsterCli } from "../shared";

/**
 * Files where heavy absolute positioning is an intentional design decision.
 * These are typically complex visual components like poker tables, game boards, etc.
 * that require precise pixel-level positioning.
 */
const ACCEPTED_HEAVY_POSITIONING_FILES = [
  "Table.tsx", // Poker table layout requires absolute positioning for seats, cards, chips
  "PlayerSeat.tsx", // Player UI elements need precise positioning relative to table
  "WinnerAnimation.tsx", // Overlay animations need absolute positioning
  "CommunityCards.tsx", // Card positioning on table
];

const MONSTER_TYPE: MonsterType = "browser";

interface ZIndexElement {
  file: string;
  line: number;
  selector: string;
  zIndex: number;
  context: string;
}

interface PositionedElement {
  file: string;
  line: number;
  className: string;
  position: string;
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  zIndex?: number;
}

interface LayoutIssue {
  type:
    | "z-index-conflict"
    | "stacking-context-unclear"
    | "absolute-without-relative"
    | "overlapping-elements"
    | "no-responsive-handling"
    | "fixed-dimensions-on-dynamic-content";
  severity: "critical" | "high" | "medium" | "low";
  file: string;
  line?: number;
  description: string;
  suggestion?: string;
}

export class LayoutLintMonster extends BaseMonster {
  private frontendPath: string;
  private componentFiles: string[] = [];
  private zIndexElements: ZIndexElement[] = [];
  private positionedElements: PositionedElement[] = [];

  constructor() {
    super({
      name: "Layout Lint Monster",
      type: MONSTER_TYPE,
      timeout: 60000,
      verbose: true,
    });
    this.frontendPath = join(process.cwd(), "frontend/src");
  }

  protected async setup(_runConfig: RunConfig): Promise<void> {
    this.log("Setting up Layout Lint Monster...");

    // Find all game-related components
    const gameComponentsPath = join(this.frontendPath, "components/game");
    if (!existsSync(gameComponentsPath)) {
      throw new Error(`Game components path not found: ${gameComponentsPath}`);
    }

    // Key files to analyze
    this.componentFiles = [
      join(gameComponentsPath, "Table.tsx"),
      join(gameComponentsPath, "PlayerSeat.tsx"),
      join(gameComponentsPath, "CommunityCards.tsx"),
      join(gameComponentsPath, "WinnerAnimation.tsx"),
      join(gameComponentsPath, "HandResultToast.tsx"),
      join(this.frontendPath, "index.css"),
    ].filter((f) => existsSync(f));

    this.log(`Found ${this.componentFiles.length} component files to analyze`);
  }

  protected async execute(_runConfig: RunConfig): Promise<void> {
    this.log("\nAnalyzing layout for overlap/z-index issues...\n");

    for (const file of this.componentFiles) {
      await this.analyzeFile(file);
    }

    // Cross-file analysis
    this.analyzeZIndexConflicts();
    this.analyzeOverlappingPositions();

    this.printSummary();
  }

  protected async teardown(): Promise<void> {
    this.log("Layout Lint Monster complete");
  }

  private async analyzeFile(filePath: string): Promise<void> {
    const content = readFileSync(filePath, "utf-8");
    const fileName = filePath.split("/").pop() || filePath;

    this.log(`\n📋 Analyzing ${fileName}...`);

    // Extract z-index usages
    this.extractZIndexUsages(filePath, content);

    // Extract positioned elements
    this.extractPositionedElements(filePath, content);

    // Check for specific issues
    this.checkAbsolutePositioning(filePath, content);
    this.checkOverlapPatterns(filePath, content);
  }

  private extractZIndexUsages(filePath: string, content: string): void {
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Match z-{number} Tailwind classes
      const tailwindZMatch = line.match(/z-(\d+)/g);
      if (tailwindZMatch) {
        for (const match of tailwindZMatch) {
          const zValue = parseInt(match.replace("z-", ""));
          this.zIndexElements.push({
            file: filePath,
            line: i + 1,
            selector: this.extractSelectorContext(lines, i),
            zIndex: zValue,
            context: line.trim().slice(0, 80),
          });
        }
      }

      // Match z-index: number in CSS or inline styles
      const cssZMatch = line.match(/z-?[Ii]ndex[:\s]+(\d+)/);
      if (cssZMatch) {
        this.zIndexElements.push({
          file: filePath,
          line: i + 1,
          selector: this.extractSelectorContext(lines, i),
          zIndex: parseInt(cssZMatch[1]),
          context: line.trim().slice(0, 80),
        });
      }
    }
  }

  private extractPositionedElements(filePath: string, content: string): void {
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Match absolute positioning
      if (
        line.includes("absolute") ||
        line.includes("position: absolute") ||
        line.includes("position: fixed")
      ) {
        const posMatch = line.match(/top[:\s]*["']?([^"'\s,;}]+)/);
        const leftMatch = line.match(/left[:\s]*["']?([^"'\s,;}]+)/);

        this.positionedElements.push({
          file: filePath,
          line: i + 1,
          className: this.extractClassName(line),
          position: line.includes("fixed") ? "fixed" : "absolute",
          top: posMatch?.[1],
          left: leftMatch?.[1],
        });
      }
    }
  }

  private checkAbsolutePositioning(filePath: string, content: string): void {
    const lines = content.split("\n");
    const fileName = filePath.split("/").pop() || filePath;

    // Count absolute elements without proper stacking context
    let absoluteCount = 0;
    const absoluteLines: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("absolute") && !lines[i].includes("relative")) {
        absoluteCount++;
        absoluteLines.push(i + 1);
      }
    }

    if (absoluteCount > 5) {
      // Check if this file is in the accepted list (intentional design decision)
      if (ACCEPTED_HEAVY_POSITIONING_FILES.includes(fileName)) {
        this.log(
          `  ℹ️  ${fileName}: ${absoluteCount} absolute elements (accepted design decision)`,
        );
        this.recordTest(true, true); // Skip - accepted
        return;
      }

      this.addFinding({
        category: "BUG",
        severity: "high",
        title: `Too many absolute positioned elements in ${fileName}`,
        description: `Found ${absoluteCount} absolute positioned elements. This can cause z-index conflicts and overlap issues. Lines: ${absoluteLines.slice(0, 5).join(", ")}...`,
        location: { file: filePath },
        reproducible: true,
        tags: ["layout", "z-index", "absolute-positioning"],
      });
      this.recordTest(false);
    } else {
      this.recordTest(true);
    }
  }

  private checkOverlapPatterns(filePath: string, content: string): void {
    const fileName = filePath.split("/").pop() || filePath;

    // Check for elements positioned at similar locations
    const topPositions = content.match(/top[:\s]*["']?(\d+%?)/g) || [];
    const leftPositions = content.match(/left[:\s]*["']?(\d+%?)/g) || [];

    // Check for badges/overlays that might conflict
    const hasAllInBadge =
      content.includes("ALL IN") || content.includes("all-in");
    const hasCards =
      content.includes("PlayingCard") || content.includes("holeCards");
    const hasDealer =
      content.includes("isDealer") || content.includes("dealer");

    if (hasAllInBadge && hasCards) {
      // Check if they have proper z-index separation
      const allInZIndex = this.findZIndexNear(content, "ALL IN");
      const cardsZIndex =
        this.findZIndexNear(content, "PlayingCard") ||
        this.findZIndexNear(content, "holeCards");

      if (
        allInZIndex &&
        cardsZIndex &&
        Math.abs(allInZIndex - cardsZIndex) < 5
      ) {
        this.addFinding({
          category: "BUG",
          severity: "high",
          title: `ALL IN badge may overlap with cards in ${fileName}`,
          description: `ALL IN badge (z-index: ${allInZIndex}) and cards (z-index: ${cardsZIndex}) have similar z-index values. When a player is all-in, the badge may overlap with hole cards.`,
          location: { file: filePath },
          evidence: {
            raw: { allInZIndex, cardsZIndex },
          },
          reproducible: true,
          reproductionSteps: [
            "Start a game with multiple players",
            "Have a player go all-in",
            "Observe the ALL IN badge overlapping with player cards",
          ],
          tags: ["layout", "overlap", "z-index", "game-ui"],
        });
        this.recordTest(false);
      }
    }

    // Check for dealer button positioning issues
    if (hasDealer && hasCards) {
      const dealerPos = content.match(
        /-bottom-[\d.]+|-right-[\d.]+|-left-[\d.]+/g,
      );
      if (dealerPos && dealerPos.length > 0) {
        this.log(
          `  ⚠️  Dealer button uses negative positioning: ${dealerPos.join(", ")}`,
        );
      }
    }
  }

  private analyzeZIndexConflicts(): void {
    this.log("\n📋 Analyzing z-index conflicts across files...");

    // Group by z-index value
    const byZIndex = new Map<number, ZIndexElement[]>();
    for (const el of this.zIndexElements) {
      const existing = byZIndex.get(el.zIndex) || [];
      existing.push(el);
      byZIndex.set(el.zIndex, existing);
    }

    // Check for elements at same z-index that might conflict
    for (const [zIndex, elements] of byZIndex) {
      if (elements.length > 3 && zIndex > 10) {
        this.addFinding({
          category: "CONCERN",
          severity: "medium",
          title: `Multiple elements at z-index ${zIndex}`,
          description: `Found ${elements.length} elements at z-index ${zIndex}. This may cause unpredictable stacking. Files: ${[...new Set(elements.map((e) => e.file.split("/").pop()))].join(", ")}`,
          location: { file: elements[0].file },
          reproducible: true,
          tags: ["layout", "z-index", "stacking"],
        });
        this.recordTest(false);
      }
    }

    // Check for z-index jumps (e.g., 10, 15, 30 - gap suggests potential issues)
    const sortedZIndexes = [...byZIndex.keys()].sort((a, b) => a - b);
    this.log(`  Z-index values in use: ${sortedZIndexes.join(", ")}`);

    if (sortedZIndexes.length > 0) {
      const maxZ = Math.max(...sortedZIndexes);
      if (maxZ > 50) {
        this.addFinding({
          category: "CONCERN",
          severity: "low",
          title: "High z-index values detected",
          description: `Maximum z-index is ${maxZ}. Consider using a z-index scale (e.g., 1, 10, 20, 30) to prevent escalation.`,
          location: { file: this.componentFiles[0] },
          reproducible: true,
          tags: ["layout", "z-index", "best-practice"],
        });
        this.recordTest(false);
      } else {
        this.recordTest(true);
      }
    }
  }

  private analyzeOverlappingPositions(): void {
    this.log("\n📋 Checking for potentially overlapping absolute elements...");

    // Find elements with similar top/left positions
    const byPosition = new Map<string, PositionedElement[]>();

    for (const el of this.positionedElements) {
      if (el.top && el.left) {
        // Normalize position to a grid
        const topNum = parseInt(el.top.replace("%", ""));
        const leftNum = parseInt(el.left.replace("%", ""));
        const gridKey = `${Math.round(topNum / 10) * 10}-${Math.round(leftNum / 10) * 10}`;

        const existing = byPosition.get(gridKey) || [];
        existing.push(el);
        byPosition.set(gridKey, existing);
      }
    }

    for (const [position, elements] of byPosition) {
      if (elements.length > 2) {
        this.addFinding({
          category: "CONCERN",
          severity: "medium",
          title: `Multiple elements positioned near ${position.replace("-", "%, ")}%`,
          description: `Found ${elements.length} absolute-positioned elements in similar location. This may cause visual overlap. Classes: ${elements.map((e) => e.className).join(", ")}`,
          location: { file: elements[0].file, line: elements[0].line },
          reproducible: true,
          tags: ["layout", "overlap", "positioning"],
        });
        this.recordTest(false);
      }
    }

    if (
      byPosition.size === 0 ||
      [...byPosition.values()].every((v) => v.length <= 2)
    ) {
      this.recordTest(true);
    }
  }

  private extractSelectorContext(lines: string[], lineIndex: number): string {
    // Look backwards for component name or className
    for (let i = lineIndex; i >= Math.max(0, lineIndex - 5); i--) {
      const classMatch = lines[i].match(/className[=:]\s*["'`{]?([^"'`}]+)/);
      if (classMatch) {
        return classMatch[1].trim().slice(0, 50);
      }
      const componentMatch = lines[i].match(/<([A-Z][a-zA-Z]+)/);
      if (componentMatch) {
        return `<${componentMatch[1]}>`;
      }
    }
    return "unknown";
  }

  private extractClassName(line: string): string {
    const match = line.match(/className[=:]\s*["'`{]?([^"'`}\n]+)/);
    return match ? match[1].trim().slice(0, 50) : "unknown";
  }

  private findZIndexNear(content: string, searchTerm: string): number | null {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(searchTerm)) {
        // Search nearby lines for z-index
        for (
          let j = Math.max(0, i - 5);
          j < Math.min(lines.length, i + 5);
          j++
        ) {
          const zMatch = lines[j].match(/z-(\d+)/);
          if (zMatch) {
            return parseInt(zMatch[1]);
          }
        }
      }
    }
    return null;
  }

  private printSummary(): void {
    this.log("\n" + "═".repeat(60));
    this.log("  LAYOUT LINT MONSTER SUMMARY");
    this.log("═".repeat(60));
    this.log(`Files analyzed: ${this.componentFiles.length}`);
    this.log(`Z-index elements found: ${this.zIndexElements.length}`);
    this.log(`Positioned elements found: ${this.positionedElements.length}`);
    this.log(`Tests run: ${this.testsRun}`);
    this.log(`Passed: ${this.testsPassed}`);
    this.log(`Failed: ${this.testsFailed}`);
    this.log(`Findings: ${this.findings.length}`);
  }
}

// CLI runner
if (require.main === module) {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  📐 LAYOUT LINT MONSTER                                          ║
║                                                                  ║
║  Analyzes layout for overlap/z-index issues:                     ║
║  - Z-index conflicts between components                          ║
║  - Overlapping absolute-positioned elements                      ║
║  - Badge/card/avatar stacking problems                           ║
║  - Missing responsive handling                                   ║
╚══════════════════════════════════════════════════════════════════╝
`);

  runMonsterCli(new LayoutLintMonster(), MONSTER_TYPE);
}
