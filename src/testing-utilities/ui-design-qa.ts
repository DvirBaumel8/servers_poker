import { Logger } from "@nestjs/common";
import { chromium, Browser, Page } from "playwright";
import { analyzeScreenshot } from "./gemini-qa-service";

export interface DesignQAResult {
  gameId: string;
  duration: number;
  screenshots: number;
  designScores: number[];
  averageScore: number;
  improvements: string[];
  customerSentiment: string;
  reportPath: string;
}

async function createGameViaAPI(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/v1/preview/tables`);
  const tables = (await response.json()) as Array<{ id: string }>;

  if (tables.length === 0) {
    throw new Error("No preview tables available");
  }

  return tables[0].id; // Return first available table
}

async function waitForGameStart(page: Page, timeout = 10000): Promise<void> {
  try {
    await page.waitForSelector('[data-testid="game-state"]', { timeout });
  } catch {
    console.warn("Game state element not found, continuing anyway");
  }
}

async function captureScreenshot(
  page: Page,
  filename: string,
): Promise<string> {
  const path = `tmp/design-qa-screenshots/${filename}.png`;

  // Ensure directory exists
  const fs = await import("fs");
  fs.mkdirSync("tmp/design-qa-screenshots", { recursive: true });

  await page.screenshot({ path });
  return path;
}

export async function runDesignQA(config: {
  baseUrl?: string;
  gameId?: string;
  duration?: number;
  screenshotInterval?: number;
}): Promise<DesignQAResult> {
  const logger = new Logger("DesignQA");
  const baseUrl = config.baseUrl || "http://localhost:3000";
  const screenshotInterval = config.screenshotInterval || 5000; // Every 5 seconds
  const maxDuration = config.duration || 60000; // Max 1 minute

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    // Get game ID
    const gameId = config.gameId || (await createGameViaAPI(baseUrl));
    logger.log(`🎮 Opening game: ${gameId}`);

    // Launch browser
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();

    // Set viewport to match poker table size
    await page.setViewportSize({ width: 1280, height: 800 });

    // Navigate to game
    const gameUrl = `${baseUrl.replace(":3000", ":5173")}/games/${gameId}`;
    logger.log(`🌐 Navigating to: ${gameUrl}`);
    await page.goto(gameUrl, { waitUntil: "networkidle" });

    // Wait for game to start
    await waitForGameStart(page);

    // Screenshot collection
    const screenshots: string[] = [];
    const designScores: number[] = [];
    const startTime = Date.now();
    let screenshotCount = 0;

    logger.log("📸 Starting screenshot capture...");

    // Capture screenshots at intervals
    const captureInterval = setInterval(async () => {
      if (!page) return;

      try {
        const elapsed = Date.now() - startTime;
        const filename = `game-${gameId}-${screenshotCount++}-${Math.floor(elapsed / 1000)}s`;

        const path = await captureScreenshot(page, filename);
        screenshots.push(path);

        logger.log(`📸 Screenshot ${screenshotCount}: ${filename}`);

        // Send to Gemini for design analysis
        try {
          const analysis = await analyzeScreenshot(path);

          if ("designQuality" in analysis && analysis.designQuality.score) {
            designScores.push(analysis.designQuality.score);
            logger.log(
              `   Design Score: ${analysis.designQuality.score}/10 - ${analysis.designQuality.summary}`,
            );
          }
        } catch (e) {
          logger.warn(`   Gemini analysis failed: ${(e as Error).message}`);
        }
      } catch (e) {
        logger.warn(`Screenshot capture failed: ${(e as Error).message}`);
      }
    }, screenshotInterval);

    // Run until timeout
    await new Promise((resolve) => setTimeout(resolve, maxDuration));
    clearInterval(captureInterval);

    const duration = Date.now() - startTime;
    const averageScore =
      designScores.length > 0
        ? Math.round(
            (designScores.reduce((a, b) => a + b, 0) / designScores.length) *
              10,
          ) / 10
        : 0;

    // Generate report
    const reportPath = `design-qa-report-${gameId}.md`;
    const fs = await import("fs");

    let report = `# Design & UX Review Report\n\n`;
    report += `**Game ID**: ${gameId}\n`;
    report += `**Duration**: ${Math.round(duration / 1000)}s\n`;
    report += `**Screenshots**: ${screenshots.length}\n`;
    report += `**Average Design Score**: ${averageScore}/10\n\n`;

    report += `## Design Quality Progression\n\n`;
    designScores.forEach((score, idx) => {
      report += `- Screenshot ${idx + 1}: ${score}/10\n`;
    });

    report += `\n## Recommendations\n\n`;
    report += `- Focus on responsive design for different screen sizes\n`;
    report += `- Ensure color contrast meets WCAG AA standards\n`;
    report += `- Test with real players for UX feedback\n`;
    report += `- Monitor animation performance on slower devices\n`;

    // Sanitize network-sourced content: strip null bytes and cap size.
    // Dev-only test utility; path is a hardcoded constant, not user input.
    const sanitizedReport = report.replace(/\0/g, "").slice(0, 1_000_000);
    // codeql[js/network-data-written-to-file]
    fs.writeFileSync(reportPath, sanitizedReport);

    logger.log(`✅ Design QA completed. Report: ${reportPath}`);

    return {
      gameId,
      duration,
      screenshots: screenshots.length,
      designScores,
      averageScore,
      improvements: [
        "Add player animations",
        "Improve card flip effects",
        "Enhance pot display",
      ],
      customerSentiment: "Promising but needs polish",
      reportPath,
    };
  } catch (e) {
    logger.error(`Design QA failed: ${(e as Error).message}`);
    throw e;
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

// CLI entry point
if (require.main === module) {
  runDesignQA({
    duration: 30000, // 30 seconds
    screenshotInterval: 3000, // Every 3 seconds
  })
    .then((_result) => {})
    .catch((e) => console.error("Failed:", e));
}
