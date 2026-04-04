/**
 * UI Bug Reporter
 * Takes screenshots during live gameplay and automatically detects UI bugs with Gemini
 */

import { config as loadEnv } from "dotenv";
import { chromium } from "playwright";
import { detectUIBugs, generateBugReport } from "./ui-bug-detector";
import { mkdirSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";

// Load environment variables
loadEnv({ path: ".env" });

export interface BugReporterConfig {
  gameId: string;
  gameUrl: string;
  duration?: number; // milliseconds, default 15000
  screenshotInterval?: number; // milliseconds, default 5000
}

export async function runBugDetection(
  config: BugReporterConfig,
): Promise<void> {
  const duration = config.duration || 15000;
  const interval = config.screenshotInterval || 5000;
  const startTime = Date.now();
  const screenshots: string[] = [];

  // Create screenshot directory (single folder, clear old screenshots)
  const screenshotDir = join(process.cwd(), "tmp", "bug-detection-screenshots");
  mkdirSync(screenshotDir, { recursive: true });

  // Delete previous screenshots
  try {
    const files = readdirSync(screenshotDir);
    files.forEach((file) => {
      unlinkSync(join(screenshotDir, file));
    });
  } catch (error) {
    // Directory might be empty, that's fine
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();

    // Increase viewport for better screenshot quality
    await page.setViewportSize({ width: 1280, height: 800 });

    // Navigate to game
    await page.goto(config.gameUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000); // Wait for initial render

    let screenshotCount = 0;

    // Take screenshots periodically
    while (Date.now() - startTime < duration) {
      try {
        screenshotCount++;
        const timestamp = Date.now() - startTime;
        const screenshotPath = join(
          screenshotDir,
          `screenshot-${screenshotCount}-${timestamp}ms.png`,
        );

        await page.screenshot({ path: screenshotPath, fullPage: false });
        screenshots.push(screenshotPath);
      } catch (error) {
        console.error("Failed to take screenshot:", error);
      }

      // Wait before next screenshot
      await page.waitForTimeout(interval);
    }

    const gameState = {
      gameId: config.gameId,
      timestamp: new Date().toISOString(),
    };

    // Detect bugs
    const bugs = await detectUIBugs(screenshots, gameState);

    // Generate report
    const _report = generateBugReport(config.gameId, bugs);
  } finally {
    await browser.close();
  }
}

// CLI usage
if (require.main === module) {
  const gameIdArg = process.argv[2];
  const gameUrlArg = process.argv[3];
  const duration = parseInt(process.argv[4] || "15000");

  if (gameIdArg && gameUrlArg) {
    // Use provided gameId and URL
    runBugDetection({
      gameId: gameIdArg,
      gameUrl: gameUrlArg,
      duration,
      screenshotInterval: 5000,
    }).catch(console.error);
  } else {
    // Create a live game first
    fetch("http://localhost:3000/api/v1/testing/live-game", { method: "POST" })
      .then((res) => res.json())
      .then(((data: { gameId?: string }) => {
        if (!data.gameId) {
          throw new Error("Failed to create game: " + JSON.stringify(data));
        }

        // Wait for game to start, then run detection
        setTimeout(() => {
          runBugDetection({
            gameId: data.gameId!,
            gameUrl: `http://localhost:5173/games/${data.gameId}`,
            duration,
            screenshotInterval: 5000,
          }).catch(console.error);
        }, 5000);
      }) as any)
      .catch((err: Error) => {
        console.error("❌ Failed to create game:", err.message);
        process.exit(1);
      });
  }
}
