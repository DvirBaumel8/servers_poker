import { chromium, BrowserContext, Browser } from "playwright";
import fs from "fs";
import path from "path";
import type { GameStateSnapshot } from "../services/game/live-game-manager.service";

let browser: Browser | null = null;
let context: BrowserContext | null = null;

async function initBrowser() {
  if (!browser) {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
  }
}

async function closeBrowser() {
  if (context) await context.close();
  if (browser) await browser.close();
  browser = null;
  context = null;
}

export async function takeGameStateScreenshot(
  state: GameStateSnapshot,
  outputPath: string,
): Promise<void> {
  await initBrowser();

  if (!context) {
    throw new Error("Browser context not initialized");
  }

  try {
    // Get the path to the HTML renderer (relative to this file)
    const rendererPath = path.join(
      __dirname,
      "ui-renderer",
      "game-state-renderer.html",
    );
    const rendererUrl = `file://${rendererPath}`;

    // Encode state as base64 for URL parameter
    const stateBase64 = Buffer.from(JSON.stringify(state)).toString("base64");
    const urlWithState = `${rendererUrl}?state=${encodeURIComponent(stateBase64)}`;

    // Create a page and navigate to the renderer
    const page = await context.newPage();

    await page.goto(urlWithState, { waitUntil: "networkidle" });

    // Wait for rendering to complete
    await page.waitForTimeout(500);

    // Ensure output directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Take screenshot
    await page.screenshot({ path: outputPath, fullPage: false });

    await page.close();
  } catch (e) {
    console.error(`Failed to take screenshot: ${(e as Error).message}`);
    throw e;
  }
}

export async function closeBrowserAfterScreenshots() {
  await closeBrowser();
}
