/**
 * UI Bug Detector
 * Takes screenshots during live gameplay and uses Gemini to find visual bugs
 * Automatically populates POKER_BUGS.md with discovered issues
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  existsSync,
} from "fs";
import { join } from "path";

export interface UIBug {
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  title: string;
  description: string;
  location: string;
  reproductionSteps: string[];
  expectedBehavior: string;
  actualBehavior: string;
  screenshot: string; // path to screenshot
}

export interface BugDetectionResult {
  gameId: string;
  timestamp: string;
  screenshotCount: number;
  bugsFound: UIBug[];
  summary: string;
}

export async function detectUIBugs(
  screenshotPaths: string[],
  gameState: any,
): Promise<UIBug[]> {
  if (!process.env.GOOGLE_API_KEY) {
    console.warn("⚠️ GOOGLE_API_KEY not set — skipping bug detection");
    return [];
  }

  if (screenshotPaths.length === 0) {
    return [];
  }

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are an expert QA tester for a professional poker game. Analyze this screenshot for VISUAL BUGS and UI ISSUES.

IMPORTANT: Look for ACTUAL BUGS, not design preferences:
- Missing or broken elements
- Incorrect values (pot, chips, positions)
- Layout issues (overlap, misalignment)
- Color/contrast problems affecting readability
- Missing player names or cards
- Incorrect state displays
- Animation/rendering glitches
- Button/clickable areas problems
- Text overflow or truncation
- Z-index/layering issues

Game state context:
- Hand number: ${gameState?.handNumber || "unknown"}
- Stage: ${gameState?.stage || "unknown"}
- Players: ${gameState?.players?.length || 0}
- Pot: ${gameState?.pot || 0}

For EACH bug found, respond with this JSON format:
{
  "bugs": [
    {
      "severity": "critical|high|medium|low",
      "category": "rendering|data|layout|contrast|missing_element",
      "title": "Short bug title",
      "description": "Detailed description of what's wrong",
      "location": "Where on screen (e.g., 'top-left player area', 'center pot display')",
      "reproductionSteps": ["Step 1", "Step 2"],
      "expectedBehavior": "What should happen",
      "actualBehavior": "What actually happens"
    }
  ]
}

Return ONLY valid JSON. If no bugs found, return {"bugs": []}`;

  // Process screenshots in parallel batches (max 3 at a time)
  const BATCH_SIZE = 3;
  const bugs: UIBug[] = [];

  for (let i = 0; i < screenshotPaths.length; i += BATCH_SIZE) {
    const batch = screenshotPaths.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((imagePath) => analyzeScreenshot(model, imagePath, prompt)),
    );

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        bugs.push(...result.value);
      } else {
        console.error(
          `Failed to analyze screenshot ${batch[index]}:`,
          result.reason,
        );
      }
    });
  }

  return bugs;
}

async function analyzeScreenshot(
  model: any,
  imagePath: string,
  prompt: string,
): Promise<UIBug[]> {
  try {
    const imageData = readFileSync(imagePath, { encoding: "base64" });

    const response = await model.generateContent([
      {
        inlineData: {
          mimeType: "image/png",
          data: imageData,
        },
      },
      {
        text: prompt,
      },
    ]);

    const responseText = response.response.text();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`No JSON in Gemini response for ${imagePath}`);
      return [];
    }

    const analysis = JSON.parse(jsonMatch[0]);
    if (analysis.bugs && Array.isArray(analysis.bugs)) {
      return analysis.bugs.map((bug: any) => ({
        ...bug,
        screenshot: imagePath,
      }));
    }

    return [];
  } catch (error) {
    console.error(`Failed to analyze screenshot ${imagePath}:`, error);
    return [];
  }
}

export function generateBugReport(
  gameId: string,
  bugs: UIBug[],
): BugDetectionResult {
  const result: BugDetectionResult = {
    gameId,
    timestamp: new Date().toISOString(),
    screenshotCount: bugs.length > 0 ? (bugs[0].screenshot ? 1 : 0) : 0,
    bugsFound: bugs,
    summary: `Found ${bugs.length} bugs: ${
      bugs.filter((b) => b.severity === "critical").length
    } critical, ${bugs.filter((b) => b.severity === "high").length} high priority`,
  };

  // Save bug report
  const reportDir = join(process.cwd(), "ui-bug-reports");
  mkdirSync(reportDir, { recursive: true });

  const reportPath = join(reportDir, `bugs-${gameId}-${Date.now()}.md`);
  const markdown = generateMarkdownReport(result);
  writeFileSync(reportPath, markdown);

  // Save JSON too
  const jsonPath = join(reportDir, `bugs-${gameId}-${Date.now()}.json`);
  writeFileSync(jsonPath, JSON.stringify(result, null, 2));

  // Update central POKER_BUGS.md file
  updatePokerBugsFile(result);

  return result;
}

function generateMarkdownReport(result: BugDetectionResult): string {
  const lines: string[] = [
    "# UI Bug Detection Report",
    "",
    `**Game ID:** ${result.gameId}`,
    `**Timestamp:** ${result.timestamp}`,
    `**Summary:** ${result.summary}`,
    "",
  ];

  // Group bugs by severity
  const criticalBugs = result.bugsFound.filter(
    (b) => b.severity === "critical",
  );
  const highBugs = result.bugsFound.filter((b) => b.severity === "high");
  const mediumBugs = result.bugsFound.filter((b) => b.severity === "medium");
  const lowBugs = result.bugsFound.filter((b) => b.severity === "low");

  if (criticalBugs.length > 0) {
    lines.push("## 🔴 Critical Bugs");
    lines.push("");
    criticalBugs.forEach((bug, i) => {
      lines.push(`### ${i + 1}. ${bug.title}`);
      lines.push(`**Category:** ${bug.category}`);
      lines.push(`**Location:** ${bug.location}`);
      lines.push(`**Description:** ${bug.description}`);
      lines.push(`**Expected:** ${bug.expectedBehavior}`);
      lines.push(`**Actual:** ${bug.actualBehavior}`);
      lines.push(`**Screenshot:** ${bug.screenshot}`);
      lines.push("");
    });
  }

  if (highBugs.length > 0) {
    lines.push("## 🟠 High Priority Bugs");
    lines.push("");
    highBugs.forEach((bug, i) => {
      lines.push(`### ${i + 1}. ${bug.title}`);
      lines.push(`**Category:** ${bug.category}`);
      lines.push(`**Location:** ${bug.location}`);
      lines.push(`**Description:** ${bug.description}`);
      lines.push("");
    });
  }

  if (mediumBugs.length > 0) {
    lines.push("## 🟡 Medium Priority Bugs");
    lines.push(`Found ${mediumBugs.length} medium priority issues`);
    lines.push("");
  }

  if (lowBugs.length > 0) {
    lines.push("## 🟢 Low Priority Bugs");
    lines.push(`Found ${lowBugs.length} low priority issues`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Update the central POKER_BUGS.md file with newly discovered bugs
 * Avoids duplicates and maintains a running list of all known issues
 */
function updatePokerBugsFile(result: BugDetectionResult): void {
  try {
    const bugsFilePath = join(process.cwd(), "POKER_BUGS.md");
    let existingContent = "";

    if (existsSync(bugsFilePath)) {
      existingContent = readFileSync(bugsFilePath, "utf-8");
    }

    // Parse existing bugs to avoid duplicates
    const existingBugTitles = new Set<string>();
    const existingMatches = existingContent.match(/### \d+\. (.+)/g) || [];
    existingMatches.forEach((match: string) => {
      const title = match.replace(/### \d+\. /, "");
      existingBugTitles.add(title);
    });

    // Filter out bugs that already exist
    const newBugs = result.bugsFound.filter(
      (bug) => !existingBugTitles.has(bug.title),
    );

    if (newBugs.length === 0) {
      return;
    }

    // Build updated content
    const lines: string[] = [];

    // Add or update header
    if (!existingContent) {
      lines.push("# Poker Game - Known Bugs & Issues");
      lines.push("");
      lines.push(
        "This file is automatically updated by the Gemini UI QA system.",
      );
      lines.push("");
      lines.push(
        "_Last updated: " +
          new Date().toISOString().split("T")[0] +
          " by Gemini QA_",
      );
      lines.push("");
      lines.push("## Severity Levels");
      lines.push("- 🔴 **Critical**: Game-breaking, prevents play");
      lines.push("- 🟠 **High**: Major visual bug, affects usability");
      lines.push(
        "- 🟡 **Medium**: Minor visual issue, noticeable but not critical",
      );
      lines.push("- 🟢 **Low**: Very minor issue or edge case");
      lines.push("");
    } else {
      lines.push(existingContent);
      if (!existingContent.endsWith("\n")) {
        lines.push("");
      }
    }

    // Add new bugs grouped by severity
    const byServerity = {
      critical: newBugs.filter((b) => b.severity === "critical"),
      high: newBugs.filter((b) => b.severity === "high"),
      medium: newBugs.filter((b) => b.severity === "medium"),
      low: newBugs.filter((b) => b.severity === "low"),
    };

    let bugNumber = 1;
    for (const severity of ["critical", "high", "medium", "low"]) {
      const bugs = byServerity[severity as keyof typeof byServerity];
      if (bugs.length === 0) continue;

      const severityEmoji = {
        critical: "🔴",
        high: "🟠",
        medium: "🟡",
        low: "🟢",
      }[severity];

      lines.push(
        `## ${severityEmoji} ${severity.charAt(0).toUpperCase() + severity.slice(1)} (${bugs.length} new)`,
      );
      lines.push("");

      bugs.forEach((bug) => {
        lines.push(`### ${bugNumber}. ${bug.title}`);
        lines.push(`- **Severity:** ${severity}`);
        lines.push(`- **Category:** ${bug.category}`);
        lines.push(`- **Location:** ${bug.location}`);
        lines.push(`- **Description:** ${bug.description}`);
        lines.push(`- **Expected:** ${bug.expectedBehavior}`);
        lines.push(`- **Actual:** ${bug.actualBehavior}`);
        lines.push(`- **Steps to Reproduce:**`);
        bug.reproductionSteps.forEach((step) => {
          lines.push(`  1. ${step}`);
        });
        lines.push("");
        bugNumber++;
      });
    }

    // Add metadata at the end
    lines.push("---");
    lines.push(
      `_Last detected: ${new Date().toISOString()} (Game: ${result.gameId})_`,
    );

    const tmpPath = bugsFilePath + ".tmp";
    writeFileSync(tmpPath, lines.join("\n"));
    renameSync(tmpPath, bugsFilePath);
  } catch (error) {
    console.error("Failed to update POKER_BUGS.md:", error);
  }
}
